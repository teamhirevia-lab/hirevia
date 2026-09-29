const { queryOne, queryAll } = require("../config/postgres")
const { mapMockInterview } = require("../utils/serialize")
const {
    cacheMock,
    getCachedMock,
    invalidateMock,
} = require("../services/cache.service")

async function createMockInterview({
    userId,
    interviewReportId,
    questions,
    currentSection = null,
}) {
    const row = await queryOne(
        `
        INSERT INTO mock_interview_reports (
            user_id,
            interview_report_id,
            questions,
            current_section,
            overall_feedback
        )
        VALUES ($1, $2, $3::jsonb, $4, $5)
        RETURNING *
        `,
        [
            userId,
            interviewReportId,
            JSON.stringify(questions || { technical: [], behavioral: [] }),
            currentSection,
            "Mock interview started.",
        ]
    )

    const mock = mapMockInterview(row)
    await cacheMock(mock)
    return mock
}

async function findByIdForUser(id, userId, interviewReportId) {
    const cached = await getCachedMock(id)
    if (
        cached
        && cached.user === userId
        && cached.interviewReport === interviewReportId
    ) {
        return cached
    }

    const row = await queryOne(
        `
        SELECT *
        FROM mock_interview_reports
        WHERE id = $1 AND user_id = $2 AND interview_report_id = $3
        LIMIT 1
        `,
        [id, userId, interviewReportId]
    )

    const mock = mapMockInterview(row)
    if (mock) await cacheMock(mock)
    return mock
}

async function findAllByInterview(interviewReportId, userId) {
    const rows = await queryAll(
        `
        SELECT
            id,
            user_id,
            interview_report_id,
            current_section,
            current_question_index,
            completed_sections,
            overall_score,
            status,
            completed_at,
            created_at,
            updated_at,
            CASE
                WHEN jsonb_typeof(answers) = 'array' THEN jsonb_array_length(answers)
                ELSE 0
            END AS answer_count
        FROM mock_interview_reports
        WHERE interview_report_id = $1 AND user_id = $2
        ORDER BY created_at DESC
        `,
        [interviewReportId, userId]
    )

    return rows.map((row) => mapMockInterview(row, { slim: true }))
}

async function updateMockInterview(id, userId, interviewReportId, fields) {
    const current = await findByIdForUser(id, userId, interviewReportId)
    if (!current) return null

    const next = {
        questions: fields.questions ?? current.questions,
        answers: fields.answers ?? current.answers,
        currentSection: fields.currentSection !== undefined
            ? fields.currentSection
            : current.currentSection,
        currentQuestionIndex: fields.currentQuestionIndex !== undefined
            ? fields.currentQuestionIndex
            : current.currentQuestionIndex,
        completedSections: fields.completedSections ?? current.completedSections,
        overallScore: fields.overallScore ?? current.overallScore,
        overallFeedback: fields.overallFeedback ?? current.overallFeedback,
        presentationSummary: fields.presentationSummary !== undefined
            ? fields.presentationSummary
            : current.presentationSummary,
        status: fields.status ?? current.status,
        completedAt: fields.completedAt !== undefined
            ? fields.completedAt
            : current.completedAt,
    }

    const row = await queryOne(
        `
        UPDATE mock_interview_reports
        SET
            questions = $4::jsonb,
            answers = $5::jsonb,
            current_section = $6,
            current_question_index = $7,
            completed_sections = $8::jsonb,
            overall_score = $9,
            overall_feedback = $10,
            presentation_summary = $11::jsonb,
            status = $12,
            completed_at = $13
        WHERE id = $1 AND user_id = $2 AND interview_report_id = $3
        RETURNING *
        `,
        [
            id,
            userId,
            interviewReportId,
            JSON.stringify(next.questions || { technical: [], behavioral: [] }),
            JSON.stringify(next.answers || []),
            next.currentSection ?? null,
            next.currentQuestionIndex ?? 0,
            JSON.stringify(next.completedSections || []),
            next.overallScore ?? 0,
            next.overallFeedback || "",
            next.presentationSummary == null
                ? null
                : JSON.stringify(next.presentationSummary),
            next.status,
            next.completedAt || null,
        ]
    )

    const mock = mapMockInterview(row)
    if (mock) await cacheMock(mock)
    return mock
}

async function deleteByIdForUser(id, userId, interviewReportId) {
    const row = await queryOne(
        `
        DELETE FROM mock_interview_reports
        WHERE id = $1 AND user_id = $2 AND interview_report_id = $3
        RETURNING id
        `,
        [id, userId, interviewReportId]
    )

    if (row) await invalidateMock(id)
    return Boolean(row)
}

module.exports = {
    createMockInterview,
    findByIdForUser,
    findAllByInterview,
    updateMockInterview,
    deleteByIdForUser,
}
