import { Link, useLocation } from "react-router"
import { ArrowUpRight } from "@phosphor-icons/react"
import { useAuth } from "../auth/hooks/useAuth"
import { homePathFor } from "../../shared/homePath"
import "./guestNav.scss"

const GuestNav = () => {
    const { user } = useAuth()
    const { pathname } = useLocation()

    return (
        <header className="guest-nav">
            <Link to="/" className="brand-mark">Hirevia</Link>
            <nav aria-label="Primary">
                {user ? (
                    <Link to={homePathFor(user)} className="button primary-button">
                        Workspace
                        <span className="button__icon" aria-hidden="true">
                            <ArrowUpRight size={14} weight="bold" />
                        </span>
                    </Link>
                ) : (
                    <>
                        {pathname !== "/login" && (
                            <Link to="/login" className="button ghost-button">Sign in</Link>
                        )}
                        {!pathname.startsWith("/login") && (
                            <Link to="/login?mode=register" className="button primary-button">
                                Create account
                                <span className="button__icon" aria-hidden="true">
                                    <ArrowUpRight size={14} weight="bold" />
                                </span>
                            </Link>
                        )}
                    </>
                )}
            </nav>
        </header>
    )
}

export default GuestNav
