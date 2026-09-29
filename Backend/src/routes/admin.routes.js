const { Router } = require("express")
const authMiddleware = require("../middlewares/auth.middleware")
const adminController = require("../controllers/admin.controller")

const adminRouter = Router()

adminRouter.use(authMiddleware.authUser, authMiddleware.requireAdmin)

adminRouter.get("/dashboard", adminController.getDashboardController)
adminRouter.get("/settings", adminController.getSettingsController)
adminRouter.patch("/settings", adminController.updateSettingsController)
adminRouter.get("/users", adminController.listUsersController)
adminRouter.patch("/users/:userId", adminController.updateUserLimitsController)
adminRouter.post("/users/:userId/grants", adminController.grantQuotaController)
adminRouter.get("/feedback", adminController.listFeedbackController)

module.exports = adminRouter
