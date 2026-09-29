const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

function requireAppHeader(req, res, next) {
    if (SAFE_METHODS.has(req.method)) {
        next()
        return
    }

    if (req.get("x-requested-with") === "hirevia") {
        next()
        return
    }

    res.status(403).json({
        message: "Request blocked",
        correlationId: req.correlationId,
    })
}

module.exports = { requireAppHeader }
