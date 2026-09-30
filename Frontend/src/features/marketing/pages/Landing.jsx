import { useState } from "react"
import { Link } from "react-router"
import {
    ArrowRight,
    Brain,
    CaretRight,
    ChartLineUp,
    CheckCircle,
    Clock,
    Crosshair,
    DownloadSimple,
    Eye,
    FileText,
    Flag,
    List,
    LockKey,
    Microphone,
    MicrophoneSlash,
    Paperclip,
    PersonSimple,
    SealCheck,
    ShieldCheck,
    SlidersHorizontal,
    User,
    VideoCameraSlash,
    Waveform,
    X,
} from "@phosphor-icons/react"
import "@fontsource/newsreader/400.css"
import "@fontsource/newsreader/400-italic.css"
import "@fontsource/newsreader/500.css"
import { useAuth } from "../../auth/hooks/useAuth"
import { homePathFor } from "../../../shared/homePath"
import "../landing.scss"

const conventional = [
    ["Thousands of disconnected problems", "Endlessly grinding generic algorithmic puzzles that don't match the actual architectural role."],
    ["Formulaic STAR behavioral prompts", "Reciting memorized scripts that sound robotic and fail when a rigorous interviewer probes them."],
    ["No company or rubric context", "No sense of whether the company prioritizes autonomy, compliance rigor, or rapid prototyping."],
    ["No awareness of your resume", "Preparation that ignores where your background lines up with the job description, and where it does not."],
]

const targeted = [
    ["Company and level specific scenarios", "Built for the team you named, whether that is Stripe infrastructure, a Meta E6 loop, or a platform role."],
    ["Questions mapped to the hiring rubric", "Scored on the vectors that role actually uses: tradeoffs, incidents, and stakeholder judgment."],
    ["Gaps taken from your resume", "Your experience is compared with the job description so the weak spots show up before the interview."],
    ["Live conversational follow-ups", "The interviewer challenges assumptions and tests depth when an answer stays on the surface."],
]

const days = [
    ["Day 01", "Azure architecture and consensus", "Completed"],
    ["Day 02", "Distributed locking and leases", "Completed"],
    ["Day 03", "Geo-replication deep dive", "In progress", true],
    ["Day 04", "Live technical mock", "Scheduled"],
    ["Day 05", "Behavioral calibration", "Upcoming"],
    ["Day 06", "System design simulation", "Upcoming"],
    ["Day 07", "Final readiness pass", "Final polish"],
]

