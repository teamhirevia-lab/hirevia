import { useAuth } from "../hooks/useAuth";
import { Navigate } from "react-router";
import LoadingScreen from "../../../shared/LoadingScreen.jsx";

const Protected = ({ children }) => {
    const { loading, user } = useAuth()

    if (loading) {
        return (
            <LoadingScreen
                title="Checking your session"
                message="Restoring your account if you are already signed in."
            />
        )
    }

    if (!user) {
        return <Navigate to="/login" />
    }

    return children
}

export default Protected
