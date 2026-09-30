import { Link } from "react-router"
import { ArrowLeft, LockKey, ShieldCheck } from "@phosphor-icons/react"
import BrandLogo from "../../../shared/BrandLogo"
import "../auth.screen.scss"

const AuthLayout = ({ mode, onModeChange, children }) => {
    const signingIn = mode === "login"

    return (
        <div className="auth-screen">
            <a className="skip-link" href="#auth-form">Skip to form</a>
            <header className="auth-screen__bar">
                <div className="auth-screen__bar-inner">
                    <div className="auth-screen__brand-row">
                        <BrandLogo />
                    </div>
                    <Link to="/" className="auth-screen__back">
                        <ArrowLeft size={16} />
                        Back to site
                    </Link>
                </div>
            </header>

            <main className="auth-screen__main">
                <div className="auth-screen__grid">
                    <section className="auth-screen__story">
                        <p className="auth-screen__kicker">
                            <ShieldCheck size={18} />
                            Interview practice
                        </p>
                        <h1>
                            Prepare for the interview you are <em>actually</em> going to face.
                        </h1>
                        <p className="auth-screen__lead">
                            A plan built from the company, the role, and your resume, then a mock that follows up when an answer stays thin.
                        </p>

                        <article className="auth-dossier" aria-label="Sample preparation plan">
                            <div className="auth-dossier__top">
                                <div>
                                    <p className="auth-dossier__status"><i /> Sample plan</p>
                                    <h2>Staff Infrastructure Engineer</h2>
                                    <p>Target: Stripe · distributed systems</p>
                                </div>
                                <div className="auth-gauge" aria-hidden="true">
                                    <svg viewBox="0 0 36 36">
                                        <path
                                            className="auth-gauge__track"
                                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                            fill="none"
                                            strokeWidth="3"
                                        />
                                        <path
                                            className="auth-gauge__value"
                                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                            fill="none"
                                            strokeDasharray="91, 100"
                                            strokeLinecap="round"
                                            strokeWidth="3"
                                        />
                                    </svg>
                                    <strong>91%</strong>
                                    <span>Sample</span>
                                </div>
                            </div>
                            <div className="auth-sprint">
                                <span>3-day sample roadmap</span>
                                <div>
                                    <p><small>Day 01</small>Consensus</p>
                                    <p><small>Day 02</small>Cross-team</p>
                                    <p><small>Day 03</small>Live mock</p>
                                </div>
                            </div>
                            <p className="auth-dossier__note">
                                <LockKey size={16} />
                                The camera stays in the browser. Plans and answers stay on your account.
                            </p>
                        </article>
                    </section>

                    <section className="auth-screen__card-wrap">
                        <div className="auth-card" id="auth-form">
                            <div className="auth-tabs" role="tablist">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={signingIn}
                                    className={signingIn ? "is-active" : undefined}
                                    onClick={() => onModeChange("login")}
                                >
                                    Sign in
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={!signingIn}
                                    className={signingIn ? undefined : "is-active"}
                                    onClick={() => onModeChange("register")}
                                >
                                    Create account
                                </button>
                            </div>
                            {!signingIn && (
                                <p className="auth-card__note">
                                    Create an account to save a plan, run a mock, and keep the scorecard.
                                </p>
                            )}
                            {children}
                            <p className="auth-card__fine">
                                You stay signed in on this browser.
                            </p>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    )
}

export default AuthLayout
