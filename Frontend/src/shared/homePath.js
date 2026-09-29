export function homePathFor(user) {
    return user?.role === "admin" ? "/admin" : "/app"
}
