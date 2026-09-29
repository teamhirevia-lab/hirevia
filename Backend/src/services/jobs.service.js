const { queryOne, queryAll } = require("../config/postgres")
const { generateInterviewReport } = require("./ai.service")
const interviewReportRepository = require("../repositories/interviewReport.repository")
const quotaService = require("./quota.service")
const { classifyGeminiError, shouldRefundQuota, logResources } = require("../utils/observability")
const { runWithContext } = require("../utils/requestContext")

let processing = false
let timer = null

async function findJobByIdempotency(userId, kind, idempotencyKey) {
    if (!idempotencyKey) return null
    return queryOne(
        `
        SELECT * FROM generation_jobs
        WHERE user_id = $1 AND kind = $2 AND idempotency_key = $3
        LIMIT 1
        `,
        [userId, kind, idempotencyKey]
    )
}

async function findJobByIdForUser(id, userId) {
    return queryOne(
        `SELECT * FROM generation_jobs WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [id, userId]
    )
}

async function enqueueReportJob({ userId, request, idempotencyKey, quotaEventId }) {
    const existing = await findJobByIdempotency(userId, "report", idempotencyKey)
    if (existing) return { job: existing, replay: true }

    try {
        const row = await queryOne(
            `
            INSERT INTO generation_jobs (
                user_id, kind, status, request, quota_event_id, idempotency_key
            )
            VALUES ($1, 'report', 'queued', $2::jsonb, $3, $4)
            RETURNING *
            `,
            [userId, JSON.stringify(request), quotaEventId, idempotencyKey]
        )

        kick()
        return { job: row, replay: false }
    } catch (err) {
        if (err?.code === "23505" && idempotencyKey) {
            const existing = await findJobByIdempotency(userId, "report", idempotencyKey)
            if (existing) return { job: existing, replay: true }
        }
        throw err
    }
}

async function markJob(id, patch) {
    return queryOne(
        `
        UPDATE generation_jobs
        SET
            status = COALESCE($2, status),
            result_id = COALESCE($3, result_id),
            error = COALESCE($4, error),
            error_class = COALESCE($5, error_class),
            started_at = CASE WHEN $2 = 'running' THEN NOW() ELSE started_at END,
            finished_at = CASE WHEN $2 IN ('succeeded', 'failed') THEN NOW() ELSE finished_at END
        WHERE id = $1
        RETURNING *
        `,
        [id, patch.status || null, patch.resultId || null, patch.error || null, patch.errorClass || null]
    )
}

async function claimNextJob() {
    const queued = await queryAll(
        `
        SELECT id FROM generation_jobs
        WHERE status = 'queued' AND kind = 'report'
        ORDER BY created_at ASC
        LIMIT 1
        `
    )
    if (!queued[0]) return null

    return queryOne(
        `
        UPDATE generation_jobs
        SET status = 'running', started_at = NOW()
        WHERE id = $1 AND status = 'queued'
        RETURNING *
        `,
        [queued[0].id]
    )
}

async function runReportJob(job) {
    const request = job.request || {}
    await runWithContext({
        userId: job.user_id,
        correlationId: request.correlationId || job.id,
        route: "job:report",
    }, async () => {
        try {
            const generated = await generateInterviewReport({
                resume: request.resume,
                selfDescription: request.selfDescription,
                jobDescription: request.jobDescription,
                company: request.company,
                jobProfile: request.jobProfile,
                yearsOfExperience: request.yearsOfExperience,
                interviewWindow: request.interviewWindow,
            })

            const interviewReport = await interviewReportRepository.createInterviewReport({
                userId: job.user_id,
                resume: request.resume,
                selfDescription: request.selfDescription,
                jobDescription: request.jobDescription,
                company: request.company,
                jobProfile: request.jobProfile,
                yearsOfExperience: request.yearsOfExperience,
                interviewWindow: request.interviewWindow,
                ...generated,
            })

            await quotaService.complete(job.quota_event_id, {
                resultId: interviewReport.id,
                jobId: job.id,
            })
            await markJob(job.id, { status: "succeeded", resultId: interviewReport.id })
            logResources("job:report:success")
        } catch (err) {
            const errorClass = classifyGeminiError(err)
            if (shouldRefundQuota(err) || !err?.resultPersisted) {
                await quotaService.refund(job.quota_event_id, errorClass)
            }
            await markJob(job.id, {
                status: "failed",
                error: err?.message || "Generation failed",
                errorClass,
            })
            logResources("job:report:failed")
        }
    })
}

async function processNextJob() {
    if (processing) return
    processing = true
    try {
        const job = await claimNextJob()
        if (!job) return
        await runReportJob(job)
    } catch (err) {
        console.error("JOB WORKER ERROR:", err?.code || err?.name || err?.message)
    } finally {
        processing = false
    }
}

function kick() {
    setImmediate(() => {
        processNextJob().catch(() => {})
    })
}

function startJobWorker() {
    if (timer) return
    kick()
    timer = setInterval(() => {
        processNextJob().catch(() => {})
    }, 1500)
    if (typeof timer.unref === "function") timer.unref()
}

module.exports = {
    findJobByIdempotency,
    findJobByIdForUser,
    enqueueReportJob,
    startJobWorker,
    kick,
}
