const { randomUUID } = require("crypto")

function correlationId(req, res, next) {
    const incoming = req.get("x-correlation-id")
    const id = typeof incoming === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(incoming)
        ? incoming
        : randomUUID()
    req.correlationId = id
    res.setHeader("X-Correlation-Id", id)
    next()
}

module.exports = { correlationId }
