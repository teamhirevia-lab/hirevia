const fs = require("fs")
const path = require("path")

if (require.main === module) {
    require("dotenv").config({ path: path.join(__dirname, "../../.env") })
    require("../config/validateEnv").validateEnv()
}

const { pool } = require("../config/postgres")

async function runMigrations() {
    const schemaPath = path.join(__dirname, "schema.sql")
    const sql = fs.readFileSync(schemaPath, "utf8")
    await pool.query(sql)
    console.log("Postgres schema is up to date")
}

module.exports = { runMigrations }

if (require.main === module) {
    runMigrations()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error("Migration failed:", err?.code || err?.name)
            process.exit(1)
        })
}
