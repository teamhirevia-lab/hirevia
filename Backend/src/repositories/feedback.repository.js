const { queryOne, queryAll } = require("../config/postgres")

function mapFeedback(row) {
    if (!row) return null
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone || "",
        message: row.message,
        createdAt: row.created_at,
    }
}

async function createFeedback({ userId, name, email, phone, message }) {
    const row = await queryOne(
        `
        INSERT INTO feedback_messages (user_id, name, email, phone, message)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        `,
        [userId || null, name, email, phone || null, message]
    )
    return mapFeedback(row)
}

async function listFeedback(limit = 100) {
    const rows = await queryAll(
        `
        SELECT id, name, email, phone, message, created_at
        FROM feedback_messages
        ORDER BY created_at DESC
        LIMIT $1
        `,
        [limit]
    )
    return rows.map(mapFeedback)
}

module.exports = {
    createFeedback,
    listFeedback,
}
