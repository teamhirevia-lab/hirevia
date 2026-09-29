const express = require("express")
const helmet = require("helmet")
const cookieParser = require("cookie-parser")
const cors = require("cors")
const { correlationId } = require("./middlewares/correlation")
const { requireAppHeader } = require("./middlewares/csrf")
const { sendError } = require("./utils/httpError")

const app = express()

app.disable("x-powered-by")
app.set("trust proxy", 1)

app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            defaultSrc: ["'none'"],
            scriptSrc: ["'none'"],
            styleSrc: ["'none'"],
            imgSrc: ["'none'"],
            connectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'none'"],
            formAction: ["'none'"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
    frameguard: { action: "deny" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
}))

app.use(correlationId)

function clientOrigins() {
    const configured = (process.env.CLIENT_ORIGINS || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)

    if (configured.length > 0) return configured
    if (process.env.NODE_ENV === "production") return []
    return ["http://localhost:5173", "http://127.0.0.1:5173"]
}

const allowedOrigins = clientOrigins()

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true)
            return
        }
        callback(null, false)
    },
    credentials: true,
}))
app.use(express.json({ limit: "2mb" }))
app.use(cookieParser())
app.use(requireAppHeader)

app.get("/api/health", (req, res) => {
    res.status(200).json({ ok: true })
})

const authRouter = require("./routes/auth.routes")
const interviewRouter = require("./routes/interview.routes")
const adminRouter = require("./routes/admin.routes")
const feedbackRouter = require("./routes/feedback.routes")
const authMiddleware = require("./middlewares/auth.middleware")
const { getJobController } = require("./controllers/jobs.controller")

app.use("/api/auth", authRouter)
app.get("/api/jobs/:jobId", authMiddleware.authUser, getJobController)
app.use("/api/interview", interviewRouter)
app.use("/api/feedback", feedbackRouter)
app.use("/api/admin", adminRouter)

app.use((req, res) => {
    res.status(404).json({
        message: "Not found",
        correlationId: req.correlationId,
    })
})

app.use((err, req, res, next) => {
    if (res.headersSent) {
        next(err)
        return
    }

    if (err?.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({
            message: "Resume file must be 3 MB or smaller.",
            correlationId: req.correlationId,
        })
        return
    }

    sendError(res, 500, "An unexpected error occurred. Please try again.", {
        err,
        logLabel: "UNHANDLED ERROR:",
    })
})

module.exports = app
