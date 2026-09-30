const crypto = require("crypto")
const {
    generateMockInterviewReport,
    generateFreshMockQuestions,
    generateFollowUpQuestion,
} = require("../services/ai.service")
const interviewReportRepository = require("../repositories/interviewReport.repository")
const mockInterviewRepository = require("../repositories/mockInterview.repository")
const quotaService = require("../services/quota.service")
const { sendError } = require("../utils/httpError")
const { countFollowUps, shouldCallFollowUpModel } = require("../utils/followUp")
const { classifyGeminiError, geminiClientMessage } = require("../utils/observability")
const { acquireScoreLock, releaseScoreLock } = require("../services/cache.service")

function withQuestionIds(questions) {
    const stamp = (list, section) =>
        (list || []).map((item, index) => ({
            id: item.id || crypto.randomUUID(),
            section,
            question: item.question,
            intention: item.intention || "",
            expectedAnswer: item.expectedAnswer || item.answer || "",
            isFollowUp: Boolean(item.isFollowUp),
            parentQuestionId: item.parentQuestionId || null,
            order: index,
        }))

    return {
        technical: stamp(questions?.technical, "technical"),
        behavioral: stamp(questions?.behavioral, "behavioral"),
    }
}

function nextSectionAfter(section) {
    return section === "technical" ? "behavioral" : "technical"
}

async function createMockInterviewController(req, res) {
    let reservation = null
    try {
        const { interviewId } = req.params

        const interviewReport = await interviewReportRepository.findByIdForUser(
            interviewId,
            req.user.id,
            { include: "resume,research" }
        )

        if (!interviewReport) {
            return res.status(400).json({
                message: "Interview Report does not exist"
            })
        }

        reservation = await quotaService.reserve({
            userId: req.user.id,
            kind: "mock",
        })

        const questions = withQuestionIds(
            await generateFreshMockQuestions({
                resume: interviewReport.resume,
                selfDescription: interviewReport.selfDescription,
                jobDescription: interviewReport.jobDescription,
                skillGaps: interviewReport.skillGaps,
                existingTechnical: interviewReport.technicalQuestions,
                existingBehavioral: interviewReport.behavioralQuestions,
                company: interviewReport.company,
                jobProfile: interviewReport.jobProfile,
                yearsOfExperience: interviewReport.yearsOfExperience,
                companyResearch: interviewReport.companyResearch,
            })
        )

        const mockInterviewReport = await mockInterviewRepository.createMockInterview({
            userId: req.user.id,
            interviewReportId: interviewId,
            questions,
            currentSection: "technical",
        })

        await quotaService.complete(reservation.event.id, { resultId: mockInterviewReport.id })

        res.status(201).json({
            message: "Mock Interview has started",
            mockInterviewReport
        })
    } catch (err) {
        if (reservation?.event?.id) {
            await quotaService.refund(reservation.event.id, classifyGeminiError(err)).catch(() => {})
        }

        if (err.code === "QUOTA") {
            return res.status(err.status).json({
                message: err.message,
                quota: err.quota || null,
            })
        }

        const aiMessage = geminiClientMessage(err)
        if (aiMessage) {
            return sendError(res, 503, aiMessage, {
                err,
                logLabel: "MOCK CREATE ERROR:",
                expose: true,
            })
        }

        if (err?.code === "QUESTION_SET_INCOMPLETE") {
            return sendError(res, 503, "The mock could not be prepared. Your attempt was not kept. Please try again.", {
                err,
                logLabel: "MOCK CREATE ERROR:",
                expose: true,
            })
        }

        const isOverloaded =
            err?.status === 503 ||
            err?.status === 429 ||
            /UNAVAILABLE|high demand|RESOURCE_EXHAUSTED/i.test(String(err?.message || ""))

        if (isOverloaded || err?.code === "GEMINI_TIMEOUT" || err?.code === "GEMINI_PARSE") {
            return sendError(res, 503, "Could not generate a fresh mock. Your quota was not used. Please try again.", {
                err,
                logLabel: "MOCK CREATE ERROR:",
                expose: true,
            })
        }

        return sendError(res, 500, "Failed to start mock interview", {
            err,
            logLabel: "MOCK CREATE ERROR:",
        })
    }
}

async function getAllMockInterviewByInterviewIdController(req, res) {
    const { interviewId } = req.params

    const interviewReport = await interviewReportRepository.findByIdForUser(
        interviewId,
        req.user.id
    )

    if (!interviewReport) {
        return res.status(404).json({
            message: "Interview report not found."
        })
    }

    const mockInterviews = await mockInterviewRepository.findAllByInterview(
        interviewId,
        req.user.id
    )

    res.status(200).json({
        message: "Mock Interviews fetched successfully.",
        mockInterviews
    })
}

