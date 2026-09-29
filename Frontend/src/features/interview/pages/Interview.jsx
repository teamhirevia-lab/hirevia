import { useEffect, useRef, useState } from "react"
import "../styles/interview.scss"
import { useInterview } from "../hooks/useInterview.js"
import { useMockInterview } from "../hooks/useMockInterview.js"
import { useNavigate, useParams, useLocation } from "react-router"
import {
    ArrowLeft,
    CaretLeft,
    CaretRight,
    Code,
    ChatText,
    Path,
    User,
    Microphone,
    DownloadSimple,
    Check,
} from "@phosphor-icons/react"
import { idOf } from "../../../shared/id.js"
import { formatMatchScore, matchScoreTone } from "../../../shared/score.js"
import AppShell from "../../../shared/AppShell.jsx"
import LoadingScreen from "../../../shared/LoadingScreen.jsx"
import ResumePreview from "../components/ResumePreview.jsx"
import ResumeDocument from "../components/ResumeDocument.jsx"
import FormattedAnswer from "../components/FormattedAnswer.jsx"
import { useAuth } from "../../auth/hooks/useAuth.js"

const RESUME_TEMPLATES = [
    { id: "classic", name: "Classic ATS", blurb: "Single column, black text, recruiter-safe." },
    { id: "modern", name: "Modern", blurb: "Navy headings and a stronger header." },
    { id: "compact", name: "Compact", blurb: "Tighter type so more fits on one page." },
    { id: "executive", name: "Executive", blurb: "Centered header with calmer spacing." },
]

const NAV_ITEMS = [
    { id: "technical", label: "Technical", icon: Code },
    { id: "behavioral", label: "Behavioral", icon: ChatText },
    { id: "roadmap", label: "Roadmap", icon: Path },
    { id: "profile", label: "Profile", icon: User },
    { id: "mock-interview", label: "Mocks", icon: Microphone },
]

function resourceLinksForTopic(topic, kind = "interview prep") {
    const label = String(topic || "").trim()
    if (!label) return []
    const query = encodeURIComponent(`${label} ${kind}`)
    return [
        { title: `Search Google for ${label}`, url: `https://www.google.com/search?q=${query}`, source: "google" },
        { title: `Watch ${label} on YouTube`, url: `https://www.youtube.com/results?search_query=${query}`, source: "youtube" },
    ]
}

function mergeResources(existing, fallbacks) {
    const merged = []
    const seen = new Set()
    for (const item of [...(existing || []), ...(fallbacks || [])]) {
        if (!item?.url || seen.has(item.url)) continue
        seen.add(item.url)
        merged.push(item)
    }
    return merged
}

function shortGapText(text, max = 88) {
    const clean = String(text || "").replace(/\s+/g, " ").trim()
    if (!clean) return ""
    if (clean.length <= max) return clean
    const sentence = clean.split(/(?<=[.!?])\s+/)[0]
    if (sentence && sentence.length >= 40 && sentence.length <= max) return sentence
    return `${clean.slice(0, max).replace(/\s+\S*$/, "")}…`
}

function searchResources(resources, limit = 2) {
    const list = (resources || []).filter((item) => item?.url)
    const preferred = list.filter((item) => item.source === "google" || item.source === "youtube")
    return (preferred.length ? preferred : list).slice(0, limit)
}

function ResourceLinks({ resources }) {
    if (!resources?.length) return null
    return (
        <ul className="resource-links">
            {resources.map((resource) => (
                <li key={resource.url}>
                    <a href={resource.url} target="_blank" rel="noopener noreferrer">
                        {resource.source === "youtube"
                            ? "YouTube"
                            : resource.source === "google"
                                ? "Google"
                                : resource.title || "Reference"}
                    </a>
                </li>
            ))}
        </ul>
    )
}

