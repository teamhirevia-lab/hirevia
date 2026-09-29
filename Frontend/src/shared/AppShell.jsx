import { useEffect, useRef, useState } from "react"
import { Link, NavLink, useNavigate } from "react-router"
import { ArrowUpRight, ChatText, SignOut, User } from "@phosphor-icons/react"
import { useAuth } from "../features/auth/hooks/useAuth"
import "./appShell.scss"

function renewalLabel(period) {
    const match = /^(\d{4})-(\d{2})$/.exec(period || "")
    const now = new Date()
    const year = match ? Number(match[1]) : now.getUTCFullYear()
    const month = match ? Number(match[2]) : now.getUTCMonth() + 1
    const renews = new Date(Date.UTC(year, month, 1))
    return renews.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
    })
}

const AppShell = ({ children }) => {
    const { user, handleLogout } = useAuth()
    const navigate = useNavigate()
    const profileSlotRef = useRef(null)
    const [profileOpen, setProfileOpen] = useState(false)

    useEffect(() => {
        if (!profileOpen) return undefined
        const onKey = (event) => {
            if (event.key === "Escape") setProfileOpen(false)
        }
        const onPointer = (event) => {
            if (!profileSlotRef.current?.contains(event.target)) setProfileOpen(false)
        }
        window.addEventListener("keydown", onKey)
        window.addEventListener("pointerdown", onPointer)
        return () => {
            window.removeEventListener("keydown", onKey)
            window.removeEventListener("pointerdown", onPointer)
        }
    }, [profileOpen])

    const reportsLeft = user?.quota?.reports?.remaining
    const mocksLeft = user?.quota?.mocks?.remaining
    const showQuota = user?.role !== "admin" && reportsLeft != null && mocksLeft != null
    const renewsOn = renewalLabel(user?.quota?.period)

    return (
        <div className="app-shell">
            <a className="skip-link" href="#main">Skip to content</a>
            <header className="app-shell__bar">
                <Link to={user?.role === "admin" ? "/admin" : "/app"} className="brand-mark">Hirevia</Link>
                <nav className="app-shell__nav" aria-label="Workspace">
                    {user?.role === "admin" ? (
                        <NavLink to="/admin" className="app-shell__link">Admin</NavLink>
                    ) : (
                        <>
                            <NavLink to="/app" end className="app-shell__link">Home</NavLink>
                            <NavLink to="/app/new" className="app-shell__link">New plan</NavLink>
                        </>
                    )}
                </nav>
                <div className="app-shell__user">
                    {showQuota && (
                        <span
                            className="quota-button"
                            role="status"
                            aria-label={`This month: ${reportsLeft} reports and ${mocksLeft} mocks left. Renews ${renewsOn}.`}
                        >
                            <span className="quota-button__counts">
                                <span>{reportsLeft} reports</span>
                                <span>{mocksLeft} mocks</span>
                            </span>
                            <span className="quota-button__renew">Renews {renewsOn}</span>
                        </span>
                    )}
                    <div className="profile-slot" ref={profileSlotRef}>
                        <button
                            type="button"
                            className="profile-trigger"
                            aria-expanded={profileOpen}
                            aria-haspopup="menu"
                            aria-label="Account"
                            onClick={() => setProfileOpen((open) => !open)}
                        >
                            <User size={18} />
                        </button>
                        {profileOpen && (
                            <div className="account-menu" role="menu" aria-label="Account">
                                {user?.role !== "admin" && (
                                    <>
                                        <Link role="menuitem" to="/account/profile" onClick={() => setProfileOpen(false)}>
                                            <User size={16} />
                                            Profile
                                        </Link>
                                        <Link role="menuitem" to="/account/feedback" onClick={() => setProfileOpen(false)}>
                                            <ChatText size={16} />
                                            Feedback
                                        </Link>
                                    </>
                                )}
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={async () => {
                                        await handleLogout()
                                        navigate("/")
                                    }}
                                >
                                    <SignOut size={16} />
                                    Sign out
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>
            <main id="main" className="app-shell__main">
                {children}
            </main>
        </div>
    )
}

export const CtaArrow = () => (
    <span className="button__icon" aria-hidden="true">
        <ArrowUpRight size={14} weight="bold" />
    </span>
)

export default AppShell
