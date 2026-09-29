const PLACEHOLDER_SECRETS = new Set([
    "replace-with-a-long-random-secret",
    "replace-with-a-local-password",
    "replace-with-your-gemini-api-key",
    "changeme",
])

function requireEnv(name) {
    const value = process.env[name]?.trim()
    if (!value) {
        console.error(`[FATAL] Missing required environment variable: ${name}`)
        process.exit(1)
    }
    return value
}

function validateEnv() {
    const nodeEnv = requireEnv("NODE_ENV")
    if (!["development", "test", "production"].includes(nodeEnv)) {
        console.error("[FATAL] NODE_ENV must be development, test, or production")
        process.exit(1)
    }

    requireEnv("DATABASE_URL")
    requireEnv("REDIS_URL")
    const jwtSecret = requireEnv("JWT_SECRET")
    const apiKey = requireEnv("GOOGLE_GENAI_API_KEY")

    if (nodeEnv !== "production") return

    if (jwtSecret.length < 32 || PLACEHOLDER_SECRETS.has(jwtSecret)) {
        console.error("[FATAL] JWT_SECRET must be a unique secret of at least 32 characters")
        process.exit(1)
    }

    if (PLACEHOLDER_SECRETS.has(apiKey) || apiKey.startsWith("replace-with-")) {
        console.error("[FATAL] GOOGLE_GENAI_API_KEY must be set to a real key in production")
        process.exit(1)
    }

    const databaseUrl = process.env.DATABASE_URL.trim()
    let databaseHost = ""
    try {
        databaseHost = new URL(databaseUrl).hostname
    } catch {
        databaseHost = ""
    }
    const databaseOnThisMachine = /^(localhost|127\.0\.0\.1)$/i.test(databaseHost)
    if (!databaseOnThisMachine && /sslmode=disable/i.test(databaseUrl)) {
        console.error("[FATAL] DATABASE_URL in production must use TLS when Postgres is not on this machine")
        process.exit(1)
    }

    const redisUrl = process.env.REDIS_URL.trim()
    let redisPassword = ""
    try {
        redisPassword = new URL(redisUrl).password
    } catch {
        redisPassword = ""
    }
    if (!redisPassword) {
        console.error("[FATAL] REDIS_URL in production must include a password")
        process.exit(1)
    }

    const origins = requireEnv("CLIENT_ORIGINS")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)

    const invalidOrigin = origins.some((origin) => {
        try {
            const url = new URL(origin)
            return url.protocol !== "https:" || /^(localhost|127\.0\.0\.1)$/i.test(url.hostname)
        } catch {
            return true
        }
    })

    if (origins.length === 0 || invalidOrigin) {
        console.error("[FATAL] CLIENT_ORIGINS in production must list https origins only")
        process.exit(1)
    }
}

module.exports = { validateEnv }
