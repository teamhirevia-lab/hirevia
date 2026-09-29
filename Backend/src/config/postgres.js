const { Pool } = require("pg")

const isProduction = process.env.NODE_ENV === "production"

function postgresOnThisMachine(connectionString) {
    try {
        const host = new URL(connectionString).hostname
        return host === "localhost" || host === "127.0.0.1"
    } catch {
        return false
    }
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    ssl: isProduction && !postgresOnThisMachine(process.env.DATABASE_URL)
        ? { rejectUnauthorized: true }
        : undefined,
})

pool.on("error", (err) => {
    console.error("Unexpected Postgres pool error:", err?.code || err?.name)
})

async function connectPostgres() {
    const client = await pool.connect()
    try {
        await client.query("SELECT 1")
        console.log("Connected to Postgres")
    } finally {
        client.release()
    }
}

async function query(text, params = []) {
    return pool.query(text, params)
}

async function queryOne(text, params = []) {
    const result = await pool.query(text, params)
    return result.rows[0] || null
}

async function queryAll(text, params = []) {
    const result = await pool.query(text, params)
    return result.rows
}

async function withTransaction(work) {
    const client = await pool.connect()
    try {
        await client.query("BEGIN")
        const result = await work(client)
        await client.query("COMMIT")
        return result
    } catch (err) {
        try {
            await client.query("ROLLBACK")
        } catch {
            // Keep the original error if rollback also fails.
        }
        throw err
    } finally {
        client.release()
    }
}

module.exports = {
    pool,
    connectPostgres,
    query,
    queryOne,
    queryAll,
    withTransaction,
}
