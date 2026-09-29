const userRepository = require("../repositories/user.repository")
const quotaService = require("../services/quota.service")
const feedbackRepository = require("../repositories/feedback.repository")
const { sendError } = require("../utils/httpError")

function parseLimit(value, { allowNull = false } = {}) {
    if (value === null || value === undefined || value === "") {
        return allowNull ? null : undefined
    }
    const n = Number(value)
    if (!Number.isInteger(n) || n < 0 || n > 1000) return undefined
    return n
}

async function getDashboardController(req, res) {
    try {
        const dashboard = await quotaService.getDashboardStats()
        res.status(200).json(dashboard)
    } catch (err) {
        return sendError(res, 500, "Failed to load dashboard", {
            err,
            logLabel: "ADMIN DASHBOARD GET:",
        })
    }
}

async function getSettingsController(req, res) {
    try {
        const settings = await quotaService.getSettings()
        res.status(200).json({ settings })
    } catch (err) {
        return sendError(res, 500, "Failed to load settings", {
            err,
            logLabel: "ADMIN SETTINGS GET:",
        })
    }
}

async function updateSettingsController(req, res) {
    try {
        const reportLimitMonthly = parseLimit(req.body?.reportLimitMonthly)
        const mockLimitMonthly = parseLimit(req.body?.mockLimitMonthly)

        if (reportLimitMonthly == null || mockLimitMonthly == null) {
            return res.status(400).json({
                message: "Monthly limits must be integers from 0 to 1000.",
            })
        }

        const settings = await quotaService.updateSettings({
            reportLimitMonthly,
            mockLimitMonthly,
        })
        res.status(200).json({ settings })
    } catch (err) {
        return sendError(res, 500, "Failed to update settings", {
            err,
            logLabel: "ADMIN SETTINGS PATCH:",
        })
    }
}

async function listUsersController(req, res) {
    try {
        const settings = await quotaService.getSettings()
        const users = await quotaService.listUsersWithQuota()
        res.status(200).json({ settings, users })
    } catch (err) {
        return sendError(res, 500, "Failed to load users", {
            err,
            logLabel: "ADMIN USERS GET:",
        })
    }
}

async function updateUserLimitsController(req, res) {
    try {
        const { userId } = req.params
        const target = await userRepository.findById(userId)
        if (!target) {
            return res.status(404).json({ message: "User not found" })
        }

        const body = req.body || {}
        const reportLimitMonthly = Object.prototype.hasOwnProperty.call(body, "reportLimitMonthly")
            ? parseLimit(body.reportLimitMonthly, { allowNull: true })
            : target.report_limit_monthly == null ? null : Number(target.report_limit_monthly)
        const mockLimitMonthly = Object.prototype.hasOwnProperty.call(body, "mockLimitMonthly")
            ? parseLimit(body.mockLimitMonthly, { allowNull: true })
            : target.mock_limit_monthly == null ? null : Number(target.mock_limit_monthly)

        if (reportLimitMonthly === undefined || mockLimitMonthly === undefined) {
            return res.status(400).json({
                message: "Limits must be integers from 0 to 1000, or null to inherit the global default.",
            })
        }

        await userRepository.updateUserLimits(userId, {
            reportLimitMonthly,
            mockLimitMonthly,
        })
        const users = await quotaService.listUsersWithQuota()
        const user = users.find((item) => item.id === userId)
        res.status(200).json({ user })
    } catch (err) {
        return sendError(res, 500, "Failed to update user limits", {
            err,
            logLabel: "ADMIN USER PATCH:",
        })
    }
}

async function grantQuotaController(req, res) {
    try {
        const { userId } = req.params
        const kind = req.body?.kind === "mock" ? "mock" : req.body?.kind === "report" ? "report" : null
        const amount = Number(req.body?.amount)

        if (!kind || !Number.isInteger(amount) || amount < 1 || amount > 100) {
            return res.status(400).json({
                message: "Provide kind (report or mock) and an amount from 1 to 100.",
            })
        }

        const target = await userRepository.findById(userId)
        if (!target) {
            return res.status(404).json({ message: "User not found" })
        }

        await quotaService.addGrant({ userId, kind, amount })
        const users = await quotaService.listUsersWithQuota()
        const user = users.find((item) => item.id === userId)
        res.status(201).json({ user })
    } catch (err) {
        return sendError(res, 500, "Failed to add remaining uses", {
            err,
            logLabel: "ADMIN GRANT:",
        })
    }
}

async function listFeedbackController(req, res) {
    try {
        const feedback = await feedbackRepository.listFeedback(100)
        res.status(200).json({ feedback })
    } catch (err) {
        return sendError(res, 500, "Failed to load feedback", {
            err,
            logLabel: "ADMIN FEEDBACK GET:",
        })
    }
}

module.exports = {
    getDashboardController,
    getSettingsController,
    updateSettingsController,
    listUsersController,
    updateUserLimitsController,
    grantQuotaController,
    listFeedbackController,
}
