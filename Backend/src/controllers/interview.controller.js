const pdfParse = require("pdf-parse")
const { generateResumePdf } = require("../services/ai.service")
const interviewReportRepository = require("../repositories/interviewReport.repository")
const quotaService = require("../services/quota.service")
const jobsService = require("../services/jobs.service")
const { INTERVIEW_WINDOWS } = require("../utils/interviewIntake")
const { isPdfBuffer } = require("../middlewares/file.middleware")
const { sendError } = require("../utils/httpError")
const { classifyGeminiError, geminiClientMessage, shouldRefundQuota } = require("../utils/observability")

function readIdempotencyKey(req) {
    const key = req.get("idempotency-key")
    if (!key) return null
    if (!/^[a-zA-Z0-9._-]{8,80}$/.test(key)) {
        const err = new Error("Idempotency-Key must be 8–80 letters, numbers, dots, underscores, or hyphens.")
        err.status = 400
        throw err
    }
    return key
}

function quotaFail(res, quotaErr) {
    if (quotaErr?.code !== "QUOTA") return null
    return res.status(quotaErr.status).json({
        message: quotaErr.message,
        quota: quotaErr.quota || null,
    })
}

async function generateInterViewReportController(req, res) {
    let reservation = null
    try {
        const {
            selfDescription,
            jobDescription,
            company,
            jobProfile,
            yearsOfExperience,
            interviewWindow,
        } = req.body
        let resumeContent = ""

        const idempotencyKey = readIdempotencyKey(req)

        if (idempotencyKey) {
            const existing = await jobsService.findJobByIdempotency(req.user.id, "report", idempotencyKey)
            if (existing) {
                if (existing.status === "succeeded" && existing.result_id) {
                    const interviewReport = await interviewReportRepository.findByIdForUser(
                        existing.result_id,
                        req.user.id,
                        { include: "resume,research" }
                    )
                    return res.status(200).json({
                        message: "Interview report generated successfully.",
                        interviewReport,
                        jobId: existing.id,
                    })
                }
                return res.status(202).json({
                    message: "Generation is already in progress.",
                    jobId: existing.id,
                    status: existing.status,
                })
            }
        }

        if (req.file) {
            if (!isPdfBuffer(req.file.buffer)) {
                return res.status(400).json({
                    message: "Resume must be a PDF file."
                })
            }
            const data = await pdfParse(req.file.buffer)
            resumeContent = data.text
        }

        if (!resumeContent && !selfDescription) {
            return res.status(400).json({
                message: "Either resume or self description is required."
            })
        }

        if (!jobDescription) {
            return res.status(400).json({
                message: "Job description is required."
            })
        }

        if (!String(company || "").trim() || !String(jobProfile || "").trim()) {
            return res.status(400).json({
                message: "Company and job profile are required."
            })
        }

        const parsedYears = Number(yearsOfExperience)
        if (!Number.isFinite(parsedYears) || parsedYears < 0 || parsedYears > 40) {
            return res.status(400).json({
                message: "Years of experience must be a number between 0 and 40."
            })
        }

        if (!INTERVIEW_WINDOWS[interviewWindow]) {
            return res.status(400).json({
                message: "A valid first-interview window is required."
            })
        }

        reservation = await quotaService.reserve({
            userId: req.user.id,
            kind: "report",
            idempotencyKey,
        })

        if (reservation.replay && reservation.event.status === "completed" && reservation.event.result_id) {
            const interviewReport = await interviewReportRepository.findByIdForUser(
                reservation.event.result_id,
                req.user.id,
                { include: "resume,research" }
            )
            if (interviewReport) {
                return res.status(200).json({
                    message: "Interview report generated successfully.",
                    interviewReport,
                })
            }
        }

        const { job } = await jobsService.enqueueReportJob({
            userId: req.user.id,
            quotaEventId: reservation.event.id,
            idempotencyKey,
            request: {
                resume: resumeContent,
                selfDescription,
                jobDescription,
                company: String(company).trim(),
                jobProfile: String(jobProfile).trim(),
                yearsOfExperience: parsedYears,
                interviewWindow,
                correlationId: req.correlationId,
            },
        })

        return res.status(202).json({
            message: "Plan generation started. This usually takes 40 to 80 seconds.",
            jobId: job.id,
            status: job.status,
            quota: reservation.quota,
        })
    } catch (err) {
        if (reservation?.event?.id && reservation.event.status === "reserved" && !reservation.replay) {
            await quotaService.refund(reservation.event.id, classifyGeminiError(err)).catch(() => {})
        }

        const quotaResponse = quotaFail(res, err)
        if (quotaResponse) return quotaResponse

        const isOverloaded =
            err?.status === 503 ||
            err?.status === 429 ||
            /UNAVAILABLE|high demand|RESOURCE_EXHAUSTED|try again/i.test(
                String(err?.message || "")
            )

        if (isOverloaded) {
            return sendError(res, 503, "AI service is temporarily busy. Please try again in a moment.", {
                err,
                logLabel: "INTERVIEW REPORT ERROR:",
                expose: true,
            })
        }

        if (err.status === 400) {
            return res.status(400).json({ message: err.message })
        }

        return sendError(res, 500, "Failed to generate interview report. Please try again.", {
            err,
            logLabel: "INTERVIEW REPORT ERROR:",
        })
    }
}

