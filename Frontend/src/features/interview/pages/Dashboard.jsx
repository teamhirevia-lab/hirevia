import { Link, useNavigate } from "react-router"
import { ArrowUpRight, Trash } from "@phosphor-icons/react"
import { useEffect, useState } from "react"
import { useInterview } from "../hooks/useInterview"
import { useAuth } from "../../auth/hooks/useAuth"
import { idOf } from "../../../shared/id"
import AppShell from "../../../shared/AppShell"
import LoadingScreen from "../../../shared/LoadingScreen"
import ProgressChart from "../../../shared/ProgressChart"
import { buildProgress, greetingFor } from "../utils/progress"
import { formatMatchScore, matchScoreTone } from "../../../shared/score"
import "../styles/dashboard.scss"

const Dashboard = () => {
    const { loading, reports, deleteReportById } = useInterview()
    const { user } = useAuth()
    const navigate = useNavigate()
    const [deletingId, setDeletingId] = useState("")
    const progress = buildProgress(reports)

    useEffect(() => {
        const idle = window.requestIdleCallback || ((fn) => window.setTimeout(fn, 800))
        const cancel = window.cancelIdleCallback || window.clearTimeout
        const handle = idle(() => {
            import("../services/videoAnalyzer").then((mod) => mod.prefetchVideoModels()).catch(() => {})
        })
        return () => cancel(handle)
    }, [])

    const handleDelete = async (id) => {
        setDeletingId(id)
        try {
            await deleteReportById(id)
        } finally {
            setDeletingId("")
        }
    }

    if (loading && reports.length === 0) {
        return (
            <LoadingScreen
                title="Opening your workspace"
                message="Fetching saved interview plans."
            />
        )
    }

    return (
        <AppShell>
            <section className="dash-welcome">
                <div>
                    <h1>{greetingFor()}, {user?.username || "there"}</h1>
                    <p>Start a plan for a role, then track match scores and recurring gaps across every report.</p>
                </div>
                <Link to="/app/new" className="button primary-button">
                    Start a plan
                    <span className="button__icon" aria-hidden="true">
                        <ArrowUpRight size={14} weight="bold" />
                    </span>
                </Link>
            </section>

            <section className="dash-grid">
                <article className="dash-panel dash-panel--chart">
                    <header>
                        <h2>Progress</h2>
                        <p className="dash-panel__meta tabular">
                            {progress.planCount} {progress.planCount === 1 ? "plan" : "plans"}
                            {progress.latest ? `, latest ${formatMatchScore(progress.latest.score)}%` : ""}
                        </p>
                    </header>
                    <div className="dash-stats">
                        <div>
                            <span>Average match</span>
                            <strong className="tabular">{formatMatchScore(progress.average)}%</strong>
                        </div>
                        <div>
                            <span>Change from first plan</span>
                            <strong className="tabular">
                                {progress.planCount < 2
                                    ? "-"
                                    : `${progress.delta > 0 ? "+" : ""}${formatMatchScore(progress.delta)}`}
                            </strong>
                        </div>
                    </div>
                    <ProgressChart points={progress.points} />
                </article>

                <article className="dash-panel">
                    <header>
                        <h2>Target improvements</h2>
                        <p className="dash-panel__meta">Recurring skill gaps across your plans</p>
                    </header>
                    {progress.targets.length === 0 ? (
                        <p className="dash-empty">Gaps will appear here after you generate a plan.</p>
                    ) : (
                        <ul className="target-list">
                            {progress.targets.map((target) => (
                                <li key={target.skill}>
                                    <div>
                                        <strong>{target.skill}</strong>
                                        <span className={`severity severity--${target.severity}`}>{target.severity}</span>
                                    </div>
                                    <span className="tabular">{target.count} {target.count === 1 ? "plan" : "plans"}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </article>
            </section>

            <section className="dash-plans">
                <header>
                    <h2>Recent plans</h2>
                </header>
                {reports.length === 0 ? (
                    <div className="dash-empty-card">
                        <h3>No plans yet</h3>
                        <p>Paste a job description and your profile to get questions, gaps, and a prep path.</p>
                        <Link to="/app/new" className="button primary-button">Start a plan</Link>
                    </div>
                ) : (
                    <ul className="plan-list">
                        {reports.map((report) => (
                            <li key={idOf(report)}>
                                <button
                                    type="button"
                                    className="plan-list__open"
                                    onClick={() => navigate(`/interview/${idOf(report)}`)}
                                >
                                    <h3>{report.title || "Untitled role"}</h3>
                                    <p>{new Date(report.createdAt).toLocaleDateString()}</p>
                                </button>
                                <span className={`match tabular ${matchScoreTone(report.matchScore)}`}>
                                    {formatMatchScore(report.matchScore)}%
                                </span>
                                <button
                                    type="button"
                                    className="icon-btn"
                                    disabled={deletingId === idOf(report)}
                                    onClick={() => handleDelete(idOf(report))}
                                    aria-label="Delete plan"
                                >
                                    <Trash size={16} weight="regular" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </AppShell>
    )
}

export default Dashboard
