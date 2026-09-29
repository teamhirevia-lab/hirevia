const { Router } = require("express")
const authController = require('../controllers/auth.controller')
const authMiddleware = require("../middlewares/auth.middleware")
const { loginLimiter, registerLimiter, accountDeleteLimiter } = require("../middlewares/rateLimit")

const authRouter = Router()

/**
 * @route POST /api/auth/register
 */
authRouter.post("/register", registerLimiter, authController.registerUserContoller)

/**
 * @route POST /api/auth/login
 */
authRouter.post("/login", loginLimiter, authController.loginUserContoller)

/**
 * @route POST /api/auth/logout
 */
authRouter.post("/logout", authController.logoutUserContoller)

/**
 * @route GET /api/auth/get-me 
 */
authRouter.get("/get-me", authController.getMeContoller)

authRouter.patch("/profile", authMiddleware.authUser, authController.updateProfileController)

/**
 * @route DELETE /api/auth/account
 */
authRouter.delete("/account", accountDeleteLimiter, authMiddleware.authUser, authController.deleteAccountController)

module.exports = authRouter