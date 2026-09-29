const WHISPER_BASE = "Xenova/whisper-base.en"
const WHISPER_TINY = "Xenova/whisper-tiny.en"
export const LANGUAGE = "english"
export const SAMPLE_RATE = 16_000
export const MAX_RECORDING_MS = 4 * 60 * 1000

function isMobileUa(ua = "") {
    return /Mobi|Android|iPhone|iPad/i.test(ua)
}

export function selectWhisperModel() {
    const memory = Number(navigator.deviceMemory) || 8
    const cores = Number(navigator.hardwareConcurrency) || 4
    const mobile = isMobileUa(navigator.userAgent || "")
    if (mobile || memory <= 4 || cores <= 4) return WHISPER_TINY
    return WHISPER_BASE
}

export function buildInterviewVocabulary({ company, role, report, mockReport } = {}) {
    const seen = new Set()
    const terms = []

    const push = (value) => {
        const term = String(value || "").trim()
        if (!term || term.length > 48) return
        const key = term.toLowerCase()
        if (seen.has(key)) return
        seen.add(key)
        terms.push(term)
    }

    push(company)
    push(role)

    const collectFromQuestions = (list) => {
        for (const item of list || []) {
            for (const tech of item?.mentionedTechnologies || []) push(tech)
            for (const skill of item?.groundedSkills || []) push(skill)
        }
    }

    collectFromQuestions(report?.technicalQuestions)
    collectFromQuestions(report?.behavioralQuestions)
    collectFromQuestions(mockReport?.questions?.technical)
    collectFromQuestions(mockReport?.questions?.behavioral)

    for (const gap of report?.skillGaps || []) push(gap?.skill)

    return terms.slice(0, 24)
}

export function cleanupTranscript(text) {
    return String(text || "").replace(/\s+/g, " ").trim()
}

export function restoreVocabularyCasing(text, vocabulary) {
    let next = cleanupTranscript(text)
    for (const term of vocabulary || []) {
        const escaped = String(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        if (!escaped) continue
        next = next.replace(new RegExp(`\\b${escaped}\\b`, "gi"), term)
    }
    return next
}

export function pickRecorderMimeType() {
    if (typeof MediaRecorder === "undefined") return ""
    const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
    ]
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || ""
}

export const sttConfig = {
    WHISPER_BASE,
    WHISPER_TINY,
    LANGUAGE,
    SAMPLE_RATE,
    MAX_RECORDING_MS,
    selectWhisperModel,
}

export default sttConfig
