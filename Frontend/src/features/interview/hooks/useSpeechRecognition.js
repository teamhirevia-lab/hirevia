import { useCallback, useEffect, useRef, useState } from "react"
import {
    LANGUAGE,
    SAMPLE_RATE,
    MAX_RECORDING_MS,
    selectWhisperModel,
    pickRecorderMimeType,
    restoreVocabularyCasing,
} from "../config/sttConfig.js"

const TRANSIENT_ERRORS = new Set([
    "no-speech",
    "aborted",
    "network",
    "audio-capture",
])

function resample(input, fromRate, toRate) {
    if (fromRate === toRate) return input
    const ratio = fromRate / toRate
    const length = Math.max(1, Math.round(input.length / ratio))
    const output = new Float32Array(length)
    for (let i = 0; i < length; i += 1) {
        const position = i * ratio
        const index = Math.floor(position)
        const next = Math.min(index + 1, input.length - 1)
        const mix = position - index
        output[i] = input[index] * (1 - mix) + input[next] * mix
    }
    return output
}

async function blobToPcm16k(blob) {
    const context = new AudioContext()
    try {
        const buffer = await blob.arrayBuffer()
        const decoded = await context.decodeAudioData(buffer.slice(0))
        const channel = decoded.numberOfChannels > 1
            ? mixToMono(decoded)
            : decoded.getChannelData(0)
        return resample(channel, decoded.sampleRate, SAMPLE_RATE)
    } finally {
        await context.close()
    }
}

function mixToMono(decoded) {
    const length = decoded.length
    const mixed = new Float32Array(length)
    const count = decoded.numberOfChannels
    for (let c = 0; c < count; c += 1) {
        const data = decoded.getChannelData(c)
        for (let i = 0; i < length; i += 1) mixed[i] += data[i] / count
    }
    return mixed
}

function getSpeechRecognition() {
    return window.SpeechRecognition || window.webkitSpeechRecognition
}

/**
 * Whisper (worker) is the scoring transcript. Chrome Web Speech is fallback only.
 */
