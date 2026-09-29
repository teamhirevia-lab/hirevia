const jobsService = require("../services/jobs.service")
const interviewReportRepository = require("../repositories/interviewReport.repository")
const { sendError } = require("../utils/httpError")

async function getJobController(req, res) {
    try {
        const job = await jobsService.findJobByIdForUser(req.params.jobId, req.user.id)
        if (!job) {
            return res.status(404).json({ message: "Job not found." })
        }

        let interviewReport = null
        if (job.status === "succeeded" && job.result_id) {
            interviewReport = await interviewReportRepository.findByIdForUser(
                job.result_id,
                req.user.id,
                { include: "resume,research" }
            )
        }

        const message = job.status === "failed"
            ? (job.error || "Generation failed. Your quota was returned if the model did not finish.")
            : job.status === "succeeded"
                ? "Interview report generated successfully."
                : "Generation is still running."

        res.status(200).json({
            jobId: job.id,
            status: job.status,
            kind: job.kind,
            error: job.status === "failed" ? job.error : null,
            errorClass: job.error_class,
            message,
            interviewReport,
        })
    } catch (err) {
        return sendError(res, 500, "Failed to load job", {
            err,
            logLabel: "JOB GET ERROR:",
        })
    }
}

module.exports = { getJobController }
