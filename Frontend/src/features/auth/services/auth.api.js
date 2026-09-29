import axios from "axios"

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    withCredentials: true,
    headers: { "X-Requested-With": "hirevia" },
})

export async function register({ username, email, password }) {
    const response = await api.post("/api/auth/register", {
        username, email, password
    })
    return response.data
}

export async function login({ email, password }) {
    const response = await api.post("/api/auth/login", {
        email, password
    })
    return response.data
}

export async function logout() {
    const response = await api.post("/api/auth/logout")
    return response.data
}

export async function updateProfile({ username, email, phone }) {
    const response = await api.patch("/api/auth/profile", {
        username, email, phone
    })
    return response.data
}

export async function getMe() {
    const response = await api.get("/api/auth/get-me")
    return response.data
}

export async function deleteAccount({ password }) {
    const response = await api.delete("/api/auth/account", {
        data: { password }
    })
    return response.data
}

export async function submitFeedback({ name, email, phone, message }) {
    const response = await api.post("/api/feedback", {
        name, email, phone, message
    })
    return response.data
}
