import React, { useEffect, useState, useRef } from 'react'
import "../styles/home.scss"
import { useInterview } from '../hooks/useInterview.js'
import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { idOf } from '../../../shared/id.js'
import { formatMatchScore, matchScoreTone } from '../../../shared/score.js'
import LoadingScreen from '../../../shared/LoadingScreen.jsx'
import '../../../shared/loadingScreen.scss'

const GENERATE_STEPS = [
    "Researching how this company interviews",
    "Matching your experience",
    "Writing company-specific questions",
    "Building your prep plan",
]

const INTERVIEW_WINDOW_OPTIONS = [
    { id: "dont_know", label: "Don't know" },
    { id: "within_3_days", label: "Within 3 days" },
    { id: "this_week", label: "This week" },
    { id: "next_week", label: "Next week" },
    { id: "in_2_weeks", label: "In 2 weeks" },
    { id: "in_3_weeks", label: "In 3 weeks" },
    { id: "in_1_month", label: "In about a month" },
    { id: "later", label: "Later than a month" },
]

const Home = () => {
    const { loading, generating, generateReport, reports, deleteReportById } = useInterview()
    const [jobDescription, setJobDescription] = useState("")
    const [selfDescription, setSelfDescription] = useState("")
    const [company, setCompany] = useState("")
    const [jobProfile, setJobProfile] = useState("")
    const [yearsOfExperience, setYearsOfExperience] = useState("")
    const [interviewWindow, setInterviewWindow] = useState("")
    const [error, setError] = useState("")
    const [resumeFile, setResumeFile] = useState(null)
    const [stepIndex, setStepIndex] = useState(0)
    const [deletingId, setDeletingId] = useState("")
    const resumeInputRef = useRef()

    const { handleLogout } = useAuth()
    const navigate = useNavigate()

    const yoeValid = yearsOfExperience !== "" && Number(yearsOfExperience) >= 0 && Number(yearsOfExperience) <= 40
    const canGenerate = Boolean(
        jobDescription.trim() &&
        (resumeFile || selfDescription.trim()) &&
        company.trim() &&
        jobProfile.trim() &&
        yoeValid &&
        interviewWindow
    )

    useEffect(() => {
        if (!generating) {
            setStepIndex(0)
            return undefined
        }

        const intervalId = window.setInterval(() => {
            setStepIndex((current) => (current + 1) % GENERATE_STEPS.length)
        }, 2400)

        return () => window.clearInterval(intervalId)
    }, [generating])

    const handleResumeChange = (e) => {
        const file = e.target.files?.[0] || null
        setResumeFile(file)
    }

    const handleGenerateReport = async () => {
        if (!canGenerate || generating) return
        setError("")
        try {
            const data = await generateReport({
                jobDescription,
                selfDescription,
                resumeFile,
                company: company.trim(),
                jobProfile: jobProfile.trim(),
                yearsOfExperience: Number(yearsOfExperience),
                interviewWindow,
            })
            if (!idOf(data)) {
                setError("Failed to generate report. The AI service may be busy. Please try again.")
                return
            }
            navigate(`/interview/${idOf(data)}`)
        } catch (err) {
            setError(
                err?.response?.data?.message ||
                "Failed to generate report. Please try again."
            )
        }
    }

    const handleDeleteReport = async (id) => {
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
        <div className='home-page'>
            <header className='home-nav'>
                <img className="brand-logo" src="/hirevia-logo.png" alt="Hirevia" />
                <button
                    className='button secondary-button logout-btn'
                    onClick={async () => {
                        await handleLogout()
                        navigate("/login")
                    }}
                >
                    Logout
                </button>
            </header>

            <header className='page-header'>
                <h1>Build a plan for the role you want</h1>
                <p>Tell us the company, role, and timing. We research how they hire, then write questions, gaps, and a prep path.</p>
            </header>

            <div className={`interview-card ${generating ? "interview-card--busy" : ""}`}>
                {generating && (
                    <div className='generate-overlay' role='status' aria-live='polite'>
                        <div className='app-loading__orbit' aria-hidden='true' />
                        <p className='generate-overlay__title'>Generating your interview plan</p>
                        <p className='generate-overlay__step'>{GENERATE_STEPS[stepIndex]}</p>
                    </div>
                )}

                <div className='intake-grid'>
                    <label className='intake-field'>
                        <span>Company applying for</span>
                        <input
                            type='text'
                            value={company}
                            onChange={(e) => setCompany(e.target.value)}
                            placeholder="Google, Deloitte, Stripe, or N/A"
                            disabled={generating}
                            maxLength={120}
                        />
                        <small className="field-hint">N/A if you are not sure.</small>
                    </label>
                    <label className='intake-field'>
                        <span>Job profile</span>
                        <input
                            type='text'
                            value={jobProfile}
                            onChange={(e) => setJobProfile(e.target.value)}
                            placeholder="SDE 2, Analyst, Product intern…"
                            disabled={generating}
                            maxLength={120}
                        />
                    </label>
                    <label className='intake-field'>
                        <span>Years of experience</span>
                        <input
                            type='number'
                            min='0'
                            max='40'
                            step='0.5'
                            value={yearsOfExperience}
                            onChange={(e) => setYearsOfExperience(e.target.value)}
                            placeholder="0"
                            disabled={generating}
                        />
                    </label>
                    <label className='intake-field'>
                        <span>When is the next interview?</span>
                        <select
                            value={interviewWindow}
                            onChange={(e) => setInterviewWindow(e.target.value)}
                            disabled={generating}
                        >
                            <option value="" disabled>Select timing</option>
                            {INTERVIEW_WINDOW_OPTIONS.map((option) => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className='interview-card__body'>
                    <div className='panel panel--left'>
                        <div className='panel__header'>
                            <h2>Job description</h2>
                            <span className='badge badge--required'>Required</span>
                        </div>
                        <textarea
                            onChange={(e) => setJobDescription(e.target.value)}
                            className='panel__textarea'
                            placeholder="Paste the full job description here."
                            maxLength={5000}
                            value={jobDescription}
                            disabled={generating}
                        />
                        <div className='char-counter'>{jobDescription.length} / 5000</div>
                    </div>

                    <div className='panel-divider' />

                    <div className='panel panel--right'>
                        <div className='panel__header'>
                            <h2>Your profile</h2>
                        </div>

                        <div className='upload-section'>
                            <label className='section-label' htmlFor='resume'>
                                Resume
                                <span className='badge badge--best'>Best results</span>
                            </label>
                            <label className={`dropzone ${resumeFile ? 'dropzone--uploaded' : ''}`} htmlFor='resume'>
                                {resumeFile ? (
                                    <>
                                        <p className='dropzone__title'>{resumeFile.name}</p>
                                        <p className='dropzone__subtitle'>Click to replace this file</p>
                                    </>
                                ) : (
                                    <>
                                        <p className='dropzone__title'>Upload a PDF</p>
                                        <p className='dropzone__subtitle'>PDF only, up to 3MB</p>
                                    </>
                                )}
                                <input
                                    ref={resumeInputRef}
                                    onChange={handleResumeChange}
                                    hidden
                                    type='file'
                                    id='resume'
                                    name='resume'
                                    accept='.pdf'
                                    disabled={generating}
                                />
                            </label>
                        </div>

                        <div className='or-divider'><span>or describe yourself</span></div>

                        <div className='self-description'>
                            <label className='section-label' htmlFor='selfDescription'>Self description</label>
                            <textarea
                                onChange={(e) => setSelfDescription(e.target.value)}
                                id='selfDescription'
                                name='selfDescription'
                                value={selfDescription}
                                className='panel__textarea panel__textarea--short'
                                placeholder="Years of experience, stack, and a couple of projects."
                                disabled={generating}
                            />
                        </div>
                    </div>
                </div>

                <div className='interview-card__footer'>
                    <span className='footer-info'>Usually takes 40 to 80 seconds. We research the company first.</span>
                    <button
                        onClick={handleGenerateReport}
                        className='generate-btn'
                        disabled={!canGenerate || generating}
                    >
                        {generating ? "Generating..." : "Generate plan"}
                    </button>
                </div>

                {error && (
                    <p className='form-error' role='alert'>
                        {error}
                    </p>
                )}
            </div>

            <section className='recent-reports'>
                <h2>Recent plans</h2>
                {reports.length === 0 ? (
                    <p className='empty-reports'>No plans yet. Generate one to see it here.</p>
                ) : (
                    <ul className='reports-list'>
                        {reports.map((report) => (
                            <li className='report-item' key={idOf(report)}>
                                <button
                                    type='button'
                                    className='report-item__open'
                                    onClick={() => navigate(`/interview/${idOf(report)}`)}
                                >
                                    <h3>{report.title || 'Untitled role'}</h3>
                                    <p className='report-meta'>
                                        {new Date(report.createdAt).toLocaleDateString()}
                                    </p>
                                    <p className={`match-score ${matchScoreTone(report.matchScore).replace("is-", "score--")}`}>
                                        Match {formatMatchScore(report.matchScore)}%
                                    </p>
                                </button>
                                <button
                                    className='delete-btn'
                                    disabled={deletingId === idOf(report)}
                                    onClick={() => handleDeleteReport(idOf(report))}
                                >
                                    {deletingId === idOf(report) ? "Removing..." : "Delete"}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    )
}

export default Home