const Landing = () => {
    const { user } = useAuth()
    const [menuOpen, setMenuOpen] = useState(false)
    const startTo = user ? homePathFor(user) : "/login?mode=register"
    const accountTo = user ? homePathFor(user) : "/login"
    const accountLabel = user ? "Workspace" : "Sign in"

    return (
        <div className="landing">
            <a className="skip-link" href="#main">Skip to content</a>
            <div className="lp-top">
            <header className="lp-header">
                <div className="lp-wrap lp-header__inner">
                    <Link to="/" className="lp-brand" onClick={() => setMenuOpen(false)}>
                        <img className="lp-brand__logo" src="/hirevia-logo.png" alt="Hirevia" />
                        <span className="lp-brand__rule" aria-hidden="true" />
                        <span className="lp-brand__tag" aria-hidden="true">Executive briefs</span>
                    </Link>
                    <nav className="lp-nav" aria-label="Primary">
                        <a href="#how-it-works">How it works</a>
                        <a href="#features">Features</a>
                        <a href="#mock-interview">Mock interview</a>
                        <a href="#privacy">Privacy</a>
                    </nav>
                    <div className="lp-header__actions">
                        <Link to={accountTo} className="lp-link">{accountLabel}</Link>
                        <Link to={startTo} className="lp-btn lp-btn--solid">
                            {user ? "Open workspace" : "Start preparing"}
                            <ArrowRight size={14} weight="bold" />
                        </Link>
                        {user && (
                            <Link to={accountTo} className="lp-avatar" aria-label="Open workspace">
                                <User size={16} weight="regular" />
                            </Link>
                        )}
                    </div>
                    <button
                        type="button"
                        className="lp-menu"
                        aria-expanded={menuOpen}
                        aria-controls="landing-menu"
                        aria-label={menuOpen ? "Close menu" : "Open menu"}
                        onClick={() => setMenuOpen((open) => !open)}
                    >
                        {menuOpen ? <X size={18} /> : <List size={18} />}
                    </button>
                </div>
            </header>
            <nav id="landing-menu" className={`lp-nav-panel ${menuOpen ? "is-open" : ""}`} aria-label="On this page">
                <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
                <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
                <a href="#mock-interview" onClick={() => setMenuOpen(false)}>Mock interview</a>
                <a href="#privacy" onClick={() => setMenuOpen(false)}>Privacy</a>
            </nav>
            </div>

            <main id="main" className="lp-main">
                <section className="lp-hero">
                    <div className="lp-hero__wash" aria-hidden="true" />
                    <div className="lp-wrap">
                        <div className="lp-hero__copy">
                            <div className="lp-pill">
                                <span className="lp-dot" aria-hidden="true" />
                                Introducing Hirevia
                            </div>
                            <h1 className="lp-h1">
                                Prepare for the interview you’re <em>actually</em> going to face.
                            </h1>
                            <p className="lp-lead">
                                Hirevia builds a preparation plan around your company, role, job description, and experience, then lets you practice it in a realistic mock interview.
                            </p>
                            <div className="lp-actions">
                                <a className="lp-btn lp-btn--solid" href="#features">
                                    Build my interview plan
                                    <ArrowRight size={14} weight="bold" />
                                </a>
                                <a className="lp-btn lp-btn--ghost" href="#how-it-works">See how it works</a>
                            </div>
                        </div>

                        <div className="lp-stage" aria-label="Sample interview plan for a staff infrastructure role">
                            <div className="lp-chrome">
                                <div className="lp-traffic">
                                    <i /><i /><i />
                                    <span className="lp-mono">hirevia.app/workspace/stripe-staff-infra</span>
                                </div>
                                <span className="lp-sync"><span className="lp-dot" /> Sample plan</span>
                            </div>
                            <div className="lp-cols">
                                <div className="lp-col">
                                    <div>
                                        <div className="lp-col__head">
                                            <span className="lp-label">01 · Target inputs</span>
                                            <SlidersHorizontal size={16} />
                                        </div>
                                        <div className="lp-stack">
                                            <div className="lp-field">
                                                <span className="lp-label">Target company</span>
                                                <div className="lp-field__row">
                                                    <span className="lp-title">Stripe, Inc.</span>
                                                    <span className="lp-chip">FINTECH</span>
                                                </div>
                                            </div>
                                            <div className="lp-field">
                                                <span className="lp-label">Target role</span>
                                                <span className="lp-title">Staff Infrastructure Engineer</span>
                                            </div>
                                            <div className="lp-pair">
                                                <div className="lp-field">
                                                    <span className="lp-label">Experience</span>
                                                    <span>6+ years</span>
                                                </div>
                                                <div className="lp-field">
                                                    <span className="lp-label">Level</span>
                                                    <span>L6 / Staff</span>
                                                </div>
                                            </div>
                                            <div className="lp-field lp-file">
                                                <div className="lp-file__name">
                                                    <FileText size={20} />
                                                    <div>
                                                        <p>Staff resume.pdf</p>
                                                        <p className="lp-label">Parsed · 4 pages</p>
                                                    </div>
                                                </div>
                                                <CheckCircle className="lp-ok" size={18} weight="fill" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="lp-foot">
                                        <span>Resume parsed</span>
                                        <span style={{ color: "var(--lp-red)" }}>Ready to build the plan</span>
                                    </div>
                                </div>

                                <div className="lp-col lp-col--wash">
                                    <div>
                                        <div className="lp-col__head">
                                            <span className="lp-label">02 · What the plan covers</span>
                                            <ChartLineUp size={16} />
                                        </div>
                                        <div className="lp-stack">
                                            <div className="lp-card">
                                                <div className="lp-between">
                                                    <span className="lp-label">Competencies</span>
                                                    <span className="lp-mono" style={{ color: "var(--lp-red)", fontWeight: 650 }}>14 topics</span>
                                                </div>
                                                <div className="lp-meter" aria-hidden="true"><span style={{ width: "100%" }} /></div>
                                                <div className="lp-tags">
                                                    <span>Raft consensus</span>
                                                    <span>PCI-DSS</span>
                                                    <span>Ledger recovery</span>
                                                </div>
                                            </div>
                                            <div className="lp-card">
                                                <div className="lp-between">
                                                    <span className="lp-label">Gaps from the resume</span>
                                                    <span className="lp-alert">3 gaps</span>
                                                </div>
                                                <ul className="lp-list">
                                                    <li><CaretRight className="lp-ok" size={14} /><span>Idempotency when the network partitions</span></li>
                                                    <li><CaretRight className="lp-ok" size={14} /><span>Multi-region shard moves without downtime</span></li>
                                                    <li><CaretRight className="lp-ok" size={14} /><span>Conflict between risk and operations</span></li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="lp-foot">
                                        <span>Rubric</span>
                                        <span className="lp-mono" style={{ color: "var(--lp-ink)" }}>Matched to the role</span>
                                    </div>
                                </div>

                                <div className="lp-col">
                                    <div>
                                        <div className="lp-col__head">
                                            <span className="lp-label">03 · Study plan</span>
                                            <CheckCircle size={16} />
                                        </div>
                                        <div className="lp-stack">
                                            <div className="lp-field">
                                                <div className="lp-between">
                                                    <span className="lp-title">3-day sprint</span>
                                                    <span className="lp-mono" style={{ color: "var(--lp-red)" }}>18 scenarios</span>
                                                </div>
                                                <div className="lp-stack" style={{ marginTop: "0.6rem", gap: "0.4rem" }}>
                                                    <div className="lp-between lp-label" style={{ letterSpacing: 0, textTransform: "none", fontSize: "0.75rem" }}>
                                                        <span>Day 1 · Ledger fault tolerance</span><span className="lp-mono">6</span>
                                                    </div>
                                                    <div className="lp-between lp-label" style={{ letterSpacing: 0, textTransform: "none", fontSize: "0.75rem" }}>
                                                        <span>Day 2 · System design</span><span className="lp-mono">8</span>
                                                    </div>
                                                    <div className="lp-between lp-label" style={{ letterSpacing: 0, textTransform: "none", fontSize: "0.75rem" }}>
                                                        <span>Day 3 · Cross-functional round</span><span className="lp-mono">4</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="lp-ready">
                                                <div>
                                                    <p className="lp-ready__kicker">Simulation ready</p>
                                                    <p className="lp-title">Stripe staff interview</p>
                                                    <p className="lp-ready__sub">45 min · follow-ups on</p>
                                                </div>
                                                <span className="lp-mic" aria-hidden="true"><Microphone size={18} /></span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="lp-foot">
                                        <span>Practice when the plan is ready</span>
                                        <Link to={startTo} style={{ color: "var(--lp-red)" }}>Open a plan</Link>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="lp-band" id="position">
                    <div className="lp-wrap">
                        <div className="lp-intro">
                            <span className="lp-kicker">The problem</span>
                            <h2 className="lp-h2">Generic preparation isn’t enough.</h2>
                            <p className="lp-lead">
                                The questions you face depend on the company, the role, the level, and the decisions already on your resume. Hirevia replaces a generic bank with a plan for that interview.
                            </p>
                        </div>
                        <div className="lp-compare">
                            <article className="lp-compare__card">
                                <div>
                                    <div className="lp-compare__head">
                                        <span className="lp-label">Usual routine</span>
                                        <span className="lp-chip">Generic</span>
                                    </div>
                                    <ul className="lp-points">
                                        {conventional.map(([title, copy]) => (
                                            <li key={title}>
                                                <X className="lp-x" size={18} />
                                                <div>
                                                    <strong>{title}</strong>
                                                    <p>{copy}</p>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <p className="lp-foot">Blind spots stay hidden until the real interview.</p>
                            </article>
                            <article className="lp-compare__card lp-compare__card--focus">
                                <div>
                                    <div className="lp-compare__head">
                                        <span className="lp-label" style={{ color: "var(--lp-red)" }}>Hirevia</span>
                                        <span className="lp-chip" style={{ background: "var(--lp-red)", color: "#fff" }}>For this role</span>
                                    </div>
                                    <ul className="lp-points">
                                        {targeted.map(([title, copy]) => (
                                            <li key={title}>
                                                <CheckCircle className="lp-ok" size={18} weight="fill" />
                                                <div>
                                                    <strong>{title}</strong>
                                                    <p>{copy}</p>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <p className="lp-foot" style={{ color: "var(--lp-ink)" }}>
                                    <span>You know the questions before you walk in.</span>
                                    <ArrowRight size={16} color="#e1034d" />
                                </p>
                            </article>
                        </div>
                    </div>
                </section>

                <section className="lp-section" id="how-it-works">
                    <div className="lp-wrap">
                        <div className="lp-intro">
                            <span className="lp-kicker">How it works</span>
                            <h2 className="lp-h2">From job description to interview-ready.</h2>
                        </div>
                        <div className="lp-steps">
                            <article className="lp-step">
                                <div>
                                    <div className="lp-step__index">
                                        <span className="lp-num">01</span>
                                        <span className="lp-label lp-mono">Intake</span>
                                    </div>
                                    <h3>Tell us about the interview</h3>
                                    <p>Add the company, role, job description, experience level, and a resume. The plan is built from that material.</p>
                                </div>
                                <div className="lp-mini">
                                    <div className="lp-mini__row">
                                        <span>Target role · Microsoft Azure</span>
                                        <span style={{ color: "var(--lp-red)" }}>Ready</span>
                                    </div>
                                    <div className="lp-meter" aria-hidden="true"><span style={{ width: "80%" }} /></div>
                                    <div className="lp-mini__row">
                                        <Paperclip size={13} color="#e1034d" />
                                        <span>Job description parsed</span>
                                    </div>
                                </div>
                            </article>
                            <article className="lp-step">
                                <div>
                                    <div className="lp-step__index">
                                        <span className="lp-num">02</span>
                                        <span className="lp-label lp-mono">Plan</span>
                                    </div>
                                    <h3>Prepare with purpose</h3>
                                    <p>Get technical and behavioral questions for that company, skill gaps, and a day-by-day roadmap.</p>
                                </div>
                                <div className="lp-mini">
                                    <div className="lp-mini__row">
                                        <span style={{ color: "var(--lp-ink)", fontWeight: 600 }}>Distributed locks</span>
                                        <span className="lp-chip">First</span>
                                    </div>
                                    <div className="lp-mini__row">
                                        <span style={{ color: "var(--lp-ink)", fontWeight: 600 }}>Storage tiering</span>
                                        <span className="lp-chip">Next</span>
                                    </div>
                                    <div className="lp-mini__row">
                                        <SealCheck size={13} color="#e1034d" weight="fill" />
                                        <span>Questions written for this role</span>
                                    </div>
                                </div>
                            </article>
                            <article className="lp-step">
                                <div>
                                    <div className="lp-step__index">
                                        <span className="lp-num">03</span>
                                        <span className="lp-label lp-mono">Practice</span>
                                    </div>
                                    <h3>Practice the real thing</h3>
                                    <p>Take a mock with follow-up questions, a live transcript, and a scorecard when you finish.</p>
                                </div>
                                <div className="lp-mini">
                                    <div className="lp-mini__row">
                                        <span style={{ color: "var(--lp-ink)", fontWeight: 600 }}>Listening</span>
                                        <span className="lp-wave" aria-hidden="true"><i /><i /><i /></span>
                                    </div>
                                    <p className="lp-mono">“…mitigated the race with a monotonic clock…”</p>
                                    <div className="lp-mini__row" style={{ color: "var(--lp-red)" }}>
                                        <span>Follow-up queued</span>
                                        <span className="lp-mono">Sample score</span>
                                    </div>
                                </div>
                            </article>
                        </div>
                    </div>
                </section>

                <section className="lp-band" id="features">
                    <div className="lp-wrap">
                        <div className="lp-intro">
                            <span className="lp-kicker">The plan</span>
                            <h2 className="lp-h2">Preparation built around your opportunity.</h2>
                            <p className="lp-lead">A sample blueprint for a mid-level engineering interview. Yours is generated from the role and resume you provide.</p>
                        </div>
                        <div className="lp-stage">
                            <div className="lp-board__bar">
                                <div className="lp-board__id">
                                    <span className="lp-board__mark" aria-hidden="true">M</span>
                                    <div>
                                        <h3>Software Engineer II · Microsoft Azure <span className="lp-level">Sample</span></h3>
                                        <p>2 years · distributed systems · Go, C#, SQL</p>
                                    </div>
                                </div>
                                <span className="lp-export"><DownloadSimple size={16} /> Export comes with the plan</span>
                            </div>
                            <div className="lp-cols">
                                <div className="lp-col">
                                    <div className="lp-between" style={{ marginBottom: "1rem" }}>
                                        <h4 className="lp-title">Technical focus</h4>
                                        <span className="lp-label lp-mono">4 areas</span>
                                    </div>
                                    {[
                                        ["Consensus and Paxos", "90%"],
                                        ["Queues and idempotence", "75%"],
                                        ["SQL indexes and sharding", "60%"],
                                        ["Latency profiling", "45%"],
                                    ].map(([label, width]) => (
                                        <div className="lp-skill" key={label}>
                                            <div className="lp-between">
                                                <span>{label}</span>
                                            </div>
                                            <div className="lp-meter" aria-hidden="true"><span style={{ width }} /></div>
                                        </div>
                                    ))}
                                </div>
                                <div className="lp-col">
                                    <div className="lp-between" style={{ marginBottom: "1rem" }}>
                                        <h4 className="lp-title">Behavioral themes</h4>
                                        <span className="lp-label lp-mono">From the role</span>
                                    </div>
                                    <div className="lp-stack">
                                        <div className="lp-note">
                                            <span>Customer impact</span>
                                            <p>How you connect a broken SLA to the telemetry that would have caught it.</p>
                                        </div>
                                        <div className="lp-note">
                                            <span>Working across teams</span>
                                            <p>How you resolved friction with security without stalling the release.</p>
                                        </div>
                                        <div className="lp-note">
                                            <span>Ownership</span>
                                            <p>A blameless write-up after a partition took the service down.</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="lp-col">
                                    <div className="lp-between" style={{ marginBottom: "1rem" }}>
                                        <h4 className="lp-title">Gaps versus the job</h4>
                                        <span className="lp-label" style={{ color: "var(--lp-error)" }}>2 flagged</span>
                                    </div>
                                    <div className="lp-stack">
                                        <div className="lp-gap">
                                            <div className="lp-between">
                                                <strong>Geo-replication</strong>
                                                <span className="lp-alert">Critical</span>
                                            </div>
                                            <p>The resume shows a single region. This role expects an active-active failover story.</p>
                                        </div>
                                        <div className="lp-gap lp-gap--mild">
                                            <div className="lp-between">
                                                <strong>Memory management</strong>
                                                <span className="lp-chip">Moderate</span>
                                            </div>
                                            <p>Most of the work is in Go. The role also asks about lower-level allocation.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="lp-roadmap">
                                <div className="lp-between" style={{ marginBottom: "1rem", alignItems: "flex-end" }}>
                                    <div>
                                        <h4>7-day preparation roadmap</h4>
                                        <p className="lp-roadmap__sub">A sample week. Your plan follows the date you set.</p>
                                    </div>
                                    <span className="lp-chip">7 days · about 90 min a day</span>
                                </div>
                                <div className="lp-days">
                                    {days.map(([label, title, state, today]) => (
                                        <div className={today ? "lp-day lp-day--today" : "lp-day"} key={label}>
                                            <span className="lp-label lp-mono">{today ? "Day 03 · today" : label}</span>
                                            <p>{title}</p>
                                            <span className="lp-label" style={{ letterSpacing: 0, textTransform: "none" }}>{state}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="lp-section" id="mock-interview">
                    <div className="lp-wrap">
                        <div className="lp-intro" style={{ maxWidth: "46rem" }}>
                            <span className="lp-kicker">Mock interview</span>
                            <h2 className="lp-h2">Practice the interview, not just the answers.</h2>
                            <p className="lp-lead">
                                Questions come from your plan. Your answers can trigger a follow-up, the same way a careful interviewer would push on a thin explanation.
                            </p>
                        </div>
                        <div className="lp-stage">
                            <div className="lp-session">
                                <div className="lp-between" style={{ gap: "0.7rem" }}>
                                    <span className="lp-live" aria-hidden="true" />
                                    <span className="lp-title">Staff infrastructure simulation</span>
                                    <span className="lp-label lp-mono">Question 4 of 9</span>
                                </div>
                                <div className="lp-between" style={{ gap: "0.75rem" }}>
                                    <span className="lp-export lp-mono"><Clock size={16} /> 18:42</span>
                                    <span className="lp-end">End session</span>
                                </div>
                            </div>
                            <div className="lp-cols lp-cols--split">
                                <div className="lp-col" style={{ gridColumn: "span 1" }}>
                                    <div className="lp-stack" style={{ gap: "1.25rem" }}>
                                        <div>
                                            <div className="lp-between" style={{ marginBottom: "0.4rem" }}>
                                                <span className="lp-chip">Prompt</span>
                                                <span className="lp-label">From the Stripe plan</span>
                                            </div>
                                            <p className="lp-prompt">
                                                How would you design the ledger API for 50k requests a second, with p99 under 25ms, and exactly-once execution during a database failover?
                                            </p>
                                        </div>
                                        <div className="lp-follow">
                                            <div className="lp-between" style={{ marginBottom: "0.35rem", justifyContent: "flex-start", gap: "0.4rem" }}>
                                                <Brain size={18} color="#e1034d" />
                                                <span className="lp-label" style={{ color: "var(--lp-red)" }}>Follow-up</span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: "0.8125rem" }}>
                                                The answer mentioned an in-memory cache and did not explain invalidation or replay during a partition.
                                            </p>
                                        </div>
                                        <div>
                                            <div className="lp-between" style={{ marginBottom: "0.4rem" }}>
                                                <span className="lp-label lp-mono">Live transcript</span>
                                                <span className="lp-label" style={{ color: "var(--lp-red)" }}>On this device</span>
                                            </div>
                                            <div className="lp-transcript">
                                                Each payload carries an idempotency token. We persist it to a Raft log before the worker queue, and shard that log by merchant.
                                                <span className="lp-caret" aria-hidden="true" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="lp-foot">
                                        <span className="lp-between" style={{ gap: "0.4rem" }}><Microphone size={16} color="#e1034d" /> Microphone</span>
                                        <span className="lp-bars" aria-hidden="true">
                                            <i style={{ height: "40%" }} />
                                            <i style={{ height: "80%", animationDelay: "0.1s" }} />
                                            <i style={{ height: "100%", animationDelay: "0.2s" }} />
                                            <i style={{ height: "55%", animationDelay: "0.3s" }} />
                                            <i style={{ height: "70%", animationDelay: "0.15s" }} />
                                        </span>
                                    </div>
                                </div>
                                <div className="lp-col lp-col--wash">
                                    <div>
                                        <div className="lp-between" style={{ marginBottom: "0.75rem" }}>
                                            <span className="lp-label">Delivery, on your machine</span>
                                            <span className="lp-chip">Not uploaded</span>
                                        </div>
                                        <div className="lp-feed">
                                            <img src="/media/hero-desk.jpg" alt="Hands typing on a laptop at a wooden desk" />
                                            <span className="lp-hud lp-hud--tl"><span className="lp-dot" /> Local preview</span>
                                        </div>
                                        <div className="lp-stack" style={{ marginTop: "1rem" }}>
                                            {[
                                                ["Technical precision", "Tradeoffs stated clearly", "8.4"],
                                                ["Structure", "The answer has a shape", "8.1"],
                                                ["Cadence", "Steady pace, few fillers", "7.8"],
                                            ].map(([title, copy, score]) => (
                                                <div className="lp-statline" key={title}>
                                                    <div>
                                                        <div className="lp-title">{title}</div>
                                                        <p>{copy}</p>
                                                    </div>
                                                    <div><span className="lp-score">{score}</span><span className="lp-mono"> /10</span></div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="lp-foot">
                                        <span>Video stays in the browser</span>
                                        <span>Session stays on your account</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="lp-band">
                    <div className="lp-wrap">
                        <div className="lp-intro">
                            <span className="lp-kicker">After the mock</span>
                            <h2 className="lp-h2">Know what to improve before the real interview.</h2>
                            <p className="lp-lead">Each finished mock returns a scorecard: what landed, and the exact places to tighten.</p>
                        </div>
                        <div className="lp-stage">
                            <div className="lp-metrics">
                                <div className="lp-metric lp-metric--hero">
                                    <span className="lp-label">Overall</span>
                                    <div><strong>82</strong> <span className="lp-mono">/ 100</span></div>
                                    <span className="lp-label" style={{ color: "var(--lp-red)", letterSpacing: 0, textTransform: "none" }}>Sample result</span>
                                </div>
                                <div className="lp-metric">
                                    <span className="lp-label">Technical depth</span>
                                    <div><strong>8.4</strong> <span className="lp-mono">/ 10</span></div>
                                </div>
                                <div className="lp-metric">
                                    <span className="lp-label">Communication</span>
                                    <div><strong>8.1</strong> <span className="lp-mono">/ 10</span></div>
                                </div>
                                <div className="lp-metric">
                                    <span className="lp-label">Presentation</span>
                                    <div><strong>7.8</strong> <span className="lp-mono">/ 10</span></div>
                                </div>
                            </div>
                            <div className="lp-split-text" style={{ padding: "1.5rem" }}>
                                <div>
                                    <div className="lp-between" style={{ justifyContent: "flex-start", gap: "0.4rem", marginBottom: "1rem" }}>
                                        <CheckCircle size={20} color="#e1034d" weight="fill" />
                                        <h3 className="lp-title">What landed</h3>
                                    </div>
                                    <div className="lp-stack">
                                        <div className="lp-callout">
                                            <strong>Rate limiting under contention</strong>
                                            <p>Token bucket versus a sliding window, including what happens when Redis is under heavy writes.</p>
                                        </div>
                                        <div className="lp-callout">
                                            <strong>Measured delivery</strong>
                                            <p>A steady pace, with a pause before committing to a schema.</p>
                                        </div>
                                        <div className="lp-callout">
                                            <strong>Tradeoff on service boundaries</strong>
                                            <p>Defended a modular monolith instead of splitting too early.</p>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <div className="lp-between" style={{ justifyContent: "flex-start", gap: "0.4rem", marginBottom: "1rem" }}>
                                        <Flag size={20} color="#9a1b1b" />
                                        <h3 className="lp-title">What to refine</h3>
                                    </div>
                                    <div className="lp-stack">
                                        <div className="lp-callout lp-callout--flag">
                                            <strong>Behavioral answers ran long on context</strong>
                                            <p>The stakeholder story spent most of its time on background, and little on the action you took.</p>
                                        </div>
                                        <div className="lp-callout lp-callout--flag">
                                            <strong>Composite SQL indexes</strong>
                                            <p>Column order versus a covering index under a multi-tenant filter.</p>
                                        </div>
                                        <div className="lp-callout lp-callout--flag">
                                            <strong>Error recovery</strong>
                                            <p>Circuit-breaker conditions came up only after the follow-up asked for them.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="lp-foot" style={{ padding: "1rem 1.5rem" }}>
                                <span>Run another mock after you study the gaps.</span>
                                <Link to={startTo} className="lp-btn lp-btn--solid">Start a mock</Link>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="lp-section">
                    <div className="lp-wrap">
                        <div className="lp-intro">
                            <span className="lp-kicker">How you come across</span>
                            <h2 className="lp-h2">Your answer is more than what you say.</h2>
                            <p className="lp-lead">
                                During the mock, presentation signals are computed in the browser. The camera feed is not recorded or uploaded.
                            </p>
                        </div>
                        <div className="lp-signals">
                            {[
                                [Eye, "88%", "Eye contact", "Looking at the lens while you state the point, without drifting off camera."],
                                [Crosshair, "92%", "Gaze", "A natural scan, without reading from a second screen."],
                                [PersonSimple, "Steady", "Posture", "Upright and centered, without leaning in when the question gets hard."],
                                [Waveform, "135 wpm", "Cadence", "Room for a pause. Fillers stay rare."],
                            ].map(([Icon, stat, title, copy]) => (
                                <article className="lp-signal" key={title}>
                                    <div>
                                        <div className="lp-between">
                                            <Icon size={24} color="#e1034d" />
                                            <span className="lp-mono" style={{ color: "var(--lp-red)", fontWeight: 650 }}>{stat}</span>
                                        </div>
                                        <h3>{title}</h3>
                                        <p>{copy}</p>
                                    </div>
                                </article>
                            ))}
                        </div>
                        <div className="lp-trust">
                            <ShieldCheck size={22} color="#e1034d" />
                            <p><strong style={{ color: "var(--lp-ink)" }}>On your device. </strong>Webcam frames are processed in the browser. They are not stored or sent to the server.</p>
                            <span className="lp-label" style={{ color: "var(--lp-red)" }}>Stays local</span>
                        </div>
                    </div>
                </section>

                <section className="lp-band" id="privacy">
                    <div className="lp-wrap">
                        <div className="lp-intro">
                            <span className="lp-kicker">Privacy</span>
                            <h2 className="lp-h2">Your interview stays yours.</h2>
                            <p className="lp-lead">The camera never leaves the browser. What you do save lives on your account, and you can delete that account.</p>
                        </div>
                        <div className="lp-pillars">
                            <article className="lp-pillar">
                                <div>
                                    <span className="lp-iconbox"><VideoCameraSlash size={22} /></span>
                                    <h3>Camera stays in your browser</h3>
                                    <p>Frames are read in memory for presentation cues. No video stream is uploaded.</p>
                                </div>
                                <p className="lp-foot">Nothing visual leaves the tab</p>
                            </article>
                            <article className="lp-pillar">
                                <div>
                                    <span className="lp-iconbox"><MicrophoneSlash size={22} /></span>
                                    <h3>No recordings are saved</h3>
                                    <p>Audio is transcribed in the session so you can review the debrief. Raw audio and video are not stored.</p>
                                </div>
                                <p className="lp-foot">Transcripts stay on your account</p>
                            </article>
                            <article className="lp-pillar">
                                <div>
                                    <span className="lp-iconbox"><LockKey size={22} /></span>
                                    <h3>Resume is for the plan</h3>
                                    <p>The resume is used to build questions and gaps for you. It is not sold.</p>
                                </div>
                                <p className="lp-foot">Delete the account to remove it</p>
                            </article>
                        </div>
                        <Link className="lp-more" to={startTo}>
                            {user ? "Open your workspace" : "Create an account"} <ArrowRight size={14} />
                        </Link>
                    </div>
                </section>

                <section className="lp-section">
                    <div className="lp-wrap">
                        <div className="lp-cta">
                            <span className="lp-kicker">Interview readiness</span>
                            <h2>Your next interview deserves better preparation.</h2>
                            <p>Build a plan for one role and see where you stand before the conversation. It follows the job you paste in.</p>
                            <div className="lp-actions" style={{ justifyContent: "flex-start" }}>
                                <Link to={startTo} className="lp-btn lp-btn--light">
                                    {user ? "Open your workspace" : "Build your plan"}
                                    <ArrowRight size={14} weight="bold" />
                                </Link>
                                <span className="lp-cta__note">A few minutes to set up</span>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="lp-footer">
                <div className="lp-wrap" style={{ paddingTop: "2.5rem" }}>
                    <div className="lp-manifesto">
                        <p>Don’t prepare for a generic interview. Prepare for yours.</p>
                        <span>Hirevia</span>
                    </div>
                    <div className="lp-footer__grid">
                        <div>
                            <Link to="/" className="lp-brand">
                                <img className="lp-brand__logo" src="/hirevia-logo.png" alt="Hirevia" />
                            </Link>
                            <p className="lp-lead" style={{ fontSize: "0.8125rem", marginTop: "0.6rem" }}>
                                A preparation plan and a scored mock, built from the role you are actually interviewing for.
                            </p>
                        </div>
                        <div className="lp-footer__links">
                            <div className="lp-footer__col">
                                <span className="lp-label">Product</span>
                                <a href="#how-it-works">How it works</a>
                                <a href="#features">The plan</a>
                                <a href="#mock-interview">Mock interview</a>
                            </div>
                            <div className="lp-footer__col">
                                <span className="lp-label">Account</span>
                                <Link to={accountTo}>{accountLabel}</Link>
                                <Link to={startTo}>{user ? "Workspace" : "Create account"}</Link>
                                <a href="#privacy">Privacy</a>
                            </div>
                            <div className="lp-footer__col">
                                <span className="lp-label">Practice</span>
                                <span>Video stays in the browser</span>
                                <span>Delete your account anytime</span>
                            </div>
                        </div>
                    </div>
                    <div className="lp-legal">
                        <p>© {new Date().getFullYear()} Hirevia</p>
                        <p>Built for the interview in front of you.</p>
                    </div>
                </div>
            </footer>
        </div>
    )
}

export default Landing
