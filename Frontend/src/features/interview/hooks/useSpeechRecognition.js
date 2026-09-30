import { useCallback, useEffect, useRef, useState } from "react"
import {
    LANGUAGE,
    SAMPLE_RATE,
    MAX_RECORDING_MS,
    WHISPER_TINY,
    selectWhisperModel,
    pickRecorderMimeType,
    restoreVocabularyCasing,
} from "../config/sttConfig.js"
import {
    createScheduler,
    markSent,
    mergeOverlap,
    noteBuffer,
    planTail,
    settleFailure,
    settleSuccess,
    stopAccepting,
} from "../utils/sttRolling.js"
import pcmCaptureSource from "../workers/pcm-capture.worklet.js?raw"

const TRANSIENT_ERRORS = new Set([
    "no-speech",
    "aborted",
    "network",
    "audio-capture",
])

const MAX_PCM_SAMPLES = Math.floor((MAX_RECORDING_MS / 1000) * SAMPLE_RATE)

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

function growBuffer(current, needed) {
    if (current.length >= needed) return current
    const next = new Float32Array(needed)
    if (current.length) next.set(current)
    return next
}

/**
 * Whisper (worker) is the scoring transcript. Chrome Web Speech is fallback only.
 * Live windows use whisper-tiny.en. Stop transcribes only the unprocessed tail.
 */
