const { rateLimit, ipKeyGenerator } = require("express-rate-limit")

const HOUR = 60 * 60 * 1000

function tooMany(req, res) {
    res.status(429).json({
        message: "Too many attempts. Please try again later.",
        correlationId: req.correlationId,
    })
}

function createLimiter({ windowMs, limit, keyGenerator }) {
    return rateLimit({
        windowMs,
        limit,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator,
        handler: tooMany,
    })
}

function byUser(prefix) {
    return (req) => `${prefix}:user:${req.user?.id || "anon"}`
}

function byIp(prefix) {
    return (req) => `${prefix}:ip:${ipKeyGenerator(req.ip)}`
}

function authLimiter() {
    return createLimiter({
        windowMs: 60 * 1000,
        limit: 5,
        keyGenerator: byIp("auth"),
    })
}

module.exports = {
    loginLimiter: authLimiter(),
    registerLimiter: authLimiter(),
    accountDeleteLimiter: authLimiter(),
    planByUser: createLimiter({ windowMs: HOUR, limit: 8, keyGenerator: byUser("plan") }),
    planByIp: createLimiter({ windowMs: HOUR, limit: 40, keyGenerator: byIp("plan") }),
    pdfByUser: createLimiter({ windowMs: HOUR, limit: 12, keyGenerator: byUser("pdf") }),
    pdfByIp: createLimiter({ windowMs: HOUR, limit: 40, keyGenerator: byIp("pdf") }),
    mockByUser: createLimiter({ windowMs: HOUR, limit: 12, keyGenerator: byUser("mock") }),
    mockByIp: createLimiter({ windowMs: HOUR, limit: 40, keyGenerator: byIp("mock") }),
    answerByUser: createLimiter({ windowMs: HOUR, limit: 80, keyGenerator: byUser("answer") }),
    answerByIp: createLimiter({ windowMs: HOUR, limit: 200, keyGenerator: byIp("answer") }),
    feedbackByUser: createLimiter({ windowMs: HOUR, limit: 8, keyGenerator: byUser("feedback") }),
    feedbackByIp: createLimiter({ windowMs: HOUR, limit: 20, keyGenerator: byIp("feedback") }),
}
