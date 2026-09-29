const jwt = require("jsonwebtoken")
const { isTokenBlacklisted } = require("../services/cache.service")
const userRepository = require("../repositories/user.repository")

async function authUser(req, res, next) {
    const token = req.cookies.token

    if (!token) {
        return res.status(401).json({
            message: "Token not provided!"
        })
    }

    try {
        const blacklisted = await isTokenBlacklisted(token)
        if (blacklisted) {
            return res.status(401).json({
                message: "Token is Invalid"
            })
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] })
        req.user = decoded
        next()
    } catch (err) {
        return res.status(401).json({
            message: "Token is Invalid"
        })
    }
}

async function requireAdmin(req, res, next) {
    try {
        const user = await userRepository.findById(req.user?.id)
        if (!user || user.role !== "admin") {
            return res.status(403).json({
                message: "Admin access required",
            })
        }
        req.admin = user
        next()
    } catch (err) {
        return res.status(403).json({
            message: "Admin access required",
        })
    }
}

module.exports = {
    authUser,
    requireAdmin,
}
