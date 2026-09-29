import { Navigate } from "react-router"

const Register = () => {
    return <Navigate to="/login?mode=register" replace />
}

export default Register