async function getInterviewReportByIdController(req, res) {
    const { interviewId } = req.params
    const interviewReport = await interviewReportRepository.findByIdForUser(
        interviewId,
        req.user.id,
        { include: req.query.include }
    )

    if (!interviewReport) {
        return res.status(404).json({
            message: "Interview report not found."
        })
    }

    res.status(200).json({
        message: "Interview report fetched successfully.",
        interviewReport
    })
}

async function deleteInterviewReportByIdController(req, res) {
    const { interviewId } = req.params
    const deleted = await interviewReportRepository.deleteByIdForUser(
        interviewId,
        req.user.id
    )

    if (!deleted) {
        return res.status(404).json({
            message: "Interview report not found."
        })
    }

    res.status(200).json({
        message: "Interview report deleted successfully.",
    })
}

async function getAllInterviewReportsController(req, res) {
    const interviewReports = await interviewReportRepository.findAllByUser(req.user.id)

    res.status(200).json({
        message: "Interview reports fetched successfully.",
        interviewReports
    })
}

async function generateResumePdfController(req, res) {
    let reservation = null
    try {
        const { interviewReportId } = req.params
        const interviewReport = await interviewReportRepository.findByIdForUser(
            interviewReportId,
            req.user.id,
            { include: "resume,research" }
        )

        if (!interviewReport) {
            return res.status(404).json({
                message: "Interview report not found."
            })
        }

        reservation = await quotaService.reserve({
            userId: req.user.id,
            kind: "pdf",
        })

        const { resume, jobDescription, selfDescription } = interviewReport
        const allowedTemplates = new Set(["classic", "modern", "compact", "executive"])
        const template = allowedTemplates.has(req.body?.template) ? req.body.template : "classic"
        const pdfBuffer = await generateResumePdf({
            resume,
            jobDescription,
            selfDescription,
            template,
            reportId: interviewReportId,
        })

        await quotaService.complete(reservation.event.id, { resultId: interviewReportId })

        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename=resume_${template}_${interviewReportId}.pdf`
        })

        res.send(pdfBuffer)
    } catch (err) {
        if (reservation?.event?.id && shouldRefundQuota(err)) {
            await quotaService.refund(reservation.event.id, classifyGeminiError(err)).catch(() => {})
        } else if (reservation?.event?.id && err) {
            await quotaService.refund(reservation.event.id, classifyGeminiError(err)).catch(() => {})
        }

        const quotaResponse = quotaFail(res, err)
        if (quotaResponse) return quotaResponse

        const aiMessage = geminiClientMessage(err)
        if (aiMessage) {
            return sendError(res, 503, aiMessage, {
                err,
                logLabel: "RESUME PDF ERROR:",
                expose: true,
            })
        }

        return sendError(res, 500, "Failed to generate resume PDF. Please try again.", {
            err,
            logLabel: "RESUME PDF ERROR:",
        })
    }
}

module.exports = {
    generateInterViewReportController,
    getInterviewReportByIdController,
    getAllInterviewReportsController,
    generateResumePdfController,
    deleteInterviewReportByIdController
}