export const useSpeechRecognition = () => {
    const [isListening, setIsListening] = useState(false)
    const [transcript, setTranscript] = useState("")
    const [speechError, setSpeechError] = useState(null)
    const [ready, setReady] = useState(false)
    const [processing, setProcessing] = useState(false)
    const [sttMode, setSttMode] = useState("whisper")

    const workerRef = useRef(null)
    const requestIdRef = useRef(0)
    const vocabRef = useRef([])
    const modelRef = useRef(selectWhisperModel())
    const mediaStreamRef = useRef(null)
    const recorderRef = useRef(null)
    const chunksRef = useRef([])
    const lastBlobRef = useRef(null)
    const maxTimerRef = useRef(null)
    const mountedRef = useRef(true)

    const recognitionRef = useRef(null)
    const shouldListenRef = useRef(false)
    const committedRef = useRef("")
    const restartTimerRef = useRef(null)
    const failCountRef = useRef(0)

    const setVocabulary = useCallback((terms) => {
        vocabRef.current = Array.isArray(terms) ? terms : []
    }, [])

    const applyTranscript = useCallback((text, requestId) => {
        if (!mountedRef.current) return
        if (requestId != null && requestId !== requestIdRef.current) return
        const cleaned = restoreVocabularyCasing(text, vocabRef.current)
        setTranscript(cleaned)
        setProcessing(false)
        setSpeechError(null)
    }, [])

    const publishWebkit = (interim = "") => {
        const next = `${committedRef.current} ${interim}`.replace(/\s+/g, " ").trim()
        setTranscript(next)
        if (next) {
            failCountRef.current = 0
            setSpeechError(null)
        }
    }

    const startWebkitEngine = () => {
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

        recognition.onstart = () => setIsListening(true)

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
            publishWebkit(interim)
        }

        recognition.onerror = (event) => {
            if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                shouldListenRef.current = false
                setIsListening(false)
                setSpeechError("Microphone access is blocked. Type your answer instead.")
                setSttMode("manual")
                return
            }
            if (TRANSIENT_ERRORS.has(event.error)) {
                failCountRef.current += 1
                return
            }
            failCountRef.current += 1
        }

        recognition.onend = () => {
            recognitionRef.current = null
            if (shouldListenRef.current) {
                window.clearTimeout(restartTimerRef.current)
                restartTimerRef.current = window.setTimeout(() => {
                    if (shouldListenRef.current) startWebkitEngine()
                }, 280)
                return
            }
            setIsListening(false)
        }

        recognitionRef.current = recognition
        try {
            recognition.start()
        } catch {
            shouldListenRef.current = false
            setIsListening(false)
        }
    }

    const releaseMic = () => {
        window.clearTimeout(maxTimerRef.current)
        try {
            if (recorderRef.current && recorderRef.current.state !== "inactive") {
                recorderRef.current.stop()
            }
        } catch {
            // ignore
        }
        recorderRef.current = null
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
        chunksRef.current = []
    }

    const transcribeBlob = useCallback(async (blob) => {
        if (!blob || !workerRef.current) {
            setProcessing(false)
            setSpeechError("Voice transcription failed. Type your answer instead.")
            setSttMode((mode) => (mode === "whisper" ? "manual" : mode))
            return
        }

        const requestId = requestIdRef.current + 1
        requestIdRef.current = requestId
        setProcessing(true)
        setSpeechError(null)
        console.info("[STT] transcription started")

        try {
            const pcm = await blobToPcm16k(blob)
            if (requestId !== requestIdRef.current) return
            workerRef.current.postMessage({
                type: "transcribe",
                requestId,
                model: modelRef.current,
                language: LANGUAGE,
                prompt: vocabRef.current.join(", "),
                audio: pcm,
                samplingRate: SAMPLE_RATE,
            }, [pcm.buffer])
        } catch (err) {
            if (requestId !== requestIdRef.current) return
            console.info("[STT] transcription failed")
            setProcessing(false)
            setSpeechError("Voice transcription failed.")
        }
    }, [])

    const retryTranscription = useCallback(() => {
        if (!lastBlobRef.current) {
            setSpeechError("Unable to transcribe automatically. Please type or edit your answer.")
            setSttMode("manual")
            return false
        }
        transcribeBlob(lastBlobRef.current)
        return true
    }, [transcribeBlob])

    const startListening = useCallback(async () => {
        setSpeechError(null)
        setTranscript("")
        committedRef.current = ""
        lastBlobRef.current = null
        chunksRef.current = []

        if (sttMode === "webkit") {
            const SpeechRecognition = getSpeechRecognition()
            if (!SpeechRecognition) {
                setSttMode("manual")
                setSpeechError("Unable to transcribe automatically. Please type or edit your answer.")
                return false
            }
            shouldListenRef.current = true
            failCountRef.current = 0
            startWebkitEngine()
            return true
        }

        if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            setSttMode("manual")
            setSpeechError("Unable to transcribe automatically. Please type or edit your answer.")
            return false
        }

        try {
            console.info("[STT] recording started")
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            mediaStreamRef.current = stream
            const mimeType = pickRecorderMimeType()
            const recorder = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream)
            chunksRef.current = []
            recorder.ondataavailable = (event) => {
                if (event.data?.size) chunksRef.current.push(event.data)
            }
            recorder.onstop = () => {
                console.info("[STT] recording stopped")
                const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" })
                chunksRef.current = []
                mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
                mediaStreamRef.current = null
                recorderRef.current = null
                if (!blob.size) {
                    setIsListening(false)
                    setSpeechError("Voice transcription failed.")
                    return
                }
                lastBlobRef.current = blob
                setIsListening(false)
                transcribeBlob(blob)
            }
            recorderRef.current = recorder
            recorder.start(250)
            setIsListening(true)
            setSttMode("whisper")
            window.clearTimeout(maxTimerRef.current)
            maxTimerRef.current = window.setTimeout(() => {
                if (recorderRef.current?.state === "recording") recorderRef.current.stop()
            }, MAX_RECORDING_MS)
            return true
        } catch {
            setIsListening(false)
            setSpeechError("Microphone access is blocked. Type your answer instead.")
            setSttMode("manual")
            return false
        }
    }, [sttMode, transcribeBlob])

    const stopListening = useCallback(() => {
        shouldListenRef.current = false
        window.clearTimeout(restartTimerRef.current)
        window.clearTimeout(maxTimerRef.current)
        try {
            recognitionRef.current?.stop()
        } catch {
            // ignore
        }
        recognitionRef.current = null

        if (recorderRef.current && recorderRef.current.state === "recording") {
            try {
                recorderRef.current.stop()
            } catch {
                setIsListening(false)
            }
            return
        }

        setIsListening(false)
    }, [])

    const resetTranscript = useCallback(() => {
        requestIdRef.current += 1
        committedRef.current = ""
        lastBlobRef.current = null
        setTranscript("")
        setProcessing(false)
        setSpeechError(null)
    }, [])

    useEffect(() => {
        mountedRef.current = true
        modelRef.current = selectWhisperModel()

        let worker
        try {
            worker = new Worker(
                new URL("../workers/whisper.worker.js", import.meta.url),
                { type: "module" },
            )
        } catch (err) {
            console.info("[STT] model loading")
            console.info("[STT] transcription failed")
            setSttMode(getSpeechRecognition() ? "webkit" : "manual")
            setReady(false)
            return undefined
        }

        workerRef.current = worker
        worker.onmessage = (event) => {
            const payload = event.data || {}
            if (payload.type === "ready") {
                setReady(true)
                setSttMode("whisper")
                return
            }
            if (payload.type === "transcription") {
                applyTranscript(payload.text, payload.requestId)
                return
            }
            if (payload.type === "error") {
                if (payload.requestId != null && payload.requestId !== requestIdRef.current) return
                setProcessing(false)
                setSpeechError("Voice transcription failed.")
            }
        }
        worker.onerror = () => {
            setReady(false)
            setProcessing(false)
            setSttMode(getSpeechRecognition() ? "webkit" : "manual")
        }

        console.info("[STT] model loading")
        worker.postMessage({ type: "init", model: modelRef.current })

        return () => {
            mountedRef.current = false
            requestIdRef.current += 1
            releaseMic()
            worker.terminate()
            workerRef.current = null
        }
    }, [applyTranscript])

    return {
        transcript,
        isListening,
        speechError,
        ready,
        processing,
        sttMode,
        startListening,
        stopListening,
        resetTranscript,
        retryTranscription,
        setVocabulary,
    }
}