async function getMockInterviewByIdController(req, res) {
    const { interviewId, mockId } = req.params

    const mockInterview = await mockInterviewRepository.findByIdForUser(
        mockId,
        req.user.id,
        interviewId
    )

    if (!mockInterview) {
        return res.status(404).json({
            message: "Mock Interview not found."
        })
    }

    res.status(200).json({
        message: "Mock Interview fetched successfully.",
        mockInterview
    })
}

async function deleteMockInterviewByIdController(req, res) {
    const { interviewId, mockId } = req.params

    const deleted = await mockInterviewRepository.deleteByIdForUser(
        mockId,
        req.user.id,
        interviewId
    )

    if (!deleted) {
        return res.status(404).json({
            message: "Mock Interview not found."
        })
    }

    res.status(200).json({
        message: "Mock Interview deleted successfully.",
    })
}

async function generateMockInterviewReportController(req, res) {
    try {
        const { answers } = req.body
        const { interviewId, mockId } = req.params

        if (!answers || answers.length === 0) {
            return res.status(400).json({
                message: "Mock Interview Answers are Required"
            })
        }

        const mockInterviewReport = await mockInterviewRepository.findByIdForUser(
            mockId,
            req.user.id,
            interviewId
        )

        if (!mockInterviewReport) {
            return res.status(400).json({
                message: "Mock Interview Report not found"
            })
        }

        if (mockInterviewReport.status === "completed" && mockInterviewReport.overallFeedback) {
            return res.status(200).json({
                message: "Mock Interview report generated successfully.",
                mockInterviewReport,
            })
        }

        const locked = await acquireScoreLock(mockId)
        if (!locked) {
            return res.status(409).json({
                message: "Scoring is already in progress. Please wait a moment.",
            })
        }

        try {
            const evaluation = await generateMockInterviewReport({ answers })
            const updated = await mockInterviewRepository.updateMockInterview(
                mockId,
                req.user.id,
                interviewId,
                {
                    answers: evaluation.answers,
                    overallFeedback: evaluation.overallFeedback,
                    overallScore: evaluation.overallScore,
                    presentationSummary: evaluation.presentationSummary || null,
                    status: "completed",
                    completedAt: new Date(),
                    currentSection: "",
                    currentQuestionIndex: 0,
                    completedSections: ["technical", "behavioral"],
                }
            )

            res.status(201).json({
                message: "Mock Interview report generated successfully.",
                mockInterviewReport: updated
            })
        } finally {
            await releaseScoreLock(mockId)
        }
    } catch (err) {
        const aiMessage = geminiClientMessage(err)
        if (aiMessage) {
            return sendError(res, 503, aiMessage, {
                err,
                logLabel: "MOCK REPORT ERROR:",
                expose: true,
            })
        }
        if (err?.code === "GEMINI_TIMEOUT" || err?.code === "GEMINI_PARSE" || err?.status === 404) {
            return sendError(res, 503, "Could not score this mock right now. Please try again.", {
                err,
                logLabel: "MOCK REPORT ERROR:",
                expose: true,
            })
        }
        return sendError(res, 500, "Failed to generate mock interview report", {
            err,
            logLabel: "MOCK REPORT ERROR:",
        })
    }
}

async function updateMockInterviewController(req, res) {
    try {
        const { currentSection, currentQuestionIndex, answers, completedSections } = req.body
        const { interviewId, mockId } = req.params

        const mockInterviewReport = await mockInterviewRepository.findByIdForUser(
            mockId,
            req.user.id,
            interviewId
        )

        if (!mockInterviewReport) {
            return res.status(400).json({
                message: "Mock Interview Report not found"
            })
        }

        if (mockInterviewReport.status === "completed") {
            return res.status(200).json({
                message: "Mock Interview already completed.",
                mockInterviewReport
            })
        }

        const updated = await mockInterviewRepository.updateMockInterview(
            mockId,
            req.user.id,
            interviewId,
            {
                answers: answers ?? mockInterviewReport.answers,
                currentSection,
                currentQuestionIndex,
                completedSections,
            }
        )

        res.status(200).json({
            message: "Mock Interview DB Updated successfully.",
            mockInterviewReport: updated
        })
    } catch (err) {
        return sendError(res, 500, "Failed to update mock interview", {
            err,
            logLabel: "MOCK UPDATE ERROR:",
        })
    }
}

