import { Navigate } from "react-router"
import { useAuth } from "../hooks/useAuth"
import LoadingScreen from "../../../shared/LoadingScreen.jsx"

const AdminOnly = ({ children }) => {
    const { loading, user } = useAuth()

    if (loading) {
        return (
            <LoadingScreen
                title="Checking your session"
                message="Confirming admin access."
            />
        )
    }

    if (!user) {
        return <Navigate to="/login" replace />
    }

    if (user.role !== "admin") {
        return <Navigate to="/app" replace />
    }

    return children
}

export default AdminOnly
