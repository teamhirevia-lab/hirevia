import { useContext, useEffect } from "react";
import { AuthContext } from "../auth.context";
import { login, register, logout, getMe, deleteAccount, updateProfile } from "../services/auth.api"

function clearLocalInterviewDrafts() {
    const keys = []
    for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index)
        if (key?.startsWith("mock_")) keys.push(key)
    }
    keys.forEach((key) => localStorage.removeItem(key))
}

export const useAuth = () => {

    const context = useContext(AuthContext)
    const { user, setUser, loading, setLoading } = context

    const handleLogin = async ({ email, password }) => {
        const data = await login({ email, password })
        setUser(data.user)
        return data.user
    }

    const handleRegister = async ({ username, email, password }) => {
        const data = await register({ username, email, password })
        setUser(data.user)
        return data.user
    }

    const handleLogout = async () => {
        try {
            await logout()
        } finally {
            setUser(null)
        }
    }

    const handleUpdateProfile = async (profile) => {
        const data = await updateProfile(profile)
        setUser(data.user)
        return data.user
    }

    const handleDeleteAccount = async ({ password }) => {
        await deleteAccount({ password })
        clearLocalInterviewDrafts()
        setUser(null)
    }

    const refreshUser = async () => {
        const data = await getMe()
        setUser(data?.user || null)
        return data?.user || null
    }

    useEffect(() => {
        const getAndSetUser = async () => {
            try {
                const data = await getMe()
                setUser(data?.user || null)
            } catch {
                setUser(null)
            } finally {
                setLoading(false)
            }
        }

        getAndSetUser()
    }, [])

    return { user, loading, handleRegister, handleLogin, handleLogout, handleUpdateProfile, handleDeleteAccount, refreshUser }
}