function QuestionReader({ items, label }) {
    const [active, setActive] = useState(0)
    const listRef = useRef(null)
    const slug = label.toLowerCase().replace(/\s+/g, "-")
    const current = items[active]

    useEffect(() => {
        setActive(0)
    }, [label, items.length])

    useEffect(() => {
        const list = listRef.current
        const option = list?.querySelector('[aria-selected="true"]')
        if (!list || !option) return
        const top = option.offsetTop
        const bottom = top + option.offsetHeight
        if (top < list.scrollTop) list.scrollTop = top
        else if (bottom > list.scrollTop + list.clientHeight) {
            list.scrollTop = bottom - list.clientHeight
        }
    }, [active])

    if (!items.length) {
        return <p className="plan-empty">No questions in this section yet.</p>
    }

    const move = (next) => {
        const index = Math.min(Math.max(next, 0), items.length - 1)
        setActive(index)
    }

    const onListKeyDown = (event) => {
        if (event.key === "ArrowDown") {
            event.preventDefault()
            move(active + 1)
        } else if (event.key === "ArrowUp") {
            event.preventDefault()
            move(active - 1)
        } else if (event.key === "Home") {
            event.preventDefault()
            move(0)
        } else if (event.key === "End") {
            event.preventDefault()
            move(items.length - 1)
        }
    }

    return (
        <div className="q-reader">
            <div
                ref={listRef}
                className="q-reader__list"
                role="listbox"
                aria-label={label}
                aria-activedescendant={`q-option-${slug}-${active}`}
                onKeyDown={onListKeyDown}
            >
                {items.map((item, index) => (
                    <button
                        key={item.id || index}
                        id={`q-option-${slug}-${index}`}
                        type="button"
                        role="option"
                        tabIndex={index === active ? 0 : -1}
                        aria-selected={index === active}
                        aria-posinset={index + 1}
                        aria-setsize={items.length}
                        className={index === active ? "is-active" : ""}
                        onClick={() => setActive(index)}
                    >
                        <span className="tabular">Q{index + 1}</span>
                        <span>{item.question}</span>
                    </button>
                ))}
            </div>
            <article className="q-reader__detail" aria-live="polite">
                <div className="q-reader__toolbar">
                    <p className="q-reader__index tabular">
                        Question {active + 1} of {items.length}
                    </p>
                    <div className="q-reader__nav">
                        <button
                            type="button"
                            className="button secondary-button"
                            disabled={active === 0}
                            onClick={() => move(active - 1)}
                        >
                            <CaretLeft size={16} weight="bold" />
                            Previous
                        </button>
                        <button
                            type="button"
                            className="button secondary-button"
                            disabled={active === items.length - 1}
                            onClick={() => move(active + 1)}
                        >
                            Next
                            <CaretRight size={16} weight="bold" />
                        </button>
                    </div>
                </div>
                <div className="q-reader__body">
                    <h3>{current.question}</h3>
                    {current.intention && (
                        <div className="q-reader__block">
                            <h4>Why they ask this</h4>
                            <FormattedAnswer text={current.intention} />
                        </div>
                    )}
                    {current.answer && (
                        <div className="q-reader__block">
                            <h4>Model answer</h4>
                            <FormattedAnswer text={current.answer} />
                        </div>
                    )}
                </div>
            </article>
        </div>
    )
}

