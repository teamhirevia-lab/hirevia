const bcrypt = require("bcryptjs")
const userRepository = require("../repositories/user.repository")

async function seedAdmin() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
    const password = process.env.ADMIN_PASSWORD
    const username = (process.env.ADMIN_USERNAME || "admin").trim()

    if (!email || !password) {
        console.warn("ADMIN_EMAIL or ADMIN_PASSWORD is not set; skipping admin seed")
        return
    }

    if (password.length < 8) {
        console.warn("ADMIN_PASSWORD must be at least 8 characters; skipping admin seed")
        return
    }

    const existingByEmail = await userRepository.findByEmail(email)

    if (existingByEmail) {
        await userRepository.promoteAdmin(email)
        console.log(`Admin role confirmed for ${email}`)
        return
    }

    const hash = await bcrypt.hash(password, 10)

    const clash = await userRepository.findByUsernameOrEmail(username, email)
    const safeUsername = clash ? `admin_${email.split("@")[0]}`.slice(0, 40) : username

    await userRepository.createUser({
        username: safeUsername,
        email,
        password: hash,
        role: "admin",
    })
    console.log(`Admin account created for ${email}`)
}

module.exports = { seedAdmin }