async function submitMockAnswerController(req, res) {
    try {
        const { interviewId, mockId } = req.params
        const {
            section,
            questionIndex,
            questionId,
            question,
            expectedAnswer,
            userAnswer,
            videoMetrics,
            duration,
        } = req.body

        if (!section || !userAnswer?.trim()) {
            return res.status(400).json({
                message: "Section and answer are required."
            })
        }

        const mock = await mockInterviewRepository.findByIdForUser(
            mockId,
            req.user.id,
            interviewId
        )

        if (!mock) {
            return res.status(404).json({
                message: "Mock Interview not found"
            })
        }

        if (mock.status === "completed") {
            return res.status(400).json({
                message: "This mock interview is already completed."
            })
        }

        const questions = {
            technical: [...(mock.questions?.technical || [])],
            behavioral: [...(mock.questions?.behavioral || [])],
        }

        const sectionQuestions = questions[section] || []
        const currentQuestion = sectionQuestions[questionIndex] || sectionQuestions.find((q) => q.id === questionId)

        const answerObject = {
            questionId: questionId || currentQuestion?.id || crypto.randomUUID(),
            section,
            questionIndex,
            question: question || currentQuestion?.question,
            expectedAnswer: expectedAnswer || currentQuestion?.expectedAnswer,
            userAnswer,
            videoMetrics: videoMetrics || null,
            duration: Number(duration) || 0,
            isFollowUp: Boolean(currentQuestion?.isFollowUp),
        }

        const answers = (mock.answers || []).filter(
            (item) => !(item.section === section && item.questionIndex === questionIndex)
        )
        answers.push(answerObject)

        let insertedFollowUp = false
        const alreadyFollowUp = Boolean(currentQuestion?.isFollowUp)
        const followUpCount = countFollowUps(questions)

        if (
            !alreadyFollowUp
            && currentQuestion
            && shouldCallFollowUpModel({
                userAnswer,
                expectedAnswer: currentQuestion.expectedAnswer,
                followUpCount,
            })
        ) {
            try {
                const followUp = await generateFollowUpQuestion({
                    section,
                    question: currentQuestion.question,
                    expectedAnswer: currentQuestion.expectedAnswer,
                    userAnswer,
                    previousAnswers: answers,
                })

                if (followUp?.shouldFollowUp && followUp.question) {
                    const followUpQuestion = {
                        id: crypto.randomUUID(),
                        section,
                        question: followUp.question,
                        intention: followUp.intention || "Probe deeper based on the previous answer.",
                        expectedAnswer: followUp.expectedAnswer || "",
                        isFollowUp: true,
                        parentQuestionId: currentQuestion.id,
                    }

                    sectionQuestions.splice(questionIndex + 1, 0, followUpQuestion)
                    questions[section] = sectionQuestions
                    insertedFollowUp = true
                }
            } catch (err) {
                console.error("Follow-up generation failed:", err?.status || err?.code || err?.name)
            }
        }

        let nextSection = section
        let nextQuestionIndex = questionIndex + 1
        let completedSections = [...(mock.completedSections || [])]
        let interviewComplete = false

        if (nextQuestionIndex >= questions[section].length) {
            completedSections = [...new Set([...completedSections, section])]
            const other = nextSectionAfter(section)
            const otherDone = completedSections.includes(other)
            const otherHasQuestions = (questions[other] || []).length > 0

            if (otherDone || !otherHasQuestions) {
                interviewComplete = true
                nextSection = ""
                nextQuestionIndex = 0
            } else {
                nextSection = other
                nextQuestionIndex = 0
            }
        }

        const updated = await mockInterviewRepository.updateMockInterview(
            mockId,
            req.user.id,
            interviewId,
            {
                questions,
                answers,
                currentSection: nextSection,
                currentQuestionIndex: nextQuestionIndex,
                completedSections,
            }
        )

        if (!updated) {
            return res.status(404).json({
                message: "Mock Interview not found"
            })
        }

        const nextQuestion = interviewComplete
            ? null
            : (updated.questions?.[nextSection] || [])[nextQuestionIndex] || null

        res.status(200).json({
            message: insertedFollowUp
                ? "Answer saved. Follow-up question added."
                : "Answer saved.",
            mockInterviewReport: updated,
            insertedFollowUp,
            interviewComplete,
            next: interviewComplete
                ? null
                : {
                    section: nextSection,
                    questionIndex: nextQuestionIndex,
                    question: nextQuestion,
                }
        })
    } catch (err) {
        return sendError(res, 500, "Failed to save answer", {
            err,
            logLabel: "SUBMIT ANSWER ERROR:",
        })
    }
}

module.exports = {
    getAllMockInterviewByInterviewIdController,
    getMockInterviewByIdController,
    deleteMockInterviewByIdController,
    generateMockInterviewReportController,
    createMockInterviewController,
    updateMockInterviewController,
    submitMockAnswerController,
}
