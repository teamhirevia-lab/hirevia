require("dotenv").config()
if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run verification scripts in production")
    process.exit(1)
}
const { connectPostgres, queryAll } = require("../src/config/postgres")
const { connectRedis, redis } = require("../src/config/redis")
const { logSafeError } = require("../src/utils/redact")

async function main() {
    await connectPostgres()
    const tables = await queryAll(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
    `)
    console.log("tables:", tables.map((row) => row.table_name).join(", "))

    await connectRedis()
    console.log("redis:", await redis.ping())
    await redis.quit()
}

main().catch((err) => {
    logSafeError("verify-storage failed:", err)
    process.exit(1)
})
