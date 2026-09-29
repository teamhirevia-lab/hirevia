const Redis = require("ioredis")

const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
})

redis.on("error", (err) => {
    console.error("Redis error:", err?.code || err?.name)
})

async function connectRedis() {
    if (redis.status === "ready" || redis.status === "connecting") {
        if (redis.status === "ready") {
            console.log("Connected to Redis")
            return
        }
    }

    await redis.connect()
    console.log("Connected to Redis")
}

module.exports = {
    redis,
    connectRedis,
}
