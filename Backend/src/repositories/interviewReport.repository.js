const { queryOne, queryAll } = require("../config/postgres")

function toScore(value) {
    if (value == null || value === "") return null
    const number = Number(value)
    if (!Number.isFinite(number)) return null
    return Math.round(number * 100) / 100
}
const { mapInterviewReport } = require("../utils/serialize")
const {
    cacheInterview,
    getCachedInterview,
    invalidateInterview,
    invalidateMock,
} = require("../services/cache.service")

async function createInterviewReport({
    userId,
    title,
    jobDescription,
    resume,
    selfDescription,
    company,
    jobProfile,
    yearsOfExperience,
    interviewWindow,
    companyResearch,
    matchScore,
    technicalQuestions,
    behavioralQuestions,
    skillGaps,
    preparationPlan,
    validation,
}) {
    const row = await queryOne(
        `
        INSERT INTO interview_reports (
            user_id,
            title,
            job_description,
            resume,
            self_description,
            company,
            job_profile,
            years_of_experience,
            interview_window,
            company_research,
            match_score,
            technical_questions,
            behavioral_questions,
            skill_gaps,
            preparation_plan,
            validation
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb)
        RETURNING *
        `,
        [
            userId,
            title,
            jobDescription,
            resume || "",
            selfDescription || "",
            company || "",
            jobProfile || "",
            yearsOfExperience == null || yearsOfExperience === "" ? null : Number(yearsOfExperience),
            interviewWindow || "",
            JSON.stringify(companyResearch || null),
            toScore(matchScore),
            JSON.stringify(technicalQuestions || []),
            JSON.stringify(behavioralQuestions || []),
            JSON.stringify(skillGaps || []),
            JSON.stringify(preparationPlan || []),
            JSON.stringify(validation || null),
        ]
    )

    const report = mapInterviewReport(row)
    await cacheInterview(report)
    return report
}

async function findByIdForUser(id, userId) {
    const cached = await getCachedInterview(id)
    if (cached && cached.user === userId) {
        return cached
    }

    const row = await queryOne(
        `SELECT * FROM interview_reports WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [id, userId]
    )
    const report = mapInterviewReport(row)
    if (report) await cacheInterview(report)
    return report
}

async function findAllByUser(userId) {
    const rows = await queryAll(
        `
        SELECT
            id, user_id, title, match_score, skill_gaps, created_at, updated_at
        FROM interview_reports
        WHERE user_id = $1
        ORDER BY created_at DESC
        `,
        [userId]
    )

    return rows.map((row) => mapInterviewReport(row, { slim: true }))
}

async function deleteByIdForUser(id, userId) {
    const mocks = await queryAll(
        `SELECT id FROM mock_interview_reports WHERE interview_report_id = $1 AND user_id = $2`,
        [id, userId]
    )
    const row = await queryOne(
        `DELETE FROM interview_reports WHERE id = $1 AND user_id = $2 RETURNING id`,
        [id, userId]
    )
    if (!row) return false

    await invalidateInterview(id)
    await Promise.all(mocks.map((mock) => invalidateMock(mock.id)))
    return true
}

module.exports = {
    createInterviewReport,
    findByIdForUser,
    findAllByUser,
    deleteByIdForUser,
}
