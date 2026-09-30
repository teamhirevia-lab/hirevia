import { useEffect, useRef, useState } from "react"
import { Link, NavLink, useLocation, useNavigate } from "react-router"
import { ArrowUpRight, ChatText, List, SignOut, User, X } from "@phosphor-icons/react"
import { useAuth } from "../features/auth/hooks/useAuth"
import BrandLogo from "./BrandLogo"
import "./appShell.scss"

function renewalLabel(renewsAt) {
    const renews = new Date(renewsAt || "")
    if (Number.isNaN(renews.getTime())) return ""
    return renews.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
    })
}

const AppShell = ({ children }) => {
    const { user, handleLogout } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()
    const profileSlotRef = useRef(null)
    const [profileOpen, setProfileOpen] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)

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

    useEffect(() => {
        setMenuOpen(false)
        setProfileOpen(false)
    }, [location.pathname])

    const reportsLeft = user?.quota?.reports?.remaining
    const mocksLeft = user?.quota?.mocks?.remaining
    const showQuota = user?.role !== "admin" && reportsLeft != null && mocksLeft != null
    const renewsOn = renewalLabel(user?.quota?.renewsAt)
    const homeTo = user?.role === "admin" ? "/admin" : "/app"

    return (
        <div className="app-shell">
            <a className="skip-link" href="#main">Skip to content</a>
            <header className="app-shell__bar">
                <BrandLogo to={homeTo} />
                <nav className={`app-shell__nav ${menuOpen ? "is-open" : ""}`} id="workspace-menu" aria-label="Workspace">
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
                            aria-label={`${reportsLeft} reports and ${mocksLeft} mocks left. Renews ${renewsOn}.`}
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
                <button
                    type="button"
                    className="app-shell__menu"
                    aria-expanded={menuOpen}
                    aria-controls="workspace-menu"
                    aria-label={menuOpen ? "Close menu" : "Open menu"}
                    onClick={() => setMenuOpen((open) => !open)}
                >
                    {menuOpen ? <X size={18} /> : <List size={18} />}
                </button>
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
