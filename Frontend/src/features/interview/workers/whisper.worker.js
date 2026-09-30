import { env, pipeline } from "@huggingface/transformers"

const TINY_MODEL = "onnx-community/whisper-tiny.en"
const SAMPLE_RATE = 16_000

env.allowLocalModels = false
env.useBrowserCache = true
if (typeof crossOriginIsolated === "undefined" || !crossOriginIsolated) {
    env.backends.onnx.wasm.numThreads = 1
}

const pipelines = new Map()
let devicePromise = null

function log(event) {
    console.info(`[STT] ${event}`)
}

async function preferredDevice() {
    try {
        if (!navigator?.gpu?.requestAdapter) return "wasm"
        const adapter = await navigator.gpu.requestAdapter()
        return adapter ? "webgpu" : "wasm"
    } catch {
        return "wasm"
    }
}

function getDevice() {
    if (!devicePromise) devicePromise = preferredDevice()
    return devicePromise
}

async function loadPipeline(model, device) {
    log("model loading")
    const asr = await pipeline("automatic-speech-recognition", model, {
        dtype: "q8",
        device,
        progress_callback: (status) => {
            self.postMessage({ type: "progress", status })
        },
    })
    log("model ready")
    return asr
}

async function ensureModel(model, device) {
    const cached = pipelines.get(model)
    if (cached?.asr) return cached.asr
    if (cached?.promise) return cached.promise

    const promise = (async () => {
        try {
            return await loadPipeline(model, device)
        } catch (err) {
            if (device !== "wasm") return loadPipeline(model, "wasm")
            throw err
        }
    })()

    pipelines.set(model, { asr: null, promise })
    try {
        const asr = await promise
        pipelines.set(model, { asr, promise: null })
        return asr
    } catch (err) {
        pipelines.delete(model)
        throw err
    }
}

function asrOptions(modelName, sampleCount) {
    const englishOnly = /\.en(\b|$)/i.test(modelName || "")
    const options = { return_timestamps: false }
    if (!englishOnly) {
        options.language = "en"
        options.task = "transcribe"
    }
    const durationSec = sampleCount / SAMPLE_RATE
    if (durationSec > 30) {
        options.chunk_length_s = 30
        options.stride_length_s = 5
    }
    return options
}

function readAudio(data) {
    return data.audio instanceof Float32Array
        ? data.audio
        : new Float32Array(data.audio)
}

async function runModel(model, audio, options) {
    const device = await getDevice()
    let asr = await ensureModel(model, device)
    try {
        return await asr(audio, options)
    } catch (err) {
        if (device === "wasm") throw err
        pipelines.delete(model)
        devicePromise = Promise.resolve("wasm")
        asr = await ensureModel(model, "wasm")
        return asr(audio, options)
    }
}

self.onmessage = async (event) => {
    const data = event.data || {}
    const { type, requestId } = data

    try {
        if (type === "init") {
            const device = await getDevice()
            await ensureModel(TINY_MODEL, device)
            self.postMessage({ type: "ready", requestId, model: TINY_MODEL })
            return
        }

        if (type === "transcribe-window") {
            const audio = readAudio(data)
            const started = performance.now()
            const options = asrOptions(TINY_MODEL, audio.length)
            const result = await runModel(TINY_MODEL, audio, options)
            const inferenceMs = Math.round(performance.now() - started)
            const audioDurationMs = Math.round((audio.length / SAMPLE_RATE) * 1000)
            const windowStartMs = Math.round((Number(data.startSample) || 0) / SAMPLE_RATE * 1000)
            const windowEndMs = Math.round((Number(data.endSample) || 0) / SAMPLE_RATE * 1000)
            console.info("[STT] window", { audioDurationMs, inferenceMs, windowStartMs, windowEndMs })
            if (audioDurationMs > 0 && inferenceMs / audioDurationMs > 1) {
                console.info("[STT] live transcription falling behind", Number((inferenceMs / audioDurationMs).toFixed(2)))
            }
            const text = typeof result === "string" ? result : (result?.text || "")
            self.postMessage({
                type: "window-result",
                requestId,
                sessionId: data.sessionId,
                startSample: data.startSample,
                endSample: data.endSample,
                text,
                inferenceMs,
            })
            return
        }

        if (type === "transcribe") {
            log("transcription started")
            const model = data.model || TINY_MODEL
            const audio = readAudio(data)
            const options = asrOptions(model, audio.length)
            if (data.prompt) options.initial_prompt = data.prompt
            let result
            try {
                result = await runModel(model, audio, options)
            } catch (err) {
                const fallback = data.fallbackModel
                if (!fallback || fallback === model) throw err
                result = await runModel(fallback, audio, asrOptions(fallback, audio.length))
            }
            const text = typeof result === "string" ? result : (result?.text || "")
            log("transcription completed")
            self.postMessage({
                type: "transcription",
                requestId,
                sessionId: data.sessionId,
                text,
            })
        }
    } catch (err) {
        log(type === "transcribe-window" ? "window failed" : "transcription failed")
        console.info("[STT]", err?.message || err)
        self.postMessage({
            type: type === "init" ? "init-error" : "error",
            requestId,
            sessionId: data.sessionId,
            startSample: data.startSample,
            endSample: data.endSample,
            live: type === "transcribe-window",
            message: err?.message || "Voice transcription failed.",
        })
    }
}
