const { queryOne, queryAll, withTransaction } = require("../config/postgres")
const userRepository = require("../repositories/user.repository")
const {
    getCachedQuota,
    cacheQuota,
    invalidateQuota,
    invalidateAllQuotas,
} = require("./cache.service")

const ADMIN_CAPS = {
    report: 50,
    mock: 20,
    pdf: 20,
}

const DEFAULT_PDF_CAP = 5
const STALE_RESERVED_MINUTES = 20

function currentPeriod(date = new Date()) {
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, "0")
    return `${year}-${month}`
}

function monthBounds(date = new Date()) {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
    return { start, end }
}

function toBucket({ used, cap, granted }) {
    const remaining = Math.max(0, Number(cap) + Number(granted) - Number(used))
    return {
        used: Number(used) || 0,
        cap: Number(cap) || 0,
        granted: Number(granted) || 0,
        remaining,
    }
}

function quotaError(message, status, quota = null) {
    const err = new Error(message)
    err.code = "QUOTA"
    err.status = status
    err.quota = quota
    return err
}

async function getSettings() {
    const row = await queryOne(`SELECT * FROM app_settings WHERE id = 1`)
    return {
        reportLimitMonthly: Number(row?.report_limit_monthly ?? 5),
        mockLimitMonthly: Number(row?.mock_limit_monthly ?? 3),
        pdfLimitMonthly: DEFAULT_PDF_CAP,
    }
}

async function updateSettings({ reportLimitMonthly, mockLimitMonthly }) {
    const row = await queryOne(
        `
        UPDATE app_settings
        SET report_limit_monthly = $1, mock_limit_monthly = $2, updated_at = NOW()
        WHERE id = 1
        RETURNING *
        `,
        [reportLimitMonthly, mockLimitMonthly]
    )
    await invalidateAllQuotas()
    return {
        reportLimitMonthly: Number(row.report_limit_monthly),
        mockLimitMonthly: Number(row.mock_limit_monthly),
        pdfLimitMonthly: DEFAULT_PDF_CAP,
    }
}

async function countAll(table, userId) {
    const row = await queryOne(
        `SELECT COUNT(*)::int AS n FROM ${table} WHERE user_id = $1`,
        [userId]
    )
    return Number(row?.n || 0)
}

async function grantsForPeriod(userId, kind, period) {
    if (kind === "pdf") return 0
    const row = await queryOne(
        `
        SELECT COALESCE(SUM(amount), 0)::int AS n
        FROM quota_grants
        WHERE user_id = $1 AND kind = $2 AND period = $3
        `,
        [userId, kind, period]
    )
    return Number(row?.n || 0)
}

async function countActiveEvents(userId, kind, period, client = null) {
    const run = client
        ? (text, params) => client.query(text, params).then((r) => r.rows[0] || null)
        : queryOne
    const row = await run(
        `
        SELECT COUNT(*)::int AS n
        FROM quota_usage_events
        WHERE user_id = $1 AND kind = $2 AND period = $3
          AND status IN ('reserved', 'completed')
        `,
        [userId, kind, period]
    )
    return Number(row?.n || 0)
}

async function capsForUser(user, settings) {
    const isAdmin = user.role === "admin"
    const reportCap = isAdmin ? ADMIN_CAPS.report : settings.reportLimitMonthly
    const mockCap = isAdmin ? ADMIN_CAPS.mock : settings.mockLimitMonthly
    const pdfCap = isAdmin ? ADMIN_CAPS.pdf : DEFAULT_PDF_CAP
    return { reportCap, mockCap, pdfCap, isAdmin }
}

async function buildQuota(userId, { skipCache = false } = {}) {
    if (!skipCache) {
        const cached = await getCachedQuota(userId)
        if (cached) return cached
    }

    const user = await userRepository.findById(userId)
    if (!user) return null

    const settings = await getSettings()
    const period = currentPeriod()
    const { reportCap, mockCap, pdfCap } = await capsForUser(user, settings)

    const [
        reportsUsed,
        mocksUsed,
        pdfsUsed,
        reportsLifetime,
        mocksLifetime,
        reportGranted,
        mockGranted,
    ] = await Promise.all([
        countActiveEvents(userId, "report", period),
        countActiveEvents(userId, "mock", period),
        countActiveEvents(userId, "pdf", period),
        countAll("interview_reports", userId),
        countAll("mock_interview_reports", userId),
        grantsForPeriod(userId, "report", period),
        grantsForPeriod(userId, "mock", period),
    ])

    const quota = {
        period,
        role: user.role === "admin" ? "admin" : "user",
        reports: toBucket({ used: reportsUsed, cap: reportCap, granted: reportGranted }),
        mocks: toBucket({ used: mocksUsed, cap: mockCap, granted: mockGranted }),
        pdfs: toBucket({ used: pdfsUsed, cap: pdfCap, granted: 0 }),
        lifetime: {
            reports: reportsLifetime,
            mocks: mocksLifetime,
        },
        inherited: {
            reports: true,
            mocks: true,
        },
    }

    await cacheQuota(userId, quota)
    return quota
}

async function getQuotaForUser(userId) {
    return buildQuota(userId)
}

