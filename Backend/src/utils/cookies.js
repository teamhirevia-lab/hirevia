function cookieOptions() {
    const isProduction = process.env.NODE_ENV === "production"

    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 24 * 60 * 60 * 1000,
        path: "/",
    }
}

function clearCookieOptions() {
    const options = cookieOptions()
    delete options.maxAge
    return options
}

module.exports = {
    cookieOptions,
    clearCookieOptions,
}
