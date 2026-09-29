const feedbackRepository = require("../repositories/feedback.repository")
const { sendError } = require("../utils/httpError")

function clean(value, max) {
    return String(value || "").trim().slice(0, max)
}

async function submitFeedbackController(req, res) {
    try {
        const name = clean(req.body?.name, 80)
        const email = clean(req.body?.email, 255).toLowerCase()
        const phone = clean(req.body?.phone, 32)
        const message = clean(req.body?.message, 2000)

        if (!name || !email || !message) {
            return res.status(400).json({
                message: "Name, email, and message are required.",
            })
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                message: "Enter a valid email.",
            })
        }

        if (phone && !/^[+]?[\d\s().-]{7,20}$/.test(phone)) {
            return res.status(400).json({
                message: "Enter a valid contact number.",
            })
        }

        if (message.length < 8) {
            return res.status(400).json({
                message: "Tell us a bit more in your message.",
            })
        }

        const feedback = await feedbackRepository.createFeedback({
            userId: req.user?.id,
            name,
            email,
            phone: phone || null,
            message,
        })

        return res.status(201).json({
            message: "Thanks. We received your feedback.",
            feedback: { id: feedback.id },
        })
    } catch (err) {
        return sendError(res, 500, "Could not send feedback. Please try again.", {
            err,
            logLabel: "FEEDBACK ERROR:",
        })
    }
}

module.exports = {
    submitFeedbackController,
}
