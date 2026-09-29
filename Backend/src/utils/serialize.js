function mapUser(row) {
    if (!row) return null

    return {
        _id: row.id,
        id: row.id,
        username: row.username,
        email: row.email,
        phone: row.phone || "",
        role: row.role === "admin" ? "admin" : "user",
        reportLimitMonthly: row.report_limit_monthly == null ? null : Number(row.report_limit_monthly),
        mockLimitMonthly: row.mock_limit_monthly == null ? null : Number(row.mock_limit_monthly),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }
}

function mapInterviewReport(row, { slim = false } = {}) {
    if (!row) return null

    const base = {
        _id: row.id,
        id: row.id,
        user: row.user_id,
        title: row.title,
        matchScore: row.match_score == null ? null : Number(row.match_score),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }

    if (slim) {
        return {
            ...base,
            skillGaps: row.skill_gaps || [],
        }
    }

    return {
        ...base,
        jobDescription: row.job_description,
        resume: row.resume,
        selfDescription: row.self_description,
        company: row.company || "",
        jobProfile: row.job_profile || "",
        yearsOfExperience: row.years_of_experience == null ? null : Number(row.years_of_experience),
        interviewWindow: row.interview_window || "",
        companyResearch: row.company_research || null,
        technicalQuestions: row.technical_questions || [],
        behavioralQuestions: row.behavioral_questions || [],
        skillGaps: row.skill_gaps || [],
        preparationPlan: row.preparation_plan || [],
        validation: row.validation,
    }
}

function mapMockInterview(row, { slim = false } = {}) {
    if (!row) return null

    const base = {
        _id: row.id,
        id: row.id,
        user: row.user_id,
        interviewReport: row.interview_report_id,
        currentSection: row.current_section,
        currentQuestionIndex: row.current_question_index ?? 0,
        completedSections: row.completed_sections || [],
        overallScore: row.overall_score ?? 0,
        status: row.status,
        completedAt: row.completed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }

    if (slim) {
        return {
            ...base,
            answerCount: Number(row.answer_count ?? 0),
        }
    }

    return {
        ...base,
        questions: row.questions || { technical: [], behavioral: [] },
        answers: row.answers || [],
        overallFeedback: row.overall_feedback || "",
        presentationSummary: row.presentation_summary,
    }
}

module.exports = {
    mapUser,
    mapInterviewReport,
    mapMockInterview,
}
