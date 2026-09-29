import { useEffect, useRef, useState } from "react"
import "../styles/home.scss"
import { useInterview } from "../hooks/useInterview.js"
import { useNavigate } from "react-router"
import { idOf } from "../../../shared/id.js"
import AppShell from "../../../shared/AppShell.jsx"
import { useAuth } from "../../auth/hooks/useAuth.js"

const GENERATE_STEPS = [
    "Researching how this company interviews",
    "Matching your experience",
    "Writing company-specific questions",
    "Building your prep plan",
]

const WIZARD_STEPS = [
    { id: 1, label: "Basic details" },
    { id: 2, label: "Job description" },
    { id: 3, label: "Your profile" },
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

const NewPlan = () => {
    const { generating, generateReport } = useInterview()
    const { user, refreshUser } = useAuth()
    const reportQuota = user?.quota?.reports
    const reportsLeft = Number(reportQuota?.remaining ?? 0)
    const [wizardStep, setWizardStep] = useState(1)
    const [jobDescription, setJobDescription] = useState("")
    const [selfDescription, setSelfDescription] = useState("")
    const [company, setCompany] = useState("")
    const [jobProfile, setJobProfile] = useState("")
    const [yearsOfExperience, setYearsOfExperience] = useState("")
    const [interviewWindow, setInterviewWindow] = useState("")
    const [error, setError] = useState("")
    const [resumeFile, setResumeFile] = useState(null)
    const [stepIndex, setStepIndex] = useState(0)
    const resumeInputRef = useRef()
    const navigate = useNavigate()

    const yoeValid = yearsOfExperience !== "" && Number(yearsOfExperience) >= 0 && Number(yearsOfExperience) <= 40
    const step1Valid = Boolean(company.trim() && jobProfile.trim() && yoeValid && interviewWindow)
    const step2Valid = Boolean(jobDescription.trim())
    const step3Valid = Boolean(resumeFile || selfDescription.trim())
    const canGenerate = step1Valid && step2Valid && step3Valid

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

    const handleGenerateReport = async () => {
        if (!canGenerate || generating || reportsLeft <= 0) return
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
            await refreshUser()
            navigate(`/interview/${idOf(data)}`)
        } catch (err) {
            setError(
                err?.response?.data?.message ||
                "Failed to generate report. Please try again."
            )
        }
    }

    const goNext = () => {
        setError("")
        if (wizardStep === 1 && step1Valid) setWizardStep(2)
        else if (wizardStep === 2 && step2Valid) setWizardStep(3)
        else setError("Fill in this step before continuing.")
    }

    return (
        <AppShell>
            <header className="page-header">
                <h1>Start a plan</h1>
                <p>Three short steps. Company and role first, then the job description, then your resume or a short profile.</p>
                {reportQuota && (
                    <p className="page-header__quota">
                        {reportQuota.remaining} of {reportQuota.cap + reportQuota.granted} interview reports left this month.
                    </p>
                )}
            </header>

            <div className={`interview-card ${generating ? "interview-card--busy" : ""}`}>
                {generating && (
                    <div className="generate-overlay" role="status" aria-live="polite">
                        <div className="app-loading__orbit" aria-hidden="true" />
                        <p className="generate-overlay__title">Generating your interview plan</p>
                        <p className="generate-overlay__step">{GENERATE_STEPS[stepIndex]}</p>
                    </div>
                )}

                <ol className="wizard-steps" aria-label="Plan steps">
                    {WIZARD_STEPS.map((step) => (
                        <li
                            key={step.id}
                            className={
                                wizardStep === step.id
                                    ? "is-current"
                                    : wizardStep > step.id
                                        ? "is-done"
                                        : ""
                            }
                        >
                            <button
                                type="button"
                                disabled={step.id > wizardStep}
                                onClick={() => {
                                    setError("")
                                    setWizardStep(step.id)
                                }}
                            >
                                <span className="tabular">{step.id}</span>
                                {step.label}
                            </button>
                        </li>
                    ))}
                </ol>

                {wizardStep === 1 && (
                    <div className="intake-grid intake-grid--step">
                        <label className="intake-field">
                            <span>Company applying for</span>
                            <input
                                type="text"
                                value={company}
                                onChange={(e) => setCompany(e.target.value)}
                                placeholder="Google, Deloitte, Stripe, or N/A"
                                disabled={generating}
                                maxLength={120}
                            />
                            <small className="field-hint">N/A if you are not sure.</small>
                        </label>
                        <label className="intake-field">
                            <span>Job profile</span>
                            <input
                                type="text"
                                value={jobProfile}
                                onChange={(e) => setJobProfile(e.target.value)}
                                placeholder="SDE 2, Analyst, Product intern"
                                disabled={generating}
                                maxLength={120}
                            />
                        </label>
                        <label className="intake-field">
                            <span>Years of experience</span>
                            <input
                                type="number"
                                min="0"
                                max="40"
                                step="0.5"
                                value={yearsOfExperience}
                                onChange={(e) => setYearsOfExperience(e.target.value)}
                                placeholder="0"
                                disabled={generating}
                            />
                        </label>
                        <label className="intake-field">
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
                )}

                {wizardStep === 2 && (
                    <div className="panel">
                        <div className="panel__header">
                            <h2>Job description</h2>
                            <span className="badge">Required</span>
                        </div>
                        <textarea
                            onChange={(e) => setJobDescription(e.target.value)}
                            className="panel__textarea panel__textarea--step"
                            placeholder="Paste the full job description here."
                            maxLength={5000}
                            value={jobDescription}
                            disabled={generating}
                        />
                        <div className="char-counter tabular">{jobDescription.length} / 5000</div>
                    </div>
                )}

                {wizardStep === 3 && (
                    <div className="panel">
                        <div className="panel__header">
                            <h2>Resume or self description</h2>
                        </div>
                        <p className="panel__hint">Upload a PDF, write a short profile, or both.</p>
                        <div className="upload-section">
                            <label className="section-label" htmlFor="resume">Resume</label>
                            <label className={`dropzone ${resumeFile ? "dropzone--uploaded" : ""}`} htmlFor="resume">
                                {resumeFile ? (
                                    <>
                                        <p className="dropzone__title">{resumeFile.name}</p>
                                        <p className="dropzone__subtitle">Click to replace this file</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="dropzone__title">Upload a PDF</p>
                                        <p className="dropzone__subtitle">PDF only, up to 3MB</p>
                                    </>
                                )}
                                <input
                                    ref={resumeInputRef}
                                    onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                                    hidden
                                    type="file"
                                    id="resume"
                                    name="resume"
                                    accept=".pdf"
                                    disabled={generating}
                                />
                            </label>
                        </div>
                        <div className="or-divider"><span>or describe yourself</span></div>
                        <label className="section-label" htmlFor="selfDescription">Self description</label>
                        <textarea
                            onChange={(e) => setSelfDescription(e.target.value)}
                            id="selfDescription"
                            name="selfDescription"
                            value={selfDescription}
                            className="panel__textarea panel__textarea--short"
                            placeholder="Years of experience, stack, and a couple of projects."
                            disabled={generating}
                        />
                    </div>
                )}

                <div className="interview-card__footer">
                    <span className="footer-info">
                        {wizardStep === 3
                            ? "Usually takes 40 to 80 seconds. We research the company first."
                            : `Step ${wizardStep} of 3`}
                    </span>
                    <div className="wizard-actions">
                        {wizardStep > 1 && (
                            <button
                                type="button"
                                className="button secondary-button"
                                disabled={generating}
                                onClick={() => {
                                    setError("")
                                    setWizardStep((current) => current - 1)
                                }}
                            >
                                Back
                            </button>
                        )}
                        {wizardStep < 3 ? (
                            <button
                                type="button"
                                className="button primary-button"
                                disabled={generating || (wizardStep === 1 ? !step1Valid : !step2Valid)}
                                onClick={goNext}
                            >
                                Next
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleGenerateReport}
                                className="button primary-button"
                                disabled={!canGenerate || generating || reportsLeft <= 0}
                            >
                                {generating ? "Generating..." : reportsLeft <= 0 ? "No reports left" : "Generate plan"}
                            </button>
                        )}
                    </div>
                </div>

                {error && <p className="form-error" role="alert">{error}</p>}
            </div>
        </AppShell>
    )
}

export default NewPlan
