const express = require("express")
const authMiddleware = require("../middlewares/auth.middleware")
const interviewController = require("../controllers/interview.controller")
const mockInterviewController = require("../controllers/mockInterview.controller")
const upload = require("../middlewares/file.middleware")
const {
    planByUser,
    planByIp,
    pdfByUser,
    pdfByIp,
    mockByUser,
    mockByIp,
    answerByUser,
    answerByIp,
} = require("../middlewares/rateLimit")

const interviewRouter = express.Router()



/**
 * @route POST /api/interview/
 * @description generate new interview report on the basis of user self description,resume pdf and job description.
 * @access private
 */
interviewRouter.post("/", authMiddleware.authUser, planByUser, planByIp, upload.single("resume"), interviewController.generateInterViewReportController)

/**
 * @route GET /api/interview/report/:interviewId
 * @description get interview report by interviewId.
 * @access private
 */
interviewRouter.get("/report/:interviewId", authMiddleware.authUser, interviewController.getInterviewReportByIdController)

/**
 * @route GET /api/interview/report/:interviewId
 * @description get interview report by interviewId.
 * @access private
 */
interviewRouter.delete("/report/:interviewId", authMiddleware.authUser, interviewController.deleteInterviewReportByIdController)

/**
 * @route GET /api/interview/
 * @description get all interview reports of logged in user.
 * @access private
 */
interviewRouter.get("/", authMiddleware.authUser, interviewController.getAllInterviewReportsController)


/**
 * @route GET /api/interview/resume/pdf
 * @description generate resume pdf on the basis of user self description, resume content and job description.
 * @access private
 */
interviewRouter.post("/resume/pdf/:interviewReportId", authMiddleware.authUser, pdfByUser, pdfByIp, interviewController.generateResumePdfController)

// MOCK INTERVIEWS

/**
 * @route GET /api/interview/:interviewId/mock
 * @description Get all mock interviews for that interview id.
 * @access private
 */
interviewRouter.get("/:interviewId/mock", authMiddleware.authUser, mockInterviewController.getAllMockInterviewByInterviewIdController)

/**
 * @route POST /api/interview/:interviewId/mock
 * @description Start a mock.
 * @access private
 */
interviewRouter.post("/:interviewId/mock", authMiddleware.authUser, mockByUser, mockByIp, mockInterviewController.createMockInterviewController)

/**
 * @route POST /api/interview/:interviewId/mock/:mockId
 * @description Complete a mock for that interview id.
 * @access private
 */
interviewRouter.post("/:interviewId/mock/:mockId", authMiddleware.authUser, mockByUser, mockByIp, mockInterviewController.generateMockInterviewReportController)

/**
 * @route GET /interview/:interviewId/mock/:mockId/report
 * @description Get a mock report for that id.
 * @access private
 */
interviewRouter.get("/:interviewId/mock/:mockId/report", authMiddleware.authUser, mockInterviewController.getMockInterviewByIdController)

/**
 * @route POST /api/interview/:interviewId/mock/:mockId/answer
 * @description Submit an answer, optionally receive a follow-up, and advance.
 * @access private
 */
interviewRouter.post("/:interviewId/mock/:mockId/answer", authMiddleware.authUser, answerByUser, answerByIp, mockInterviewController.submitMockAnswerController)

/**
 * @route PATCH /api/interview/:interviewId/mock/:mockId/progress
 * @description Updating a mock everytime question updates
 * @access private
 */
interviewRouter.patch("/:interviewId/mock/:mockId/progress", authMiddleware.authUser, mockInterviewController.updateMockInterviewController)

/**
 * @route DELETE /api/interview/:interviewId/mock
 * @description Delete the mock with the id.
 * @access private
 */
interviewRouter.delete("/:interviewId/mock/:mockId", authMiddleware.authUser, mockInterviewController.deleteMockInterviewByIdController)


module.exports = interviewRouter