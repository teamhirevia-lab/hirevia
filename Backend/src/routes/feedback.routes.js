const { Router } = require("express")
const authMiddleware = require("../middlewares/auth.middleware")
const { feedbackByUser, feedbackByIp } = require("../middlewares/rateLimit")
const { submitFeedbackController } = require("../controllers/feedback.controller")

const feedbackRouter = Router()

feedbackRouter.post(
    "/",
    authMiddleware.authUser,
    feedbackByUser,
    feedbackByIp,
    submitFeedbackController
)

module.exports = feedbackRouter
