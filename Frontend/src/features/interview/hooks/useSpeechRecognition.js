import { useRef, useState } from "react"

const TRANSIENT_ERRORS = new Set([
    "no-speech",
    "aborted",
    "network",
    "audio-capture",
])

/**
 * Chrome's SpeechRecognition is cloud-based and restarts often.
 * Keep finalized text across those restarts and ignore noisy errors.
 */
export const useSpeechRecognition = () => {
    const [isListening, setIsListening] = useState(false)
    const [transcript, setTranscript] = useState("")
    const [speechError, setSpeechError] = useState(null)

    const recognitionRef = useRef(null)
    const shouldListenRef = useRef(false)
    const committedRef = useRef("")
    const restartTimerRef = useRef(null)
    const failCountRef = useRef(0)

    const getSpeechRecognition = () =>
        window.SpeechRecognition || window.webkitSpeechRecognition

    const publish = (interim = "") => {
        const next = `${committedRef.current} ${interim}`.replace(/\s+/g, " ").trim()
        setTranscript(next)
        if (next) {
            failCountRef.current = 0
            setSpeechError(null)
        }
    }

    const scheduleRestart = () => {
        if (!shouldListenRef.current) return

        window.clearTimeout(restartTimerRef.current)
        restartTimerRef.current = window.setTimeout(() => {
            if (shouldListenRef.current) startEngine()
        }, 280)
    }

    const startEngine = () => {
        const SpeechRecognition = getSpeechRecognition()
        if (!SpeechRecognition || !shouldListenRef.current) return

        try {
            recognitionRef.current?.stop()
        } catch {
            // ignore
        }

        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = "en-US"
        recognition.maxAlternatives = 1

        recognition.onstart = () => {
            setIsListening(true)
        }

        recognition.onresult = (event) => {
            let interim = ""

            for (let i = event.resultIndex; i < event.results.length; i += 1) {
                const piece = event.results[i][0]?.transcript || ""
                if (event.results[i].isFinal) {
                    committedRef.current = `${committedRef.current} ${piece}`.replace(/\s+/g, " ").trim()
                } else {
                    interim += piece
                }
            }

            publish(interim)
        }

        recognition.onerror = (event) => {
            if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                shouldListenRef.current = false
                setIsListening(false)
                setSpeechError("Microphone access is blocked. Type your answer instead.")
                return
            }

            if (TRANSIENT_ERRORS.has(event.error)) {
                failCountRef.current += 1
                if (event.error === "network" && failCountRef.current >= 4 && !committedRef.current) {
                    setSpeechError("Live transcription could not stay connected. Type your answer instead.")
                }
                return
            }

            failCountRef.current += 1
        }

        recognition.onend = () => {
            recognitionRef.current = null

            if (shouldListenRef.current) {
                scheduleRestart()
                return
            }

            setIsListening(false)
        }

        recognitionRef.current = recognition

        try {
            recognition.start()
        } catch {
            scheduleRestart()
        }
    }

    const startListening = () => {
        const SpeechRecognition = getSpeechRecognition()

        if (!SpeechRecognition) {
            setSpeechError("This browser cannot transcribe speech. Type your answer instead.")
            return false
        }

        window.clearTimeout(restartTimerRef.current)
        failCountRef.current = 0
        setSpeechError(null)
        shouldListenRef.current = true
        startEngine()
        return true
    }

    const stopListening = () => {
        shouldListenRef.current = false
        window.clearTimeout(restartTimerRef.current)
        try {
            recognitionRef.current?.stop()
        } catch {
            // ignore
        }
        recognitionRef.current = null
        setIsListening(false)
    }

    const resetTranscript = () => {
        committedRef.current = ""
        setTranscript("")
    }

    return {
        transcript,
        isListening,
        speechError,
        startListening,
        stopListening,
        resetTranscript,
    }
}