async function sweepStaleReserved(maxAgeMinutes = STALE_RESERVED_MINUTES) {
    const rows = await queryAll(
        `
        UPDATE quota_usage_events
        SET status = 'refunded', error_class = 'crash_swept', finalized_at = NOW()
        WHERE status = 'reserved'
          AND created_at < NOW() - ($1 || ' minutes')::interval
        RETURNING user_id
        `,
        [String(maxAgeMinutes)]
    )

    const userIds = [...new Set(rows.map((row) => row.user_id))]
    await Promise.all(userIds.map((id) => invalidateQuota(id)))

    if (rows.length) {
        await queryAll(
            `
            UPDATE generation_jobs
            SET status = 'failed', error = 'Reservation expired', error_class = 'crash_swept', finished_at = NOW()
            WHERE status IN ('queued', 'running')
              AND created_at < NOW() - ($1 || ' minutes')::interval
            `,
            [String(maxAgeMinutes)]
        )
    }

    return rows.length
}

async function reserve({ userId, kind, idempotencyKey = null, jobId = null }) {
    await sweepStaleReserved()

    const user = await userRepository.findById(userId)
    if (!user) throw quotaError("Account not found", 404)

    return withTransaction(async (client) => {
        await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId])

        if (idempotencyKey) {
            const existing = await client.query(
                `
                SELECT * FROM quota_usage_events
                WHERE user_id = $1 AND kind = $2 AND idempotency_key = $3
                LIMIT 1
                `,
                [userId, kind, idempotencyKey]
            )
            if (existing.rows[0]) {
                return { event: existing.rows[0], replay: true, quota: await buildQuota(userId, { skipCache: true }) }
            }
        }

        const settings = await getSettings()
        const period = currentPeriod()
        const { reportCap, mockCap, pdfCap } = await capsForUser(user, settings)
        const cap = kind === "mock" ? mockCap : kind === "pdf" ? pdfCap : reportCap
        const granted = await grantsForPeriod(userId, kind, period)
        const used = await countActiveEvents(userId, kind, period, client)

        if (used >= cap + granted) {
            const quota = await buildQuota(userId, { skipCache: true })
            const label = kind === "mock"
                ? "mock interviews"
                : kind === "pdf"
                    ? "resume downloads"
                    : "interview reports"
            throw quotaError(
                `Monthly ${label} limit reached (${used} of ${cap + granted}). Ask an admin to add more for this month.`,
                403,
                quota
            )
        }

        const inserted = await client.query(
            `
            INSERT INTO quota_usage_events (user_id, period, kind, status, idempotency_key, job_id)
            VALUES ($1, $2, $3, 'reserved', $4, $5)
            RETURNING *
            `,
            [userId, period, kind, idempotencyKey, jobId]
        )

        await invalidateQuota(userId)
        return { event: inserted.rows[0], replay: false, quota: await buildQuota(userId, { skipCache: true }) }
    }).catch(async (err) => {
        if (err?.code === "23505" && idempotencyKey) {
            const existing = await queryOne(
                `
                SELECT * FROM quota_usage_events
                WHERE user_id = $1 AND kind = $2 AND idempotency_key = $3
                LIMIT 1
                `,
                [userId, kind, idempotencyKey]
            )
            if (existing) {
                return { event: existing, replay: true, quota: await buildQuota(userId, { skipCache: true }) }
            }
        }
        throw err
    })
}

async function complete(eventId, { resultId = null, jobId = null } = {}) {
    if (!eventId) return null
    const row = await queryOne(
        `
        UPDATE quota_usage_events
        SET status = 'completed',
            result_id = COALESCE($2, result_id),
            job_id = COALESCE($3, job_id),
            finalized_at = NOW()
        WHERE id = $1 AND status = 'reserved'
        RETURNING *
        `,
        [eventId, resultId, jobId]
    )
    if (row) await invalidateQuota(row.user_id)
    return row
}

async function refund(eventId, errorClass = "error") {
    if (!eventId) return null
    const row = await queryOne(
        `
        UPDATE quota_usage_events
        SET status = 'refunded',
            error_class = $2,
            finalized_at = NOW()
        WHERE id = $1 AND status = 'reserved'
        RETURNING *
        `,
        [eventId, errorClass]
    )
    if (row) await invalidateQuota(row.user_id)
    return row
}

