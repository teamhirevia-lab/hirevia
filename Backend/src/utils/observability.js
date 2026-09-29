const os = require("os")
const { getContext } = require("./requestContext")

function classifyGeminiError(err) {
    const status = err?.status ?? err?.error?.code
    const message = String(err?.message || "")
    if (err?.code === "GEMINI_TIMEOUT") return "timeout"
    if (err?.code === "GEMINI_PARSE") return "parse"
    if (status === 402 || /prepayment credits|billing/i.test(message)) return "billing"
    if (status === 404) return "not_found"
    if (status === 429 || /RESOURCE_EXHAUSTED/i.test(message)) return "rate_limited"
    if (status === 503 || /UNAVAILABLE|high demand/i.test(message)) return "unavailable"
    return "error"
}

function geminiClientMessage(err) {
    const errorClass = classifyGeminiError(err)
    if (errorClass === "billing") {
        return "The AI service has no credits left, so this could not be generated."
    }
    if (errorClass === "not_found") {
        return "The AI model is unavailable. Please try again later."
    }
    return null
}

function logLine(payload) {
    const ctx = getContext()
    console.log(JSON.stringify({
        ts: new Date().toISOString(),
        correlationId: ctx.correlationId || "-",
        userId: ctx.userId || null,
        route: payload.route || ctx.route || null,
        ...payload,
    }))
}

function logGemini({
    route,
    model,
    attempt,
    ms,
    status,
    errorClass = null,
    inputTokens = null,
    outputTokens = null,
    totalTokens = null,
}) {
    logLine({
        type: "gemini",
        route,
        model,
        attempt,
        ms,
        status,
        errorClass,
        inputTokens,
        outputTokens,
        totalTokens,
    })
}

function logPuppeteer({ ms, outcome, errorClass = null }) {
    logLine({
        type: "puppeteer",
        ms,
        outcome,
        errorClass,
    })
}

function logResources(label) {
    const mem = process.memoryUsage()
    logLine({
        type: "resources",
        label,
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapMb: Math.round(mem.heapUsed / 1024 / 1024),
        load: os.loadavg().map((n) => Number(n.toFixed(2))),
    })
}

function shouldRefundQuota(err) {
    const errorClass = classifyGeminiError(err)
    return (
        errorClass === "timeout"
        || errorClass === "rate_limited"
        || errorClass === "unavailable"
        || errorClass === "parse"
        || errorClass === "billing"
        || errorClass === "not_found"
        || err?.code === "PDF_BUSY"
    )
}

module.exports = {
    classifyGeminiError,
    geminiClientMessage,
    logGemini,
    logPuppeteer,
    logResources,
    shouldRefundQuota,
}
