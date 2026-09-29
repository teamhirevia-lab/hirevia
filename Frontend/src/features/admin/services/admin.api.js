import axios from "axios"

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    withCredentials: true,
    headers: { "X-Requested-With": "hirevia" },
})

export async function getAdminDashboard() {
    const response = await api.get("/api/admin/dashboard")
    return response.data
}

export async function getAdminUsers() {
    const response = await api.get("/api/admin/users")
    return response.data
}

export async function updateAdminSettings({ reportLimitMonthly, mockLimitMonthly }) {
    const response = await api.patch("/api/admin/settings", {
        reportLimitMonthly,
        mockLimitMonthly,
    })
    return response.data
}

export async function grantUserQuota(userId, { kind, amount }) {
    const response = await api.post(`/api/admin/users/${userId}/grants`, {
        kind,
        amount,
    })
    return response.data
}

export async function getAdminFeedback() {
    const response = await api.get("/api/admin/feedback")
    return response.data
}
