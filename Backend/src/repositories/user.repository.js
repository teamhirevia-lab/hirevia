const { queryOne, queryAll } = require("../config/postgres")
const { mapUser } = require("../utils/serialize")

async function findByEmail(email) {
    const row = await queryOne(
        `SELECT * FROM users WHERE email = $1 LIMIT 1`,
        [email]
    )
    return row
}

async function findByUsernameOrEmail(username, email) {
    return queryOne(
        `SELECT * FROM users WHERE username = $1 OR email = $2 LIMIT 1`,
        [username, email]
    )
}

async function findOtherByUsernameOrEmail(id, username, email) {
    return queryOne(
        `
        SELECT * FROM users
        WHERE id <> $1 AND (username = $2 OR lower(email) = lower($3))
        LIMIT 1
        `,
        [id, username, email]
    )
}

async function findById(id) {
    return queryOne(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [id])
}

async function createUser({ username, email, password, role = "user" }) {
    const row = await queryOne(
        `
        INSERT INTO users (username, email, password, role)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        `,
        [username, email, password, role === "admin" ? "admin" : "user"]
    )
    return row
}

async function promoteAdminAndSetPassword({ email, passwordHash, username }) {
    return queryOne(
        `
        UPDATE users
        SET role = 'admin', password = $2
        WHERE lower(email) = lower($1)
        RETURNING *
        `,
        [email, passwordHash]
    )
}

async function promoteAdmin(email) {
    return queryOne(
        `
        UPDATE users
        SET role = 'admin'
        WHERE lower(email) = lower($1)
        RETURNING *
        `,
        [email]
    )
}

async function touchLastLogin(id) {
    return queryOne(
        `
        UPDATE users
        SET last_login_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [id]
    )
}

async function updateProfile(id, { username, email, phone }) {
    return queryOne(
        `
        UPDATE users
        SET username = $2, email = $3, phone = $4, updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [id, username, email, phone]
    )
}

async function updateUserLimits(id, { reportLimitMonthly, mockLimitMonthly }) {
    return queryOne(
        `
        UPDATE users
        SET report_limit_monthly = $2, mock_limit_monthly = $3
        WHERE id = $1
        RETURNING *
        `,
        [id, reportLimitMonthly, mockLimitMonthly]
    )
}

function toPublicUser(row) {
    return mapUser(row)
}

async function deleteAccountData(id) {
    const interviews = await queryAll(
        `SELECT id FROM interview_reports WHERE user_id = $1`,
        [id]
    )
    const mocks = await queryAll(
        `SELECT id FROM mock_interview_reports WHERE user_id = $1`,
        [id]
    )
    const row = await queryOne(
        `DELETE FROM users WHERE id = $1 RETURNING id`,
        [id]
    )

    return {
        deleted: Boolean(row),
        interviewIds: interviews.map((item) => item.id),
        mockIds: mocks.map((item) => item.id),
    }
}

module.exports = {
    findByEmail,
    findByUsernameOrEmail,
    findOtherByUsernameOrEmail,
    findById,
    createUser,
    promoteAdminAndSetPassword,
    promoteAdmin,
    updateProfile,
    updateUserLimits,
    touchLastLogin,
    toPublicUser,
    deleteAccountData,
}
