const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const userRepository = require("../repositories/user.repository")
const quotaService = require("../services/quota.service")
const {
    blacklistToken,
    isTokenBlacklisted,
    invalidateInterview,
    invalidateMock,
} = require("../services/cache.service")
const { cookieOptions, clearCookieOptions } = require("../utils/cookies")
const { sendError } = require("../utils/httpError")

async function publicUserWithQuota(row) {
    const user = userRepository.toPublicUser(row)
    if (!user) return null
    user.quota = await quotaService.getQuotaForUser(row.id)
    return user
}

const DUMMY_PASSWORD_HASH = "$2b$10$YCCAoyKvMYYDZ4uJxxU3Be8QtAektxT0vUNmjAzoFjk92ivGIS5ky"

function signToken(user) {
    return jwt.sign(
        { id: user.id },
        process.env.JWT_SECRET,
        { algorithm: "HS256", expiresIn: "1d" }
    )
}

/**
 * @name registerUserContoller
 * @description Register a New User
 * @access PUBLIC
 */
async function registerUserContoller(req, res) {
    try {
        const { username, email, password } = req.body

        if (!username || !email || typeof password !== "string") {
            return res.status(400).json({
                message: "Username, Email and Password is required"
            })
        }

        if (password.length < 8 || password.length > 128) {
            return res.status(400).json({
                message: "Password must be 8 to 128 characters."
            })
        }

        const existing = await userRepository.findByUsernameOrEmail(username, email)
        if (existing) {
            return res.status(400).json({
                message: "User already exists"
            })
        }

        const hash = await bcrypt.hash(password, 10)
        const user = await userRepository.createUser({
            username,
            email,
            password: hash
        })
        const signedIn = await userRepository.touchLastLogin(user.id)

        const token = signToken(signedIn)
        res.cookie("token", token, cookieOptions())

        return res.status(201).json({
            message: "User Registered Successfully",
            user: await publicUserWithQuota(signedIn)
        })
    } catch (err) {
        return sendError(res, 500, "Failed to register user", {
            err,
            logLabel: "REGISTER ERROR:",
        })
    }
}

/**
 * @name loginUserContoller
 * @description Login a User
 * @access PUBLIC
 */
async function loginUserContoller(req, res) {
    try {
        const { email, password } = req.body
        if (typeof password !== "string" || password.length === 0 || password.length > 128) {
            return res.status(400).json({
                message: "Invalid email or password"
            })
        }

        const user = await userRepository.findByEmail(email)
        const isPasswordValid = await bcrypt.compare(password, user?.password || DUMMY_PASSWORD_HASH)
        if (!user || !isPasswordValid) {
            return res.status(400).json({
                message: "Invalid email or password"
            })
        }

        const signedIn = await userRepository.touchLastLogin(user.id)
        const token = signToken(signedIn)
        res.cookie("token", token, cookieOptions())

        return res.status(200).json({
            message: "User LoggedIn Successfully",
            user: await publicUserWithQuota(signedIn)
        })
    } catch (err) {
        return sendError(res, 500, "Failed to login", {
            err,
            logLabel: "LOGIN ERROR:",
        })
    }
}

/**
 * @name logoutUserContoller
 * @description Logout a User
 * @access PUBLIC
 */
async function logoutUserContoller(req, res) {
    const token = req.cookies.token

    if (token) {
        await blacklistToken(token)
    }

    res.clearCookie("token", clearCookieOptions())

    return res.status(200).json({
        message: "User Logged Out Successfully"
    })
}

/**
 * @name getMeContoller
 * @description Get the current user, or null if there is no valid session.
 * @access PUBLIC
 */
async function getMeContoller(req, res) {
    const token = req.cookies.token

    if (!token) {
        return res.status(200).json({ user: null })
    }

    try {
        if (await isTokenBlacklisted(token)) {
            return res.status(200).json({ user: null })
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] })
        const user = await userRepository.findById(decoded.id)

        if (!user) {
            return res.status(200).json({ user: null })
        }

        return res.status(200).json({
            message: "User details fetched successfully",
            user: await publicUserWithQuota(user)
        })
    } catch (err) {
        return res.status(200).json({ user: null })
    }
}

function cleanProfileField(value, max) {
    return String(value || "").trim().slice(0, max)
}

async function updateProfileController(req, res) {
    try {
        const username = cleanProfileField(req.body?.username, 80)
        const email = cleanProfileField(req.body?.email, 255).toLowerCase()
        const phone = cleanProfileField(req.body?.phone, 32)

        if (!username || !email) {
            return res.status(400).json({
                message: "Name and email are required"
            })
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                message: "Enter a valid email"
            })
        }

        if (phone && !/^[+]?[\d\s().-]{7,20}$/.test(phone)) {
            return res.status(400).json({
                message: "Enter a valid contact number"
            })
        }

        const taken = await userRepository.findOtherByUsernameOrEmail(req.user.id, username, email)
        if (taken) {
            return res.status(400).json({
                message: taken.email?.toLowerCase() === email
                    ? "That email is already in use"
                    : "That name is already in use"
            })
        }

        const updated = await userRepository.updateProfile(req.user.id, {
            username,
            email,
            phone: phone || null,
        })

        return res.status(200).json({
            message: "Profile updated",
            user: await publicUserWithQuota(updated)
        })
    } catch (err) {
        return sendError(res, 500, "Failed to update profile", {
            err,
            logLabel: "PROFILE ERROR:",
        })
    }
}

/**
 * @name deleteAccountController
 * @description Delete the signed-in account and related personal data.
 * @access PRIVATE
 */
async function deleteAccountController(req, res) {
    try {
        const { password } = req.body || {}

        if (!password) {
            return res.status(400).json({
                message: "Password is required"
            })
        }

        const user = await userRepository.findById(req.user.id)
        if (!user) {
            return res.status(404).json({
                message: "Account not found"
            })
        }

        if (user.role === "admin") {
            return res.status(403).json({
                message: "Admin accounts cannot be deleted from the app."
            })
        }

        const isPasswordValid = await bcrypt.compare(password, user.password)
        if (!isPasswordValid) {
            return res.status(400).json({
                message: "Password is invalid"
            })
        }

        const result = await userRepository.deleteAccountData(user.id)
        await Promise.all([
            ...result.interviewIds.map((id) => invalidateInterview(id)),
            ...result.mockIds.map((id) => invalidateMock(id)),
        ])

        const token = req.cookies.token
        if (token) {
            await blacklistToken(token)
        }
        res.clearCookie("token", clearCookieOptions())

        return res.status(200).json({
            message: "Account deleted"
        })
    } catch (err) {
        return sendError(res, 500, "Failed to delete account", {
            err,
            logLabel: "DELETE ACCOUNT ERROR:",
        })
    }
}

module.exports = {
    registerUserContoller,
    loginUserContoller,
    logoutUserContoller,
    getMeContoller,
    updateProfileController,
    deleteAccountController
}