export const useSpeechRecognition = () => {
    const [isListening, setIsListening] = useState(false)
    const [transcript, setTranscript] = useState("")
    const [speechError, setSpeechError] = useState(null)
    const [ready, setReady] = useState(false)
    const [processing, setProcessing] = useState(false)
    const [sttMode, setSttMode] = useState("whisper")
    const [transcribePhase, setTranscribePhase] = useState("idle")

    const workerRef = useRef(null)
    const requestIdRef = useRef(0)
    const sessionIdRef = useRef(0)
    const vocabRef = useRef([])
    const modelRef = useRef(selectWhisperModel())
    const mediaStreamRef = useRef(null)
    const recorderRef = useRef(null)
    const chunksRef = useRef([])
    const lastBlobRef = useRef(null)
    const readyRef = useRef(false)
    const maxTimerRef = useRef(null)
    const mountedRef = useRef(true)
    const sttModeRef = useRef("whisper")
    const phaseRef = useRef("idle")
    const transcriptRef = useRef("")
    const schedulerRef = useRef(createScheduler(SAMPLE_RATE))
    const pcmRef = useRef({ storage: new Float32Array(0), length: 0 })
    const rawRef = useRef({ storage: new Float32Array(0), length: 0, rate: SAMPLE_RATE })
    const audioContextRef = useRef(null)
    const workletNodeRef = useRef(null)
    const sourceNodeRef = useRef(null)
    const muteNodeRef = useRef(null)
    const pcmActiveRef = useRef(false)
    const armingRef = useRef(false)
    const apiRef = useRef({})

    const recognitionRef = useRef(null)
    const shouldListenRef = useRef(false)
    const committedRef = useRef("")
    const restartTimerRef = useRef(null)
    const failCountRef = useRef(0)

    const setPhase = (phase) => {
        phaseRef.current = phase
        setTranscribePhase(phase)
    }

    const publishTranscript = (text) => {
        transcriptRef.current = text
        setTranscript(text)
    }

    const resetPcm = () => {
        schedulerRef.current = createScheduler(SAMPLE_RATE)
        pcmRef.current = { storage: new Float32Array(0), length: 0 }
        rawRef.current = { storage: new Float32Array(0), length: 0, rate: SAMPLE_RATE }
        pcmActiveRef.current = false
    }

    const appendPcm = (samples) => {
        if (!samples?.length) return
        const pcm = pcmRef.current
        const room = Math.max(0, MAX_PCM_SAMPLES - pcm.length)
        const take = Math.min(room, samples.length)
        if (!take) return
        pcm.storage = growBuffer(pcm.storage, pcm.length + take)
        pcm.storage.set(samples.subarray(0, take), pcm.length)
        pcm.length += take
    }

    const flushRaw = () => {
        const raw = rawRef.current
        if (raw.length < 1) return
        const chunk = raw.storage.slice(0, raw.length)
        raw.length = 0
        appendPcm(resample(chunk, raw.rate || SAMPLE_RATE, SAMPLE_RATE))
    }

    const pushRaw = (frame, sampleRate) => {
        if (!(frame instanceof Float32Array) || !frame.length) return
        const raw = rawRef.current
        raw.rate = sampleRate || raw.rate || SAMPLE_RATE
        raw.storage = growBuffer(raw.storage, raw.length + frame.length)
        raw.storage.set(frame, raw.length)
        raw.length += frame.length
        const flushAt = Math.round(raw.rate * 0.25)
        if (raw.length < flushAt) return
        flushRaw()
    }

    const setVocabulary = useCallback((terms) => {
        vocabRef.current = Array.isArray(terms) ? terms : []
    }, [])

    const applyTranscript = useCallback((text, requestId) => {
        if (!mountedRef.current) return
        if (requestId != null && requestId !== requestIdRef.current) return
        const cleaned = restoreVocabularyCasing(text, vocabRef.current)
        transcriptRef.current = cleaned
        setTranscript(cleaned)
        setProcessing(false)
        setPhase("idle")
        setSpeechError(null)
    }, [])

    const publishWebkit = (interim = "") => {
        const next = `${committedRef.current} ${interim}`.replace(/\s+/g, " ").trim()
        publishTranscript(next)
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
                sttModeRef.current = "manual"
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

    const closeAudioGraph = ({ stopTracks = true } = {}) => {
        try { workletNodeRef.current?.disconnect() } catch { /* ignore */ }
        try { sourceNodeRef.current?.disconnect() } catch { /* ignore */ }
        try { muteNodeRef.current?.disconnect() } catch { /* ignore */ }
        workletNodeRef.current = null
        sourceNodeRef.current = null
        muteNodeRef.current = null
        const context = audioContextRef.current
        audioContextRef.current = null
        if (context && context.state !== "closed") {
            context.close().catch(() => {})
        }
        if (!stopTracks) return
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
    }

    const flushWorklet = () => {
        const node = workletNodeRef.current
        if (!node) return Promise.resolve()
        return new Promise((resolve) => {
            const timeout = window.setTimeout(resolve, 80)
            const previous = node.port.onmessage
            node.port.onmessage = (event) => {
                if (event.data?.type === "flushed") {
                    window.clearTimeout(timeout)
                    node.port.onmessage = previous
                    resolve()
                    return
                }
                if (typeof previous === "function") previous(event)
            }
            try {
                node.port.postMessage({ type: "flush" })
            } catch {
                window.clearTimeout(timeout)
                resolve()
            }
        })
    }

    const postWindow = (job) => {
        const worker = workerRef.current
        const scheduler = schedulerRef.current
        if (!worker || !job) return
        const requestId = requestIdRef.current + 1
        requestIdRef.current = requestId
        const sessionId = sessionIdRef.current
        const tagged = markSent(scheduler, requestId, sessionId)
        if (!tagged) return
        const start = Math.max(0, tagged.startSample)
        const end = Math.min(pcmRef.current.length, tagged.endSample)
        if (end - start < 1) return
        const audio = pcmRef.current.storage.slice(start, end)
        setProcessing(true)
        setPhase(scheduler.accepting ? "live" : "tail")
        worker.postMessage({
            type: "transcribe-window",
            requestId,
            sessionId,
            startSample: start,
            endSample: end,
            audio,
            samplingRate: SAMPLE_RATE,
        }, [audio.buffer])
    }

    const pumpWindows = () => {
        const job = noteBuffer(schedulerRef.current, pcmRef.current.length)
        if (job) postWindow(job)
    }

    const finishQuiet = () => {
        if (!mountedRef.current) return
        setProcessing(false)
        setPhase("idle")
    }

    const beginTail = () => {
        if (!mountedRef.current) return
        flushRaw()
        const plan = planTail(schedulerRef.current, pcmRef.current.length)
        if (plan.wait) {
            setProcessing(true)
            setPhase("tail")
            return
        }
        if (plan.send) {
            postWindow(plan.send)
            return
        }
        finishQuiet()
    }

    const afterWindow = (decision) => {
        if (!mountedRef.current || !decision?.applied) return
        if (decision.retry) {
            postWindow(decision.retry)
            return
        }
        if (decision.send) {
            postWindow(decision.send)
            return
        }
        if (decision.hold) {
            if (!decision.wasTail && !schedulerRef.current.accepting) {
                beginTail()
                return
            }
            finishQuiet()
            return
        }
        if (decision.tail || !schedulerRef.current.accepting) {
            beginTail()
            return
        }
        const next = noteBuffer(schedulerRef.current, pcmRef.current.length)
        if (next) {
            postWindow(next)
            return
        }
        finishQuiet()
    }

    const releaseMic = () => {
        window.clearTimeout(maxTimerRef.current)
        const recorder = recorderRef.current
        recorderRef.current = null
        if (recorder && recorder.state !== "inactive") {
            recorder.onstop = null
            try { recorder.stop() } catch { /* ignore */ }
        }
        closeAudioGraph()
        chunksRef.current = []
    }

    const transcribeBlob = useCallback(async (blob) => {
        if (!blob || !workerRef.current) {
            setProcessing(false)
            setPhase("idle")
            setSpeechError("Voice transcription failed. Type your answer instead.")
            setSttMode((mode) => (mode === "whisper" ? "manual" : mode))
            return
        }

        sessionIdRef.current += 1
        const requestId = requestIdRef.current + 1
        requestIdRef.current = requestId
        const sessionId = sessionIdRef.current
        schedulerRef.current.inflight = null
        schedulerRef.current.queued = null
        setProcessing(true)
        setPhase("tail")
        setSpeechError(null)
        console.info("[STT] transcription started")

        try {
            const pcm = await blobToPcm16k(blob)
            if (requestId !== requestIdRef.current) return
            workerRef.current.postMessage({
                type: "transcribe",
                requestId,
                sessionId,
                model: modelRef.current,
                fallbackModel: WHISPER_TINY,
                language: LANGUAGE,
                prompt: vocabRef.current.join(", "),
                audio: pcm,
                samplingRate: SAMPLE_RATE,
            }, [pcm.buffer])
        } catch {
            if (requestId !== requestIdRef.current) return
            console.info("[STT] transcription failed")
            setProcessing(false)
            setPhase("idle")
            setSpeechError("Voice transcription failed.")
            if (getSpeechRecognition()) {
                setSttMode("webkit")
                sttModeRef.current = "webkit"
            }
        }
    }, [])

    const retryTranscription = useCallback(() => {
        if (!lastBlobRef.current) {
            setSpeechError("Unable to transcribe automatically. Please type or edit your answer.")
            setSttMode("manual")
            sttModeRef.current = "manual"
            return false
        }
        transcribeBlob(lastBlobRef.current)
        return true
    }, [transcribeBlob])

    const handleRecorderStop = async (blob, sessionId) => {
        if (sessionId !== sessionIdRef.current) return
        if (blob?.size) lastBlobRef.current = blob
        await flushWorklet()
        if (sessionId !== sessionIdRef.current) return
        flushRaw()
        closeAudioGraph()
        setIsListening(false)
        if (!blob?.size && pcmRef.current.length < schedulerRef.current.minTailSamples) {
            setSpeechError("Voice transcription failed.")
            finishQuiet()
            return
        }
        if (pcmActiveRef.current) {
            beginTail()
            return
        }
        if (blob?.size) transcribeBlob(blob)
        else finishQuiet()
    }

    const startListening = useCallback(async () => {
        setSpeechError(null)
        publishTranscript("")
        committedRef.current = ""
        lastBlobRef.current = null
        chunksRef.current = []
        sessionIdRef.current += 1
        requestIdRef.current += 1
        const sessionId = sessionIdRef.current
        resetPcm()
        schedulerRef.current.accepting = true
        releaseMic()
        setProcessing(false)
        setPhase("idle")

        const mode = sttModeRef.current
        if (mode === "webkit" || (!readyRef.current && getSpeechRecognition())) {
            const SpeechRecognition = getSpeechRecognition()
            if (!SpeechRecognition) {
                setSttMode("manual")
                sttModeRef.current = "manual"
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
            sttModeRef.current = "manual"
            setSpeechError("Unable to transcribe automatically. Please type or edit your answer.")
            return false
        }

        try {
            console.info("[STT] recording started")
            armingRef.current = true
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            if (sessionId !== sessionIdRef.current) {
                stream.getTracks().forEach((track) => track.stop())
                return false
            }
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
                recorderRef.current = null
                handleRecorderStop(blob, sessionId)
            }
            recorderRef.current = recorder

            if (typeof AudioWorkletNode !== "undefined") {
                let context = null
                try {
                    context = new AudioContext()
                    audioContextRef.current = context
                    const workletUrl = URL.createObjectURL(new Blob([pcmCaptureSource], { type: "text/javascript" }))
                    try {
                        await context.audioWorklet.addModule(workletUrl)
                    } finally {
                        URL.revokeObjectURL(workletUrl)
                    }
                    if (sessionId !== sessionIdRef.current) {
                        if (audioContextRef.current === context) closeAudioGraph()
                        else if (context.state !== "closed") context.close().catch(() => {})
                        return false
                    }
                    if (context.state === "suspended") await context.resume()
                    const source = context.createMediaStreamSource(stream)
                    const node = new AudioWorkletNode(context, "hirevia-pcm-capture")
                    const mute = context.createGain()
                    mute.gain.value = 0
                    node.port.onmessage = (event) => {
                        if (sessionId !== sessionIdRef.current) return
                        const frame = event.data
                        if (!(frame instanceof Float32Array)) return
                        pushRaw(frame, context.sampleRate)
                        if (schedulerRef.current.accepting) pumpWindows()
                    }
                    source.connect(node)
                    node.connect(mute)
                    mute.connect(context.destination)
                    sourceNodeRef.current = source
                    workletNodeRef.current = node
                    muteNodeRef.current = mute
                    pcmActiveRef.current = true
                } catch {
                    if (sessionId === sessionIdRef.current) pcmActiveRef.current = false
                    if (context && audioContextRef.current === context) closeAudioGraph({ stopTracks: false })
                    else if (context && context.state !== "closed") context.close().catch(() => {})
                }
            }

            if (sessionId !== sessionIdRef.current) {
                if (mediaStreamRef.current === stream) {
                    stream.getTracks().forEach((track) => track.stop())
                    mediaStreamRef.current = null
                }
                return false
            }
            recorder.start(250)
            armingRef.current = false
            setIsListening(true)
            setSttMode("whisper")
            sttModeRef.current = "whisper"
            window.clearTimeout(maxTimerRef.current)
            maxTimerRef.current = window.setTimeout(() => {
                if (recorderRef.current?.state === "recording") {
                    stopAccepting(schedulerRef.current)
                    recorderRef.current.stop()
                }
            }, MAX_RECORDING_MS)
            return true
        } catch {
            armingRef.current = false
            releaseMic()
            setIsListening(false)
            setSpeechError("Microphone access is blocked. Type your answer instead.")
            setSttMode("manual")
            sttModeRef.current = "manual"
            return false
        }
    }, [])

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

        if (armingRef.current && recorderRef.current?.state !== "recording") {
            armingRef.current = false
            sessionIdRef.current += 1
            releaseMic()
            resetPcm()
            setIsListening(false)
            finishQuiet()
            return
        }

        stopAccepting(schedulerRef.current)

        if (recorderRef.current && recorderRef.current.state === "recording") {
            try {
                recorderRef.current.requestData?.()
                recorderRef.current.stop()
            } catch {
                setIsListening(false)
                beginTail()
            }
            return
        }

        setIsListening(false)
        if (pcmActiveRef.current || pcmRef.current.length > 0) {
            flushWorklet().then(() => {
                flushRaw()
                closeAudioGraph()
                beginTail()
            })
            return
        }
        finishQuiet()
    }, [])

    const resetTranscript = useCallback(() => {
        sessionIdRef.current += 1
        requestIdRef.current += 1
        committedRef.current = ""
        lastBlobRef.current = null
        transcriptRef.current = ""
        resetPcm()
        setTranscript("")
        setProcessing(false)
        setPhase("idle")
        setSpeechError(null)
    }, [])

    apiRef.current = {
        applyTranscript,
        afterWindow,
        beginTail,
    }

    useEffect(() => {
        mountedRef.current = true
        modelRef.current = selectWhisperModel()

        let worker
        try {
            worker = new Worker(
                new URL("../workers/whisper.worker.js", import.meta.url),
                { type: "module" },
            )
        } catch {
            console.info("[STT] model loading")
            console.info("[STT] transcription failed")
            const fallback = getSpeechRecognition() ? "webkit" : "manual"
            setSttMode(fallback)
            sttModeRef.current = fallback
            setReady(false)
            return undefined
        }

        workerRef.current = worker
        worker.onmessage = (event) => {
            const payload = event.data || {}
            if (payload.type === "ready") {
                readyRef.current = true
                setReady(true)
                setSttMode("whisper")
                sttModeRef.current = "whisper"
                return
            }
            if (payload.type === "transcription") {
                apiRef.current.applyTranscript(payload.text, payload.requestId)
                return
            }
            if (payload.type === "window-result") {
                const scheduler = schedulerRef.current
                const decision = settleSuccess(scheduler, {
                    sessionId: payload.sessionId,
                    requestId: payload.requestId,
                    currentSessionId: sessionIdRef.current,
                    endSample: payload.endSample,
                })
                if (!decision.applied) return
                const merged = mergeOverlap(transcriptRef.current, payload.text)
                const cleaned = restoreVocabularyCasing(merged, vocabRef.current)
                transcriptRef.current = cleaned
                setTranscript(cleaned)
                setSpeechError(null)
                apiRef.current.afterWindow(decision)
                return
            }
            if (payload.type === "init-error") {
                readyRef.current = false
                setReady(false)
                const fallback = getSpeechRecognition() ? "webkit" : "manual"
                setSttMode(fallback)
                sttModeRef.current = fallback
                if (!getSpeechRecognition()) {
                    setSpeechError("Unable to transcribe automatically. Please type or edit your answer.")
                }
                return
            }
            if (payload.type === "error" && payload.live) {
                const decision = settleFailure(schedulerRef.current, {
                    sessionId: payload.sessionId,
                    requestId: payload.requestId,
                    currentSessionId: sessionIdRef.current,
                })
                if (!decision.applied) return
                apiRef.current.afterWindow(decision)
                return
            }
            if (payload.type === "error") {
                if (payload.requestId != null && payload.requestId !== requestIdRef.current) return
                setProcessing(false)
                setPhase("idle")
                setSpeechError("Voice transcription failed.")
                if (getSpeechRecognition()) {
                    setSttMode("webkit")
                    sttModeRef.current = "webkit"
                }
            }
        }
        worker.onerror = () => {
            readyRef.current = false
            setReady(false)
            setProcessing(false)
            setPhase("idle")
            const fallback = getSpeechRecognition() ? "webkit" : "manual"
            setSttMode(fallback)
            sttModeRef.current = fallback
        }

        console.info("[STT] model loading")
        worker.postMessage({
            type: "init",
            model: WHISPER_TINY,
            fallbackModel: WHISPER_TINY,
        })

        return () => {
            mountedRef.current = false
            sessionIdRef.current += 1
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
        transcribePhase,
        sttMode,
        startListening,
        stopListening,
        resetTranscript,
        retryTranscription,
        setVocabulary,
    }
}
