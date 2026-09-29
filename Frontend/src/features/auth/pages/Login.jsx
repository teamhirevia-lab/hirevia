import { useState } from "react"
import { useNavigate, Navigate, useSearchParams } from "react-router"
import { ArrowRight, Eye, EyeSlash } from "@phosphor-icons/react"
import { useAuth } from "../hooks/useAuth"
import LoadingScreen from "../../../shared/LoadingScreen.jsx"
import { homePathFor } from "../../../shared/homePath.js"
import AuthLayout from "../components/AuthLayout.jsx"

function PasswordField({
    id,
    value,
    onChange,
    autoComplete,
    placeholder,
    minLength,
    maxLength,
    hint,
}) {
    const [visible, setVisible] = useState(false)

    return (
        <div className="auth-field">
            <label htmlFor={id}>Password</label>
            <div className="auth-password">
                <input
                    type={visible ? "text" : "password"}
                    id={id}
                    name="password"
                    placeholder={placeholder}
                    value={value}
                    onChange={onChange}
                    autoComplete={autoComplete}
                    minLength={minLength}
                    maxLength={maxLength}
                    required
                />
                <button
                    type="button"
                    aria-label={visible ? "Hide password" : "Show password"}
                    aria-pressed={visible}
                    onClick={() => setVisible((open) => !open)}
                >
                    {visible ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
            </div>
            {hint && <p className="auth-hint">{hint}</p>}
        </div>
    )
}

const Login = () => {
    const { loading, handleLogin, handleRegister, user } = useAuth()
    const [searchParams, setSearchParams] = useSearchParams()
    const [mode, setMode] = useState(searchParams.get("mode") === "register" ? "register" : "login")
    const [username, setUsername] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const navigate = useNavigate()
    const signingIn = mode === "login"

    const changeMode = (next) => {
        setMode(next)
        setError("")
        setPassword("")
        if (next === "register") setSearchParams({ mode: "register" }, { replace: true })
        else setSearchParams({}, { replace: true })
    }

    const handleSubmit = async (event) => {
        event.preventDefault()
        setError("")
        setSubmitting(true)
        try {
            if (signingIn) {
                const nextUser = await handleLogin({ email, password })
                if (nextUser) navigate(homePathFor(nextUser))
            } else {
                const nextUser = await handleRegister({ username, email, password })
                if (nextUser) navigate("/app")
            }
        } catch (err) {
            setError(err?.response?.data?.message || (
                signingIn
                    ? "Could not log in. Check your email and password."
                    : "Could not create your account."
            ))
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <LoadingScreen
                title="Checking your session"
                message="See if you are already signed in."
            />
        )
    }

    if (user) {
        return <Navigate to={homePathFor(user)} replace />
    }

    return (
        <AuthLayout mode={mode} onModeChange={changeMode}>
            <form onSubmit={handleSubmit}>
                {!signingIn && (
                    <div className="auth-field">
                        <label htmlFor="username">Username</label>
                        <input
                            type="text"
                            id="username"
                            name="username"
                            placeholder="How we should address you"
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            autoComplete="username"
                            required
                        />
                    </div>
                )}
                <div className="auth-field">
                    <label htmlFor="email">Email</label>
                    <input
                        type="email"
                        id="email"
                        name="email"
                        placeholder="name@domain.com"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete="email"
                        required
                    />
                </div>
                <PasswordField
                    id="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={signingIn ? "current-password" : "new-password"}
                    placeholder={signingIn ? "Your password" : "At least 8 characters"}
                    minLength={signingIn ? undefined : 8}
                    maxLength={signingIn ? undefined : 128}
                    hint={signingIn ? "" : "8 to 128 characters."}
                />
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="auth-submit" disabled={submitting}>
                    {submitting
                        ? (signingIn ? "Signing in..." : "Creating account...")
                        : (signingIn ? "Sign in to your workspace" : "Create account")}
                    <ArrowRight size={16} />
                </button>
            </form>
        </AuthLayout>
    )
}

export default Login
