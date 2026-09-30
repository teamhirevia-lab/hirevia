import { useEffect, useState } from "react"
import { ChartBar, ChatText, UsersThree } from "@phosphor-icons/react"
import AppShell from "../../../shared/AppShell.jsx"
import LoadingScreen from "../../../shared/LoadingScreen.jsx"
import {
    getAdminDashboard,
    getAdminUsers,
    getAdminFeedback,
    updateAdminSettings,
    grantUserQuota,
} from "../services/admin.api.js"
import "../admin.scss"

const TABS = [
    { id: "dashboard", label: "Dashboard", icon: ChartBar },
    { id: "users", label: "Users", icon: UsersThree },
    { id: "feedback", label: "Feedback", icon: ChatText },
]

function formatWhen(value) {
    if (!value) return "Never"
    return new Date(value).toLocaleString()
}

const AdminPanel = () => {
    const [tab, setTab] = useState("dashboard")
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [dashboard, setDashboard] = useState(null)
    const [settings, setSettings] = useState({ reportLimitMonthly: 5, mockLimitMonthly: 3 })
    const [users, setUsers] = useState([])
    const [feedback, setFeedback] = useState([])
    const [savingSettings, setSavingSettings] = useState(false)
    const [busyId, setBusyId] = useState("")

    useEffect(() => {
        let cancelled = false
        Promise.all([getAdminDashboard(), getAdminUsers(), getAdminFeedback()])
            .then(([dash, usersData, feedbackData]) => {
                if (cancelled) return
                setDashboard(dash)
                setSettings(dash.settings || usersData.settings)
                setUsers(usersData.users || [])
                setFeedback(feedbackData.feedback || [])
            })
            .catch((err) => {
                if (!cancelled) setError(err?.response?.data?.message || "Could not load admin data.")
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [])

    const saveSettings = async (event) => {
        event.preventDefault()
        setSavingSettings(true)
        setError("")
        try {
            const data = await updateAdminSettings({
                reportLimitMonthly: Number(settings.reportLimitMonthly),
                mockLimitMonthly: Number(settings.mockLimitMonthly),
            })
            setSettings(data.settings)
            const dash = await getAdminDashboard()
            setDashboard(dash)
        } catch (err) {
            setError(err?.response?.data?.message || "Could not save global limits.")
        } finally {
            setSavingSettings(false)
        }
    }

    const addRemaining = async (user, kind) => {
        const raw = kind === "report" ? user.draftReportGrant : user.draftMockGrant
        const amount = Number(raw || 1)
        setBusyId(`${user.id}-${kind}`)
        setError("")
        try {
            const data = await grantUserQuota(user.id, { kind, amount })
            setUsers((current) => current.map((item) => (
                item.id === user.id
                    ? {
                        ...data.user,
                        draftReportGrant: 1,
                        draftMockGrant: 1,
                    }
                    : item
            )))
            const dash = await getAdminDashboard()
            setDashboard(dash)
        } catch (err) {
            setError(err?.response?.data?.message || "Could not add remaining uses.")
        } finally {
            setBusyId("")
        }
    }

    const patchUser = (id, fields) => {
        setUsers((current) => current.map((item) => (item.id === id ? { ...item, ...fields } : item)))
    }

    if (loading) {
        return (
            <LoadingScreen
                title="Opening admin"
                message="Loading users, usage, and feedback."
            />
        )
    }

    const rows = users.map((user) => ({
        ...user,
        draftReportGrant: user.draftReportGrant ?? 1,
        draftMockGrant: user.draftMockGrant ?? 1,
    }))
    const stats = dashboard || { users: {}, usage: {}, settings }
    const onTabKeyDown = (event, index) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
        event.preventDefault()
        const next = (index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length
        setTab(TABS[next].id)
        document.getElementById(`admin-tab-${TABS[next].id}`)?.focus()
    }

    return (
        <AppShell>
            <div className="admin-page">
                <header>
                    <h1>Admin</h1>
                    <p className="admin-page__lead">
                        Monthly limits apply to every user. Extra reports or mocks can be added for one person this month.
                    </p>
                </header>

                <div className="admin-tabs" role="tablist" aria-label="Admin sections">
                    {TABS.map((item, index) => {
                        const Icon = item.icon
                        const selected = tab === item.id
                        return (
                            <button
                                key={item.id}
                                id={`admin-tab-${item.id}`}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                aria-controls={`admin-panel-${item.id}`}
                                tabIndex={selected ? 0 : -1}
                                className={selected ? "is-active" : ""}
                                onClick={() => setTab(item.id)}
                                onKeyDown={(event) => onTabKeyDown(event, index)}
                            >
                                <Icon size={18} weight={selected ? "fill" : "regular"} />
                                {item.label}
                            </button>
                        )
                    })}
                </div>

                {error && <p className="form-error" role="alert">{error}</p>}

                {tab === "dashboard" && (
                    <section
                        id="admin-panel-dashboard"
                        className="admin-panel"
                        role="tabpanel"
                        aria-labelledby="admin-tab-dashboard"
                    >
                        <div className="admin-stats">
                            <article>
                                <span>Total users</span>
                                <strong>{stats.users.total ?? 0}</strong>
                            </article>
                            <article>
                                <span>Active users</span>
                                <strong>{stats.users.active ?? 0}</strong>
                                <p>Signed in during the last 7 days</p>
                            </article>
                            <article>
                                <span>Active this month</span>
                                <strong>{stats.users.active30d ?? 0}</strong>
                                <p>Signed in during the last 30 days</p>
                            </article>
                            <article>
                                <span>New this month</span>
                                <strong>{stats.users.newThisMonth ?? 0}</strong>
                            </article>
                            <article>
                                <span>Reports this month</span>
                                <strong>{stats.usage.reportsMonth ?? 0}</strong>
                                <p>{stats.usage.reportsLifetime ?? 0} all time</p>
                            </article>
                            <article>
                                <span>Mocks this month</span>
                                <strong>{stats.usage.mocksMonth ?? 0}</strong>
                                <p>{stats.usage.mocksCompleted ?? 0} completed</p>
                            </article>
                            <article>
                                <span>Feedback</span>
                                <strong>{stats.usage.feedbackTotal ?? 0}</strong>
                                <p>{stats.usage.feedbackMonth ?? 0} this month</p>
                            </article>
                        </div>

                        <div className="admin-card">
                            <h2>Global monthly limits</h2>
                            <p className="admin-muted">These caps apply to every user. Extra uses are added per person on Users.</p>
                            <form className="admin-settings" onSubmit={saveSettings}>
                                <div className="admin-field">
                                    <label htmlFor="global-reports">Interview reports</label>
                                    <input
                                        id="global-reports"
                                        type="number"
                                        min="0"
                                        max="1000"
                                        value={settings.reportLimitMonthly}
                                        onChange={(event) => setSettings((current) => ({
                                            ...current,
                                            reportLimitMonthly: event.target.value,
                                        }))}
                                    />
                                </div>
                                <div className="admin-field">
                                    <label htmlFor="global-mocks">Mock interviews</label>
                                    <input
                                        id="global-mocks"
                                        type="number"
                                        min="0"
                                        max="1000"
                                        value={settings.mockLimitMonthly}
                                        onChange={(event) => setSettings((current) => ({
                                            ...current,
                                            mockLimitMonthly: event.target.value,
                                        }))}
                                    />
                                </div>
                                <button type="submit" className="button primary-button" disabled={savingSettings}>
                                    {savingSettings ? "Saving..." : "Save limits"}
                                </button>
                            </form>
                        </div>
                    </section>
                )}

                {tab === "users" && (
                    <section
                        id="admin-panel-users"
                        className="admin-panel"
                        role="tabpanel"
                        aria-labelledby="admin-tab-users"
                    >
                        <div className="admin-card">
                            <h2>Users</h2>
                            <div className="admin-table-wrap">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>User</th>
                                            <th>Reports</th>
                                            <th>Mocks</th>
                                            <th>Add remaining</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((user) => (
                                            <tr key={user.id}>
                                                <td>
                                                    <strong>{user.username}</strong>
                                                    <div className="admin-table__email">{user.email}</div>
                                                    {user.role === "admin" && <span className="admin-role">admin</span>}
                                                    <div className="admin-muted">
                                                        Last sign in {formatWhen(user.lastLoginAt)}
                                                    </div>
                                                    {user.renewsAt && (
                                                        <div className="admin-muted">
                                                            Renews {new Date(user.renewsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    {user.reports.used} used, {user.reports.remaining} left
                                                    <div className="admin-muted">
                                                        Cap {user.reports.cap}
                                                        {user.reports.granted ? ` + ${user.reports.granted} added` : ""}
                                                    </div>
                                                </td>
                                                <td>
                                                    {user.mocks.used} used, {user.mocks.remaining} left
                                                    <div className="admin-muted">
                                                        Cap {user.mocks.cap}
                                                        {user.mocks.granted ? ` + ${user.mocks.granted} added` : ""}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="admin-row-actions">
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="100"
                                                            aria-label={`Add report remaining for ${user.username}`}
                                                            value={user.draftReportGrant}
                                                            onChange={(event) => patchUser(user.id, { draftReportGrant: event.target.value })}
                                                        />
                                                        <button
                                                            type="button"
                                                            className="button secondary-button"
                                                            disabled={busyId === `${user.id}-report`}
                                                            onClick={() => addRemaining(user, "report")}
                                                        >
                                                            Add reports
                                                        </button>
                                                    </div>
                                                    <div className="admin-row-actions" style={{ marginTop: "0.35rem" }}>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="100"
                                                            aria-label={`Add mock remaining for ${user.username}`}
                                                            value={user.draftMockGrant}
                                                            onChange={(event) => patchUser(user.id, { draftMockGrant: event.target.value })}
                                                        />
                                                        <button
                                                            type="button"
                                                            className="button secondary-button"
                                                            disabled={busyId === `${user.id}-mock`}
                                                            onClick={() => addRemaining(user, "mock")}
                                                        >
                                                            Add mocks
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {rows.length === 0 && <p className="admin-muted">No users yet.</p>}
                        </div>
                    </section>
                )}

                {tab === "feedback" && (
                    <section
                        id="admin-panel-feedback"
                        className="admin-panel"
                        role="tabpanel"
                        aria-labelledby="admin-tab-feedback"
                    >
                        <div className="admin-card">
                            <h2>Feedback</h2>
                            {feedback.length === 0 ? (
                                <p className="admin-muted">No feedback yet.</p>
                            ) : (
                                <ul className="admin-feedback">
                                    {feedback.map((item) => (
                                        <li key={item.id}>
                                            <header>
                                                <strong>{item.name}</strong>
                                                <span>{formatWhen(item.createdAt)}</span>
                                            </header>
                                            <p className="admin-table__email">
                                                {item.email}
                                                {item.phone ? `, ${item.phone}` : ""}
                                            </p>
                                            <p>{item.message}</p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </section>
                )}
            </div>
        </AppShell>
    )
}

export default AdminPanel
