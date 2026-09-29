const { redactSecrets } = require("./redact")

function sendError(res, status, publicMessage, { err, logLabel, expose = false } = {}) {
    const req = res.req
    const correlationId = req?.correlationId
    console.error(
        logLabel || "REQUEST ERROR:",
        correlationId || "-",
        req?.method || "-",
        req?.originalUrl || req?.url || "-",
        err?.status || err?.code || err?.name || "",
        redactSecrets(err?.message || "")
    )

    const hideDetails = status >= 500 && process.env.NODE_ENV === "production" && !expose
    res.status(status).json({
        message: hideDetails ? "An unexpected error occurred. Please try again." : publicMessage,
        correlationId,
    })
}

module.exports = { sendError }