async function addGrant({ userId, kind, amount, period = currentPeriod() }) {
    const row = await queryOne(
        `
        INSERT INTO quota_grants (user_id, kind, amount, period)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [userId, kind, amount, period]
    )
    await invalidateQuota(userId)
    return row
}

async function listUsersWithQuota() {
    const settings = await getSettings()
    const period = currentPeriod()
    const rows = await queryAll(
        `
        SELECT
            u.id,
            u.username,
            u.email,
            u.role,
            u.created_at,
            u.last_login_at,
            COALESCE(life.reports_lifetime, 0) AS reports_lifetime,
            COALESCE(life.mocks_lifetime, 0) AS mocks_lifetime,
            COALESCE(usage.reports_month, 0) AS reports_month,
            COALESCE(usage.mocks_month, 0) AS mocks_month,
            COALESCE(grants.report_grants, 0) AS report_grants,
            COALESCE(grants.mock_grants, 0) AS mock_grants
        FROM users u
        LEFT JOIN LATERAL (
            SELECT
                (SELECT COUNT(*)::int FROM interview_reports ir WHERE ir.user_id = u.id) AS reports_lifetime,
                (SELECT COUNT(*)::int FROM mock_interview_reports mr WHERE mr.user_id = u.id) AS mocks_lifetime
        ) life ON TRUE
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*) FILTER (WHERE e.kind = 'report')::int AS reports_month,
                COUNT(*) FILTER (WHERE e.kind = 'mock')::int AS mocks_month
            FROM quota_usage_events e
            WHERE e.user_id = u.id
              AND e.period = $1
              AND e.status IN ('reserved', 'completed')
        ) usage ON TRUE
        LEFT JOIN LATERAL (
            SELECT
                COALESCE(SUM(amount) FILTER (WHERE g.kind = 'report'), 0)::int AS report_grants,
                COALESCE(SUM(amount) FILTER (WHERE g.kind = 'mock'), 0)::int AS mock_grants
            FROM quota_grants g
            WHERE g.user_id = u.id AND g.period = $1
        ) grants ON TRUE
        ORDER BY u.created_at DESC
        `,
        [period]
    )

    return rows.map((row) => {
        const isAdmin = row.role === "admin"
        const reportCap = isAdmin ? ADMIN_CAPS.report : settings.reportLimitMonthly
        const mockCap = isAdmin ? ADMIN_CAPS.mock : settings.mockLimitMonthly
        const reports = toBucket({
            used: row.reports_month,
            cap: reportCap,
            granted: row.report_grants,
        })
        const mocks = toBucket({
            used: row.mocks_month,
            cap: mockCap,
            granted: row.mock_grants,
        })

        return {
            id: row.id,
            username: row.username,
            email: row.email,
            role: isAdmin ? "admin" : "user",
            createdAt: row.created_at,
            lastLoginAt: row.last_login_at,
            period,
            reports,
            mocks,
            lifetime: {
                reports: Number(row.reports_lifetime),
                mocks: Number(row.mocks_lifetime),
            },
        }
    })
}

async function getDashboardStats() {
    const period = currentPeriod()
    const settings = await getSettings()
    const users = await queryOne(
        `
        SELECT
            COUNT(*)::int AS total_accounts,
            COUNT(*) FILTER (WHERE role <> 'admin')::int AS total_users,
            COUNT(*) FILTER (
                WHERE role <> 'admin'
                  AND last_login_at >= NOW() - INTERVAL '7 days'
            )::int AS active_users,
            COUNT(*) FILTER (
                WHERE role <> 'admin'
                  AND last_login_at >= NOW() - INTERVAL '30 days'
            )::int AS active_30d,
            COUNT(*) FILTER (
                WHERE role <> 'admin'
                  AND to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM') = $1
            )::int AS new_this_month
        FROM users
        `,
        [period]
    )
    const usage = await queryOne(
        `
        SELECT
            COUNT(*) FILTER (WHERE kind = 'report' AND status IN ('reserved', 'completed'))::int AS reports_month,
            COUNT(*) FILTER (WHERE kind = 'mock' AND status IN ('reserved', 'completed'))::int AS mocks_month
        FROM quota_usage_events
        WHERE period = $1
        `,
        [period]
    )
    const lifetime = await queryOne(
        `
        SELECT
            (SELECT COUNT(*)::int FROM interview_reports) AS reports_lifetime,
            (SELECT COUNT(*)::int FROM mock_interview_reports) AS mocks_lifetime,
            (SELECT COUNT(*)::int FROM mock_interview_reports WHERE status = 'completed') AS mocks_completed,
            (SELECT COUNT(*)::int FROM feedback_messages) AS feedback_total,
            (SELECT COUNT(*)::int FROM feedback_messages
              WHERE to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM') = $1) AS feedback_month
        `,
        [period]
    )

    return {
        period,
        settings,
        users: {
            total: Number(users?.total_users || 0),
            accounts: Number(users?.total_accounts || 0),
            active: Number(users?.active_users || 0),
            active30d: Number(users?.active_30d || 0),
            newThisMonth: Number(users?.new_this_month || 0),
        },
        usage: {
            reportsMonth: Number(usage?.reports_month || 0),
            mocksMonth: Number(usage?.mocks_month || 0),
            reportsLifetime: Number(lifetime?.reports_lifetime || 0),
            mocksLifetime: Number(lifetime?.mocks_lifetime || 0),
            mocksCompleted: Number(lifetime?.mocks_completed || 0),
            feedbackTotal: Number(lifetime?.feedback_total || 0),
            feedbackMonth: Number(lifetime?.feedback_month || 0),
        },
    }
}

module.exports = {
    currentPeriod,
    getSettings,
    updateSettings,
    getQuotaForUser,
    reserve,
    complete,
    refund,
    addGrant,
    listUsersWithQuota,
    getDashboardStats,
    sweepStaleReserved,
    ADMIN_CAPS,
}
