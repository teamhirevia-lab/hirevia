import { env, pipeline } from "@huggingface/transformers"

env.allowLocalModels = false
env.useBrowserCache = true

let transcriber = null
let loadedModel = ""

function log(event) {
    console.info(`[STT] ${event}`)
}

async function ensurePipeline(model) {
    if (transcriber && loadedModel === model) return transcriber
    log("model loading")
    transcriber = await pipeline("automatic-speech-recognition", model, {
        progress_callback: (status) => {
            self.postMessage({ type: "progress", status })
        },
    })
    loadedModel = model
    log("model ready")
    return transcriber
}

self.onmessage = async (event) => {
    const data = event.data || {}
    const { type, requestId } = data

    try {
        if (type === "init") {
            await ensurePipeline(data.model)
            self.postMessage({ type: "ready", requestId, model: data.model })
            return
        }

        if (type === "transcribe") {
            log("transcription started")
            const asr = await ensurePipeline(data.model)
            const audio = data.audio instanceof Float32Array
                ? data.audio
                : new Float32Array(data.audio)
            const result = await asr(audio, {
                language: data.language || "english",
                task: "transcribe",
                return_timestamps: false,
                initial_prompt: data.prompt || undefined,
            })
            const text = typeof result === "string" ? result : (result?.text || "")
            log("transcription completed")
            self.postMessage({
                type: "transcription",
                requestId,
                text,
            })
            return
        }
    } catch (err) {
        log("transcription failed")
        self.postMessage({
            type: "error",
            requestId,
            message: err?.message || "Voice transcription failed.",
        })
    }
}
