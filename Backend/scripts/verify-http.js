require("dotenv").config()
if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run verification scripts in production")
    process.exit(1)
}
const { logSafeError } = require("../src/utils/redact")

async function request(path, { method = "GET", body, cookie } = {}) {
    const headers = {
        "Content-Type": "application/json",
        "X-Requested-With": "hirevia",
    }
    if (cookie) headers.Cookie = cookie

    const response = await fetch(`http://localhost:3000${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    })

    const setCookie = response.headers.getSetCookie?.() || []
    const tokenCookie = setCookie.find((value) => value.startsWith("token="))
    const nextCookie = tokenCookie ? tokenCookie.split(";")[0] : cookie
    const data = await response.json().catch(() => ({}))

    return { status: response.status, data, cookie: nextCookie, setCookie }
}

async function main() {
    const stamp = Date.now()
    const registered = await request("/api/auth/register", {
        method: "POST",
        body: {
            username: `http_${stamp}`,
            email: `http_${stamp}@hirevia.test`,
            password: "Secret123!",
        },
    })

    if (registered.status !== 201 || !registered.data.user?.id) {
        throw new Error(`register failed: ${registered.status} ${JSON.stringify(registered.data)}`)
    }

    const me = await request("/api/auth/get-me", { cookie: registered.cookie })
    if (me.status !== 200 || me.data.user?.email !== registered.data.user.email) {
        throw new Error(`get-me failed: ${me.status} ${JSON.stringify(me.data)}`)
    }

    const reports = await request("/api/interview/", { cookie: registered.cookie })
    if (reports.status !== 200 || !Array.isArray(reports.data.interviewReports)) {
        throw new Error(`reports failed: ${reports.status} ${JSON.stringify(reports.data)}`)
    }

    const logout = await request("/api/auth/logout", { method: "POST", cookie: registered.cookie })
    if (logout.status !== 200) {
        throw new Error(`logout failed: ${logout.status}`)
    }

    const after = await request("/api/auth/get-me", { cookie: registered.cookie })
    if (after.status !== 401) {
        throw new Error(`blacklist failed: ${after.status} ${JSON.stringify(after.data)}`)
    }

    console.log("HTTP auth + cookie + Redis blacklist passed")
}

main().catch((err) => {
    logSafeError("verify-http failed:", err)
    process.exit(1)
})
