import React, { useState, useEffect, useRef } from 'react'
import { useInterview } from '../hooks/useInterview.js'
import { useTextToSpeech } from '../hooks/textToSpeech.js'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition.js'
import { useCamera } from '../hooks/useCamera.js'
import { useVideoAnalyzer } from '../hooks/useVideoAnalyzer.js'
import { buildInterviewVocabulary } from '../config/sttConfig.js'
import '../styles/mockInterview.scss'
import { useMockInterview } from '../hooks/useMockInterview.js'
import { useNavigate, useParams } from 'react-router'
import { idOf } from '../../../shared/id.js'
import LoadingScreen from '../../../shared/LoadingScreen.jsx'
import AppShell from '../../../shared/AppShell.jsx'
import BrandLogo from '../../../shared/BrandLogo.jsx'
import { useAuth } from '../../auth/hooks/useAuth.js'

const percent = (value) => Math.round((Number(value) || 0) * 100)

const MockInterview = () => {
  const [section, setSection] = useState(null)
  const [isRestoring, setIsRestoring] = useState(true)
  const [isStarting, setIsStarting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [completedSections, setCompletedSections] = useState([])
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState([])
  const [error, setError] = useState("")
  const [draftAnswer, setDraftAnswer] = useState("")
  const [userEdited, setUserEdited] = useState(false)

  const pendingVideoMetricsRef = useRef(null)
  const answerStartedAtRef = useRef(null)
  const userEditedRef = useRef(false)

  const { speak, stopSpeaking } = useTextToSpeech()
  const { report } = useInterview()
  const { user, refreshUser } = useAuth()
  const mockQuota = user?.quota?.mocks
  const mocksLeft = Number(mockQuota?.remaining ?? 0)
  const { interviewId, mockId } = useParams()
  const navigate = useNavigate()

  const {
    transcript,
    isListening,
    speechError,
    ready: whisperReady,
    processing: transcribing,
    transcribePhase,
    sttMode,
    startListening,
    stopListening,
    resetTranscript,
    retryTranscription,
    setVocabulary,
  } = useSpeechRecognition()
  const { loading: mockLoading, mockReport, startMock, completeMockInterview, submitAnswer, updatingMockInterview } = useMockInterview()
  const [isFinishing, setIsFinishing] = useState(false)
  const [isPausing, setIsPausing] = useState(false)
  const didRestoreRef = useRef(false)
  const mockFetchStartedRef = useRef(false)
  const finishingRef = useRef(false)
  const autoFinishAttemptedRef = useRef(false)

  const cameraEnabled = section != null && section !== ""
  const { videoRef, isCameraReady, cameraError } = useCamera({ enabled: cameraEnabled })
  const { isAnalyzing, liveMetrics, startAnalysis, stopAnalysis, analyzerError } = useVideoAnalyzer()

  const storageKey = mockId ? `mock_${mockId}` : null
  const questions = mockReport?.questions?.[section] || []
  const currentQuestion = questions[questionIndex]
  const currentAnswer = answers.find(
    (answer) => answer.section === section && answer.questionIndex === questionIndex
  )?.userAnswer

  const answersWithDraft = () => {
    const draft = draftAnswer.trim()
    if (!draft) return answers
    const rest = answers.filter(
      (answer) => !(answer.section === section && answer.questionIndex === questionIndex)
    )
    return [
      ...rest,
      {
        section,
        questionIndex,
        questionId: currentQuestion?.id,
        question: currentQuestion?.question,
        userAnswer: draft,
      },
    ]
  }

  const handlePause = async () => {
    if (isPausing || isSubmitting) return
    setIsPausing(true)
    setError("")
    stopSpeaking()
    stopListening()
    stopAnalysis()
    if (storageKey) localStorage.removeItem(storageKey)

    const saved = await updatingMockInterview({
      completedSections,
      answers: answersWithDraft(),
      currentQuestionIndex: questionIndex,
      currentSection: section,
    })
    if (!saved) {
      setError("Could not save progress. Stay on this page and try again.")
      setIsPausing(false)
      return
    }

    navigate(`/interview/${interviewId}`, { state: { tab: "mock-interview" } })
  }

  const handleStartAnswering = async () => {
    pendingVideoMetricsRef.current = null
    answerStartedAtRef.current = Date.now()
    stopSpeaking()
    resetTranscript()
    userEditedRef.current = false
    setUserEdited(false)
    setDraftAnswer("")
    await startListening()
    await startAnalysis(videoRef.current)
  }

  const handleStopAnswering = () => {
    stopListening()
    const metrics = stopAnalysis()
    pendingVideoMetricsRef.current = metrics
  }

  const handleSectionSelect = async (selectedSection) => {
    if (mockId) return
    if (mocksLeft <= 0) {
      setError(mockQuota
        ? `Monthly mock limit reached (${mockQuota.used} used). Ask an admin to add more for this month.`
        : "No mock interviews left this month.")
      return
    }

    setError("")
    setIsStarting(true)
    setSection(selectedSection)
    setQuestionIndex(0)

    try {
      const mockInterview = await startMock(interviewId, selectedSection)
      const createdId = idOf(mockInterview)

      if (!createdId) {
        setError("Failed to start mock interview. Please try again.")
        setIsStarting(false)
        return
      }

      await refreshUser()
      navigate(`/interview/${interviewId}/mock/${createdId}`)
    } catch (err) {
      setSection(null)
      setError(err?.response?.data?.message || "Could not generate a fresh interview. Please try again.")
    } finally {
      setIsStarting(false)
    }
  }

  const handleGenerateMockInterviewReport = async (updatedAnswers) => {
    const result = await completeMockInterview({ answers: updatedAnswers })
    if (!result) {
      throw new Error("report failed")
    }
    if (storageKey) localStorage.removeItem(storageKey)
    navigate(`/interview/${interviewId}/mock/${mockId}/report`)
  }

  const finishInterview = async (updatedAnswers) => {
    if (finishingRef.current) return
    finishingRef.current = true
    setIsFinishing(true)
    if (storageKey) localStorage.removeItem(storageKey)
    try {
      await handleGenerateMockInterviewReport(updatedAnswers)
    } catch {
      finishingRef.current = false
      setIsFinishing(false)
      setError("Could not generate the report. Please try again.")
    }
  }

  useEffect(() => {
    setVocabulary(buildInterviewVocabulary({
      company: report?.company,
      role: report?.jobProfile,
      report,
      mockReport,
    }))
  }, [report, mockReport, setVocabulary])

  useEffect(() => {
    if (!transcript || userEditedRef.current) return
    setDraftAnswer(transcript)
  }, [transcript])

  const handleNextQuestion = async () => {
    const finalAnswer = draftAnswer.trim() || currentAnswer || transcript

    if (!finalAnswer?.trim()) {
      setError("Please answer this question before continuing.")
      return
    }

    if (isListening || transcribing) {
      setError(transcribing
        ? "Wait for transcription to finish, or type your answer."
        : "Stop recording before continuing.")
      return
    }

    setError("")
    setIsSubmitting(true)

    const duration = answerStartedAtRef.current
      ? Math.round((Date.now() - answerStartedAtRef.current) / 1000)
      : 0

    try {
      const response = await submitAnswer({
        section,
        questionIndex,
        questionId: currentQuestion?.id,
        question: currentQuestion?.question,
        expectedAnswer: currentQuestion?.expectedAnswer || currentQuestion?.answer,
        userAnswer: finalAnswer,
        videoMetrics: pendingVideoMetricsRef.current || null,
        duration,
      })

      pendingVideoMetricsRef.current = null
      answerStartedAtRef.current = null

      const updatedAnswers = response.mockInterviewReport?.answers || []
      const nextCompleted = response.mockInterviewReport?.completedSections || completedSections

      setAnswers(updatedAnswers)
      setCompletedSections(nextCompleted)
      resetTranscript()
      setDraftAnswer("")
      userEditedRef.current = false
      setUserEdited(false)

      const next = response.next
      const nextPrompt = typeof next?.question === "string"
        ? next.question
        : next?.question?.question
      const hasNextQuestion = Boolean(next?.section && nextPrompt)

      if (response.interviewComplete || !hasNextQuestion) {
        await finishInterview(updatedAnswers)
        return
      }

      setSection(next.section)
      setQuestionIndex(typeof next.questionIndex === "number" ? next.questionIndex : 0)
      if (storageKey) localStorage.removeItem(storageKey)
    } catch (err) {
      setError(err?.response?.data?.message || "Could not save that answer.")
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    if (section && currentQuestion?.question) {
      speak(currentQuestion.question)
    }
  }, [questionIndex, section, currentQuestion?.id])

  useEffect(() => {
    if (didRestoreRef.current) return

    if (!storageKey) {
      didRestoreRef.current = true
      setIsRestoring(false)
      return
    }

    localStorage.removeItem(storageKey)

    if (mockLoading) {
      mockFetchStartedRef.current = true
      return
    }

    if (!mockReport) {
      if (!mockFetchStartedRef.current) return
      didRestoreRef.current = true
      setIsRestoring(false)
      setError("Could not restore this session.")
      return
    }

    if (mockReport.status === "completed") {
      didRestoreRef.current = true
      setIsRestoring(false)
      navigate(`/interview/${interviewId}/mock/${mockId}/report`)
      return
    }

    if (mockReport.currentSection) {
      setSection(mockReport.currentSection)
      setQuestionIndex(mockReport.currentQuestionIndex || 0)
      setAnswers(mockReport.answers || [])
      setCompletedSections(mockReport.completedSections || [])
      const savedAnswer = (mockReport.answers || []).find(
        (answer) =>
          answer.section === mockReport.currentSection
          && answer.questionIndex === (mockReport.currentQuestionIndex || 0)
      )?.userAnswer
      setDraftAnswer(savedAnswer || "")
    }

    didRestoreRef.current = true
    setIsRestoring(false)
  }, [storageKey, mockLoading, mockReport, interviewId, mockId, navigate])

  useEffect(() => {
    if (isRestoring || isFinishing || isSubmitting || !mockReport?.questions || !section) return
    const sectionQuestions = mockReport.questions?.[section] || []
    if (sectionQuestions.length === 0 && answers.length === 0 && questionIndex === 0) return
    if (sectionQuestions.length === 0 || questionIndex >= sectionQuestions.length) {
      if (autoFinishAttemptedRef.current) return
      autoFinishAttemptedRef.current = true
      finishInterview(answers)
    }
  }, [isRestoring, isFinishing, isSubmitting, mockReport, section, questionIndex, answers])

  useEffect(() => {
    return () => {
      stopSpeaking()
      stopListening()
      stopAnalysis()
    }
  }, [])

  if (!report || isStarting) {
    return (
      <LoadingScreen
        title={isStarting ? "Writing a fresh interview" : "Preparing the mock"}
        message="Questions are generated for this attempt, not copied from your prep report."
      />
    )
  }

  if (isRestoring) {
    return (
      <LoadingScreen
        title="Restoring your session"
        message="Picking up the last question you left."
      />
    )
  }

  if (section == null && !mockId) {
    return (
      <AppShell>
        <section className="choose-section choose-section--shell">
          <div className="choose-section__card">
            <h1>Start a live mock</h1>
            <p>Eight technical questions, with follow-ups when an answer needs more depth, then five behavioral questions.</p>
            {mockQuota && (
              <p className="choose-section__quota">
                {mockQuota.remaining} of {mockQuota.cap + mockQuota.granted} mocks left this month.
              </p>
            )}
            <div className="choose-section__actions">
              <button
                className="button primary-button"
                onClick={() => handleSectionSelect("technical")}
                disabled={mocksLeft <= 0}
              >
                Start mock
              </button>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
          </div>
        </section>
      </AppShell>
    )
  }

  if (isFinishing) {
    return (
      <LoadingScreen
        title="Scoring your interview"
        message="Building feedback from your answers and presentation."
      />
    )
  }

  const sessionReady = Boolean(section)
  const totalInSection = questions.length
  const displayMetrics = liveMetrics || pendingVideoMetricsRef.current

  if (!sessionReady) {
    return (
      <LoadingScreen
        title="Opening your mock"
        message="Restoring this session."
      />
    )
  }

  return (
    <div className='mock-session'>
      <header className='mock-session__top'>
        <BrandLogo
          to={`/interview/${interviewId}`}
          onClick={(event) => {
            event.preventDefault()
            handlePause()
          }}
        />
        <div className='mock-session__meta'>
          <span className={`section-chip ${section}`}>{section}</span>
          <span>Question {questionIndex + 1} of {totalInSection}</span>
          {currentQuestion?.isFollowUp && <span className='followup-chip'>Follow-up</span>}
          <button
            type="button"
            className="button secondary-button mock-session__pause"
            onClick={handlePause}
            disabled={isPausing || isSubmitting}
          >
            {isPausing ? "Saving..." : "Pause and go back"}
          </button>
        </div>
      </header>

      <div className='mock-progress'>
        <div
          className='mock-progress__bar'
          style={{ transform: `scaleX(${(questionIndex + 1) / Math.max(totalInSection, 1)})` }}
        />
      </div>

      <section className='question-section'>
        <div className='camera-preview'>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className='camera-preview__video'
          />
          {cameraError && (
            <p className='camera-preview__hint'>Camera unavailable. The interview continues without presentation metrics.</p>
          )}
          {!cameraError && !isCameraReady && (
            <p className='camera-preview__hint'>Starting camera...</p>
          )}
          {analyzerError && (
            <p className='camera-preview__hint'>{analyzerError}</p>
          )}
          {isAnalyzing && (
            <span className='camera-preview__badge'>Reading presentation signals</span>
          )}

          {displayMetrics && (
            <div className='live-metrics'>
              <span>Eye contact {percent(displayMetrics.eyeContact)}%</span>
              <span>Gaze away {percent(displayMetrics.gazeAwayRate)}%</span>
              <span>Face {percent(displayMetrics.faceVisibility)}%</span>
            </div>
          )}
        </div>

        <div className='question-panel'>
          <div className='q-card'>
            <div className='q-card__header'>
              <span className='q-card__index'>Q{questionIndex + 1}</span>
              <p className='q-card__question'>
                {currentQuestion?.question
                  || (isSubmitting ? "Saving your answer..." : "Wrapping up your interview...")}
              </p>
            </div>
            {currentQuestion?.intention && (
              <p className='q-card__intention'>{currentQuestion.intention}</p>
            )}
          </div>

          <div className='question-buttons'>
            <div className="answering-buttons">
              <button
                className='button primary-button'
                onClick={handleStartAnswering}
                disabled={!currentQuestion || isListening || isAnalyzing || isSubmitting || transcribing}
              >
                {isListening ? "Listening..." : transcribePhase === "tail" ? "Finishing transcription..." : "Start answering"}
              </button>

              <button
                className='button secondary-button'
                onClick={handleStopAnswering}
                disabled={!isListening && !isAnalyzing}
              >
                Stop
              </button>
            </div>

            <button
              className='button primary-button'
              onClick={handleNextQuestion}
              disabled={isSubmitting || !draftAnswer.trim() || transcribePhase === "tail" || (transcribing && !userEdited)}
            >
              {isSubmitting ? "Saving..." : "Next"}
            </button>
          </div>

          {error && <p className='form-error' role='alert'>{error}</p>}
          {speechError && (
            <div>
              <p className='form-error' role='alert'>{speechError}</p>
              {sttMode !== "webkit" && (
                <div className="answering-buttons">
                  <button
                    type="button"
                    className="button secondary-button"
                    onClick={() => retryTranscription()}
                    disabled={transcribing || isListening}
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}
          <p className='q-card__intention'>
            {whisperReady && sttMode === "whisper" && "Voice transcription ready. Audio stays in this browser."}
            {sttMode === "webkit" && "Browser speech recognition. Please review the transcript before continuing."}
            {sttMode === "manual" && "Type your answer. Voice transcription is unavailable on this device."}
            {!whisperReady && sttMode === "whisper" && "Preparing voice transcription in the background..."}
          </p>
          {transcribePhase === "live" && (
            <p className='q-card__intention' role="status">Transcribing...</p>
          )}
          {transcribePhase === "tail" && (
            <p className='q-card__intention' role="status">Finishing transcription...</p>
          )}

          <div className='answer-preview'>
            <h3>Your answer {transcribePhase === "live"
              ? <span className='answer-preview__live'>Transcribing...</span>
              : transcribePhase === "tail"
                ? <span className='answer-preview__live'>Finishing transcription...</span>
                : isListening
                  ? <span className='answer-preview__live'>Live</span>
                  : null}</h3>
            <textarea
              className='answer-preview__input'
              value={draftAnswer}
              onChange={(e) => {
                userEditedRef.current = true
                setUserEdited(true)
                setDraftAnswer(e.target.value)
              }}
              placeholder="Click Start answering and speak, or type here."
              rows={6}
              disabled={isSubmitting}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

export default MockInterview