const Interview = () => {
    const [activeNav, setActiveNav] = useState("technical")
    const [resumePickerOpen, setResumePickerOpen] = useState(false)
    const [previewTemplate, setPreviewTemplate] = useState(null)
    const [selectedTemplate, setSelectedTemplate] = useState("classic")
    const [resumeStatus, setResumeStatus] = useState("idle")
    const [resumeError, setResumeError] = useState("")
    const { report, getResumePdf } = useInterview()
    const { mockReports, getAllMockReports } = useMockInterview()
    const { user } = useAuth()
    const mocksLeft = Number(user?.quota?.mocks?.remaining ?? 0)
    const { interviewId } = useParams()
    const navigate = useNavigate()
    const location = useLocation()

    useEffect(() => {
        if (location.state?.tab) {
            setActiveNav(location.state.tab)
        }
    }, [location.state])

    useEffect(() => {
        if (activeNav === "mock-interview") {
            getAllMockReports(interviewId)
        }
    }, [activeNav, interviewId])

    useEffect(() => {
        if (!resumePickerOpen) return undefined
        document.getElementById("resume-picker-title")?.focus()
        const onKey = (event) => {
            if (event.key !== "Escape" || resumeStatus === "downloading") return
            if (previewTemplate) {
                setPreviewTemplate(null)
                return
            }
            setResumePickerOpen(false)
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [resumePickerOpen, resumeStatus, previewTemplate])

    if (!report) {
        return (
            <LoadingScreen
                title="Opening your interview plan"
                message="Loading questions, skill gaps, and your prep roadmap."
            />
        )
    }

    const matchScore = formatMatchScore(report.matchScore)
    const scoreTone = matchScoreTone(report.matchScore)
    const gaps = report.skillGaps || []

    const selectTab = (id) => setActiveNav(id)

    const onTabKeyDown = (event, index) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
        event.preventDefault()
        const delta = event.key === "ArrowRight" ? 1 : -1
        const next = (index + delta + NAV_ITEMS.length) % NAV_ITEMS.length
        setActiveNav(NAV_ITEMS[next].id)
        window.requestAnimationFrame(() => {
            document.getElementById(`plan-tab-${NAV_ITEMS[next].id}`)?.focus()
        })
    }

    return (
        <AppShell>
            <div className="plan-page">
                <button
                    type="button"
                    className="plan-back"
                    onClick={() => navigate("/app")}
                >
                    <ArrowLeft size={18} weight="bold" />
                    All plans
                </button>

                <header className="plan-hero">
                    <div className="plan-hero__copy">
                        {(report.company || report.jobProfile) && (
                            <p className="plan-kicker">
                                {[report.jobProfile, report.company].filter(Boolean).join(" at ")}
                            </p>
                        )}
                        <h1>{report.title || "Interview plan"}</h1>
                    </div>
                    <div className={`plan-score ${scoreTone}`} aria-label={`Match score ${matchScore} percent`}>
                        <strong className="tabular">{matchScore}</strong>
                        <span>match %</span>
                    </div>
                    <div className="plan-hero__actions">
                        <button
                            type="button"
                            className="button secondary-button"
                            disabled={resumeStatus === "downloading"}
                            onClick={() => setResumePickerOpen(true)}
                        >
                            {resumeStatus === "done" ? <Check size={18} /> : <DownloadSimple size={18} />}
                            {resumeStatus === "downloading" ? "Preparing..." : resumeStatus === "done" ? "Downloaded" : "Resume"}
                        </button>
                        {resumeError && <p className="plan-hero__note" role="alert">{resumeError}</p>}
                        <button
                            type="button"
                            className="button primary-button"
                            disabled={mocksLeft <= 0}
                            onClick={() => navigate(`/interview/${idOf(report)}/mock`)}
                        >
                            {mocksLeft <= 0 ? "No mocks left" : "Attempt mock"}
                        </button>
                    </div>
                </header>

                <section className="plan-focus" aria-label="Skill gaps to improve">
                    <h2>Focus areas</h2>
                    {gaps.length === 0 ? (
                        <p className="plan-empty">No skill gaps flagged for this role.</p>
                    ) : (
                        <ul>
                            {gaps.map((gap, index) => (
                                <li key={`${gap.skill}-${index}`}>
                                    <div>
                                        <strong>{gap.skill}</strong>
                                        {gap.justification && <p>{shortGapText(gap.justification)}</p>}
                                        <ResourceLinks
                                            resources={searchResources(
                                                mergeResources(gap.resources, resourceLinksForTopic(gap.skill))
                                            )}
                                        />
                                    </div>
                                    <span className={`severity severity--${gap.severity || "medium"}`}>
                                        {gap.severity || "medium"}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <div className="plan-tabs" role="tablist" aria-label="Plan sections">
                    {NAV_ITEMS.map((item, index) => {
                        const Icon = item.icon
                        const selected = activeNav === item.id
                        return (
                            <button
                                key={item.id}
                                id={`plan-tab-${item.id}`}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                aria-controls={`plan-panel-${item.id}`}
                                tabIndex={selected ? 0 : -1}
                                className={selected ? "is-active" : ""}
                                onClick={() => selectTab(item.id)}
                                onKeyDown={(event) => onTabKeyDown(event, index)}
                            >
                                <Icon size={20} weight={selected ? "fill" : "regular"} />
                                {item.label}
                            </button>
                        )
                    })}
                </div>

                <section
                    id={`plan-panel-${activeNav}`}
                    className={`plan-panel ${activeNav === "technical" || activeNav === "behavioral" ? "plan-panel--questions" : ""}`}
                    role="tabpanel"
                    aria-labelledby={`plan-tab-${activeNav}`}
                >
                    {activeNav === "technical" && (
                        <>
                            <div className="content-header">
                                <h2>Technical questions</h2>
                                <span className="tabular">{report.technicalQuestions?.length || 0}</span>
                            </div>
                            <QuestionReader
                                items={report.technicalQuestions || []}
                                label="Technical questions"
                            />
                        </>
                    )}

                    {activeNav === "behavioral" && (
                        <>
                            <div className="content-header">
                                <h2>Behavioral questions</h2>
                                <span className="tabular">{report.behavioralQuestions?.length || 0}</span>
                            </div>
                            <QuestionReader
                                items={report.behavioralQuestions || []}
                                label="Behavioral questions"
                            />
                        </>
                    )}

                    {activeNav === "roadmap" && (
                        <>
                            <div className="content-header">
                                <h2>Preparation roadmap</h2>
                                <span>{report.preparationPlan?.length || 0} days</span>
                            </div>
                            {(report.preparationPlan || []).length === 0 ? (
                                <p className="plan-empty">No roadmap was generated for this plan.</p>
                            ) : (
                                <ol className="roadmap-list">
                                    {(report.preparationPlan || []).map((day) => (
                                        <li key={day.day} className="roadmap-day">
                                            <div className="roadmap-day__header">
                                                <span className="tabular">Day {day.day}</span>
                                                <h3>{day.focus}</h3>
                                            </div>
                                            {day.details && <p className="roadmap-day__details">{day.details}</p>}
                                            <ul>
                                                {(day.tasks || []).map((task, index) => (
                                                    <li key={index}>{task}</li>
                                                ))}
                                            </ul>
                                            <ResourceLinks
                                                resources={mergeResources(
                                                    day.resources,
                                                    resourceLinksForTopic(day.focus, "tutorial")
                                                )}
                                            />
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </>
                    )}

                    {activeNav === "profile" && (
                        <>
                            <div className="content-header">
                                <h2>Profile details</h2>
                            </div>
                            <div className="profile-section">
                                <article>
                                    <h3>Job description</h3>
                                    <p>{report.jobDescription || "None provided."}</p>
                                </article>
                                <article>
                                    <h3>Self description</h3>
                                    <p>{report.selfDescription || "None provided."}</p>
                                </article>
                                <article className="profile-section__resume">
                                    <h3>Resume</h3>
                                    <ResumeDocument text={report.resume} role={report.jobProfile} />
                                </article>
                            </div>
                        </>
                    )}

                    {activeNav === "mock-interview" && (
                        <>
                            <div className="content-header">
                                <h2>Mock interviews</h2>
                                <button
                                    type="button"
                                    className="button primary-button"
                                    disabled={mocksLeft <= 0}
                                    onClick={() => navigate(`/interview/${idOf(report)}/mock`)}
                                >
                                    {mocksLeft <= 0 ? "No mocks left" : "Attempt mock"}
                                </button>
                            </div>
                            {(!mockReports || mockReports.length === 0) ? (
                                <p className="plan-empty">No mock interviews yet. Start one for a scored live session with fresh questions.</p>
                            ) : (
                                <div className="mock-list">
                                    {mockReports.map((mock, index) => {
                                        const isCompleted = mock.status === "completed"
                                        return (
                                            <article key={idOf(mock)} className="mock-card">
                                                <header>
                                                    <div>
                                                        <span>Mock {index + 1}</span>
                                                        <h3>Live mock</h3>
                                                    </div>
                                                    <span className={`status ${mock.status}`}>
                                                        {isCompleted ? "completed" : "Paused"}
                                                    </span>
                                                </header>
                                                <div className="mock-card__stats">
                                                    <div>
                                                        <span>Questions</span>
                                                        <strong className="tabular">{mock.answerCount ?? mock.answers?.length ?? 0}</strong>
                                                    </div>
                                                    <div>
                                                        <span>Score</span>
                                                        <strong className="tabular">{isCompleted ? `${mock.overallScore}%` : "--"}</strong>
                                                    </div>
                                                    <div>
                                                        <span>Sections</span>
                                                        <strong className="tabular">{mock.completedSections?.length || 0}</strong>
                                                    </div>
                                                </div>
                                                <footer>
                                                    <span>
                                                        {mock.completedAt
                                                            ? new Date(mock.completedAt).toLocaleDateString()
                                                            : "In progress"}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="button primary-button"
                                                        onClick={() =>
                                                            navigate(
                                                                isCompleted
                                                                    ? `/interview/${interviewId}/mock/${idOf(mock)}/report`
                                                                    : `/interview/${interviewId}/mock/${idOf(mock)}`
                                                            )
                                                        }
                                                    >
                                                        {isCompleted ? "View report" : "Continue"}
                                                    </button>
                                                </footer>
                                            </article>
                                        )
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </section>
            </div>

            {resumePickerOpen && (
                <div className="resume-picker" role="dialog" aria-modal="true" aria-labelledby="resume-picker-title">
                    <button
                        type="button"
                        className="resume-picker__backdrop"
                        aria-label="Close template picker"
                        onClick={() => {
                            if (resumeStatus !== "downloading") setResumePickerOpen(false)
                        }}
                    />
                    <div className="resume-picker__panel">
                        <h2 id="resume-picker-title" tabIndex={-1}>Choose a template</h2>
                        <p>Same facts, different layout. Pick one, then download.</p>
                        <div className="resume-picker__grid">
                            {RESUME_TEMPLATES.map((template) => (
                                <div
                                    key={template.id}
                                    className={`resume-picker__card ${selectedTemplate === template.id ? "is-active" : ""}`}
                                >
                                    <button
                                        type="button"
                                        className="resume-picker__select"
                                        onClick={() => setSelectedTemplate(template.id)}
                                    >
                                        <span className="resume-picker__name">{template.name}</span>
                                        <span>{template.blurb}</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="resume-picker__preview-btn"
                                        onClick={() => setPreviewTemplate(template.id)}
                                    >
                                        Preview
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="resume-picker__actions">
                            <button
                                type="button"
                                className="button secondary-button"
                                disabled={resumeStatus === "downloading"}
                                onClick={() => setResumePickerOpen(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="button primary-button"
                                disabled={resumeStatus === "downloading"}
                                onClick={async () => {
                                    setResumePickerOpen(false)
                                    setResumeError("")
                                    setResumeStatus("downloading")
                                    try {
                                        await getResumePdf(interviewId, selectedTemplate)
                                        setResumeStatus("done")
                                        window.setTimeout(() => setResumeStatus("idle"), 2200)
                                    } catch (error) {
                                        let message = "The resume could not be generated. Please try again."
                                        const data = error?.response?.data
                                        if (data instanceof Blob) {
                                            try {
                                                const parsed = JSON.parse(await data.text())
                                                if (parsed?.message) message = parsed.message
                                            } catch {
                                                // keep the fallback message
                                            }
                                        } else if (data?.message) {
                                            message = data.message
                                        }
                                        setResumeError(message)
                                        setResumeStatus("error")
                                    }
                                }}
                            >
                                Download {RESUME_TEMPLATES.find((item) => item.id === selectedTemplate)?.name}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {previewTemplate && (
                <ResumePreview
                    templateId={previewTemplate}
                    onClose={() => setPreviewTemplate(null)}
                />
            )}
        </AppShell>
    )
}

export default Interview
