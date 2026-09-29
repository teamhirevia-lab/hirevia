require("dotenv").config()
const { validateEnv } = require("./src/config/validateEnv")
validateEnv()
const app = require("./src/app")
const { connectPostgres } = require("./src/config/postgres")
const { connectRedis } = require("./src/config/redis")
const { runMigrations } = require("./src/db/migrate")
const { seedAdmin } = require("./src/db/seedAdmin")
const { startJobWorker } = require("./src/services/jobs.service")
const quotaService = require("./src/services/quota.service")

const port = Number(process.env.PORT) || 3000

async function start() {
    await connectPostgres()
    await runMigrations()
    await seedAdmin()
    await connectRedis()

    startJobWorker()
    setInterval(() => {
        quotaService.sweepStaleReserved().catch(() => {})
    }, 5 * 60 * 1000).unref?.()

    app.listen(port, () => {
        console.log(`Server is listening on port ${port}`)
    })
}

start().catch((err) => {
    console.error("Failed to start server:", err?.code || err?.name)
    process.exit(1)
})
