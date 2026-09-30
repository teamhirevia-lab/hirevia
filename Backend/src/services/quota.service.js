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

function periodKey(date) {
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, "0")
    const day = String(date.getUTCDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

function addUtcMonths(date, months) {
    const day = date.getUTCDate()
    const shifted = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth() + months,
        1,
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds(),
        date.getUTCMilliseconds()
    ))
    const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate()
    shifted.setUTCDate(Math.min(day, lastDay))
    return shifted
}

function quotaWindow(anchorInput, now = new Date()) {
    const parsed = anchorInput ? new Date(anchorInput) : now
    const anchor = Number.isNaN(parsed.getTime()) ? now : parsed

    if (now < anchor) {
        return { start: anchor, end: addUtcMonths(anchor, 1), period: periodKey(anchor) }
    }

    let low = 0
    let high = 1
    while (addUtcMonths(anchor, high) <= now && high < 2400) {
        low = high
        high *= 2
    }
    while (low + 1 < high) {
        const mid = Math.floor((low + high) / 2)
        if (addUtcMonths(anchor, mid) <= now) low = mid
        else high = mid
    }

    const start = addUtcMonths(anchor, low)
    const end = addUtcMonths(anchor, low + 1)
    return { start, end, period: periodKey(start) }
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

async function grantsForPeriod(userId, kind, window) {
    if (kind === "pdf") return 0
    const row = await queryOne(
        `
        SELECT COALESCE(SUM(amount), 0)::int AS n
        FROM quota_grants
        WHERE user_id = $1 AND kind = $2
          AND created_at >= $3 AND created_at < $4
        `,
        [userId, kind, window.start, window.end]
    )
    return Number(row?.n || 0)
}

async function countActiveEvents(userId, kind, window, client = null) {
    const run = client
        ? (text, params) => client.query(text, params).then((r) => r.rows[0] || null)
        : queryOne
    const row = await run(
        `
        SELECT COUNT(*)::int AS n
        FROM quota_usage_events
        WHERE user_id = $1 AND kind = $2
          AND status IN ('reserved', 'completed')
          AND created_at >= $3 AND created_at < $4
        `,
        [userId, kind, window.start, window.end]
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
    const window = quotaWindow(user.created_at)
    const period = window.period
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
        countActiveEvents(userId, "report", window),
        countActiveEvents(userId, "mock", window),
        countActiveEvents(userId, "pdf", window),
        countAll("interview_reports", userId),
        countAll("mock_interview_reports", userId),
        grantsForPeriod(userId, "report", window),
        grantsForPeriod(userId, "mock", window),
    ])

    const quota = {
        period,
        renewsAt: window.end.toISOString(),
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
        const window = quotaWindow(user.created_at)
        const period = window.period
        const { reportCap, mockCap, pdfCap } = await capsForUser(user, settings)
        const cap = kind === "mock" ? mockCap : kind === "pdf" ? pdfCap : reportCap
        const granted = await grantsForPeriod(userId, kind, window)
        const used = await countActiveEvents(userId, kind, window, client)

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

async function addGrant({ userId, kind, amount, period }) {
    if (!period) {
        const user = await userRepository.findById(userId)
        period = quotaWindow(user?.created_at).period
    }
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

function inWindow(value, window) {
    const time = new Date(value).getTime()
    return time >= window.start.getTime() && time < window.end.getTime()
}

async function listUsersWithQuota() {
    const settings = await getSettings()
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
            COALESCE(life.mocks_lifetime, 0) AS mocks_lifetime
        FROM users u
        LEFT JOIN LATERAL (
            SELECT
                (SELECT COUNT(*)::int FROM interview_reports ir WHERE ir.user_id = u.id) AS reports_lifetime,
                (SELECT COUNT(*)::int FROM mock_interview_reports mr WHERE mr.user_id = u.id) AS mocks_lifetime
        ) life ON TRUE
        ORDER BY u.created_at DESC
        `
    )
    const events = await queryAll(
        `
        SELECT user_id, kind, created_at
        FROM quota_usage_events
        WHERE status IN ('reserved', 'completed')
          AND created_at >= NOW() - INTERVAL '40 days'
        `
    )
    const grants = await queryAll(
        `
        SELECT user_id, kind, amount, created_at
        FROM quota_grants
        WHERE created_at >= NOW() - INTERVAL '40 days'
        `
    )

    return rows.map((row) => {
        const window = quotaWindow(row.created_at)
        const isAdmin = row.role === "admin"
        const reportCap = isAdmin ? ADMIN_CAPS.report : settings.reportLimitMonthly
        const mockCap = isAdmin ? ADMIN_CAPS.mock : settings.mockLimitMonthly
        const used = { report: 0, mock: 0 }
        const granted = { report: 0, mock: 0 }
        for (const event of events) {
            if (event.user_id !== row.id || !inWindow(event.created_at, window)) continue
            if (event.kind === "report" || event.kind === "mock") used[event.kind] += 1
        }
        for (const grant of grants) {
            if (grant.user_id !== row.id || !inWindow(grant.created_at, window)) continue
            if (grant.kind === "report" || grant.kind === "mock") granted[grant.kind] += Number(grant.amount) || 0
        }
        const reports = toBucket({ used: used.report, cap: reportCap, granted: granted.report })
        const mocks = toBucket({ used: used.mock, cap: mockCap, granted: granted.mock })

        return {
            id: row.id,
            username: row.username,
            email: row.email,
            role: isAdmin ? "admin" : "user",
            createdAt: row.created_at,
            lastLoginAt: row.last_login_at,
            period: window.period,
            renewsAt: window.end.toISOString(),
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
    const bounds = monthBounds()
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
        WHERE created_at >= $1 AND created_at < $2
        `,
        [bounds.start, bounds.end]
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
    quotaWindow,
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
