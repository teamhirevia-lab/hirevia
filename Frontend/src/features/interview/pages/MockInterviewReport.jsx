import React, { useEffect } from "react"
import { useNavigate, useParams } from "react-router"
import { useMockInterview } from "../hooks/useMockInterview"
import "../styles/mockInterviewReport.scss"
import LoadingScreen from "../../../shared/LoadingScreen.jsx"
import AppShell from "../../../shared/AppShell.jsx"
import FormattedAnswer from "../components/FormattedAnswer.jsx"

const MockInterviewReport = () => {

    const {
        mockReport,
        getMockReportById,
        loading
    } = useMockInterview()

    const { interviewId, mockId } = useParams()

    const navigate = useNavigate()

    useEffect(() => {

        getMockReportById(
            interviewId,
            mockId
        )

    }, [interviewId, mockId])

    if (loading || !mockReport) {

        return (
            <LoadingScreen
                title="Opening your mock report"
                message="Scoring, feedback, and presentation signals are loading."
            />
        )
    }

    const getScoreClass = (score) => {

        if (score >= 8) return "high"

        if (score >= 5) return "medium"

        return "low"
    }

    return (
        <AppShell>
        <div className="mock-report-page">

            <div className="mock-report-header">

                <div>

                    <h1>
                        Mock Interview Report
                    </h1>

                    <p>
                        Status:
                        {" "}
                        <span className={`status ${mockReport.status}`}>
                            {mockReport.status}
                        </span>
                    </p>

                    {mockReport.completedAt && (

                        <p>

                            Completed:
                            {" "}

                            {new Date(
                                mockReport.completedAt
                            ).toLocaleString()}

                        </p>

                    )}

                </div>

                

                <button
                    className="button secondary-button"
                    onClick={() =>
                        navigate(`/interview/${interviewId}`)
                    }
                >
                    Back
                </button>

            </div>

            {/* OVERALL */}



            <div className="overall-grid">

                <div className="overall-card score-card">

                    <h2>Overall Score</h2>

                    <div className="overall-score">
                        {mockReport.overallScore}%
                    </div>

                </div>

                <div className="overall-card">

                    <h2>Overall Feedback</h2>

                    <p>
                        {
                            mockReport.overallFeedback
                            || "No feedback available."
                        }
                    </p>

                </div>

            </div>

            {mockReport.presentationSummary && (

                <div className="presentation-summary">

                    <h2>Presentation Summary</h2>

                    <div className="presentation-summary__grid">

                        <div className="presentation-metric">
                            <span className="presentation-metric__label">Camera Engagement</span>
                            <span className="presentation-metric__value">
                                {Math.round((mockReport.presentationSummary.cameraEngagement || 0) * 100)}%
                            </span>
                        </div>

                        <div className="presentation-metric">
                            <span className="presentation-metric__label">Face Visibility</span>
                            <span className="presentation-metric__value">
                                {Math.round((mockReport.presentationSummary.faceVisibility || 0) * 100)}%
                            </span>
                        </div>

                        <div className="presentation-metric">
                            <span className="presentation-metric__label">Eye Contact</span>
                            <span className="presentation-metric__value">
                                {Math.round((mockReport.presentationSummary.eyeContact || 0) * 100)}%
                            </span>
                        </div>

                        <div className="presentation-metric">
                            <span className="presentation-metric__label">Gaze Away</span>
                            <span className="presentation-metric__value">
                                {Math.round((mockReport.presentationSummary.gazeAwayRate || 0) * 100)}%
                            </span>
                        </div>

                        <div className="presentation-metric">
                            <span className="presentation-metric__label">Blink Rate</span>
                            <span className="presentation-metric__value">
                                {mockReport.presentationSummary.blinkRate ?? "-"} /min
                            </span>
                        </div>

                        <div className="presentation-metric">
                            <span className="presentation-metric__label">Avg Presentation</span>
                            <span className="presentation-metric__value">
                                {mockReport.presentationSummary.averagePresentationScore ?? "-"}/10
                            </span>
                        </div>

                    </div>

                </div>

            )}

            {/* ANSWERS */}

            <div className="answers-section">

                <h2>
                    Question Analysis
                </h2>

                <div className="answers-list">

                    {mockReport.answers.map((item, index) => (

                        <div
                            key={index}
                            className="answer-card"
                        >

                            {/* TOP */}

                            <div className="answer-top">

                                <div>

                                    <span
                                        className={`section-tag ${item.section}`}
                                    >
                                        {item.section}
                                    </span>

                                    <h3>
                                        Q{index + 1}.
                                        {" "}
                                        {item.question}
                                    </h3>
                                    {item.isFollowUp && (
                                        <span className="section-tag follow-up">Follow-up</span>
                                    )}

                                </div>

                                <div
                                    className={`answer-score ${getScoreClass(item.score)}`}
                                >
                                    {item.score || 0}/10
                                </div>

                            </div>

                            {(item.technicalScore != null || item.communicationScore != null || item.presentationScore != null) && (

                                <div className="score-breakdown">

                                    {item.technicalScore != null && (
                                        <span>Technical: {item.technicalScore}/10</span>
                                    )}

                                    {item.communicationScore != null && (
                                        <span>Communication: {item.communicationScore}/10</span>
                                    )}

                                    {item.presentationScore != null && (
                                        <span>Presentation: {item.presentationScore}/10</span>
                                    )}

                                </div>

                            )}

                            {/* USER ANSWER */}

                            <div className="answer-block">

                                <h4>Your Answer</h4>
                                <FormattedAnswer text={item.userAnswer || "No answer submitted."} />
                            </div>

                            {/* EXPECTED */}

                            <div className="answer-block">

                                <h4>Expected Answer</h4>
                                <FormattedAnswer text={item.expectedAnswer || "Not available."} />

                            </div>

                            {/* FEEDBACK */}

                            <div className="answer-block">

                                <h4>AI Feedback</h4>

                                <p>
                                    {
                                        item.feedback
                                        || "No feedback available."
                                    }
                                </p>

                            </div>

                            {item.videoMetrics && (

                                <div className="answer-block presentation-block">

                                    <h4>Presentation</h4>

                                    <div className="presentation-summary__grid presentation-summary__grid--compact">

                                        <div className="presentation-metric">
                                            <span className="presentation-metric__label">Camera Engagement</span>
                                            <span className="presentation-metric__value">
                                                {Math.round((item.videoMetrics.cameraEngagement || 0) * 100)}%
                                            </span>
                                        </div>

                                        <div className="presentation-metric">
                                            <span className="presentation-metric__label">Face Visibility</span>
                                            <span className="presentation-metric__value">
                                                {Math.round((item.videoMetrics.faceVisibility || 0) * 100)}%
                                            </span>
                                        </div>

                                        <div className="presentation-metric">
                                            <span className="presentation-metric__label">Posture</span>
                                            <span className="presentation-metric__value">
                                                {item.videoMetrics.posture || "unknown"}
                                            </span>
                                        </div>

                                        <div className="presentation-metric">
                                            <span className="presentation-metric__label">Eye Contact</span>
                                            <span className="presentation-metric__value">
                                                {Math.round((item.videoMetrics.eyeContact || 0) * 100)}%
                                            </span>
                                        </div>

                                        <div className="presentation-metric">
                                            <span className="presentation-metric__label">Gaze Away</span>
                                            <span className="presentation-metric__value">
                                                {Math.round((item.videoMetrics.gazeAwayRate || 0) * 100)}%
                                            </span>
                                        </div>

                                        <div className="presentation-metric">
                                            <span className="presentation-metric__label">Head Movement</span>
                                            <span className="presentation-metric__value">
                                                {item.videoMetrics.headMovement || "-"}
                                            </span>
                                        </div>

                                    </div>

                                </div>

                            )}

                            {/* FOOTER */}

                            <div className="answer-footer">

                                <span>

                                    Duration:
                                    {" "}

                                    {item.duration || 0}s

                                </span>

                            </div>

                        </div>

                    ))}

                </div>

            </div>

        </div>
        </AppShell>
    )
}

export default MockInterviewReport