export const WINDOW_SECONDS = 10
export const STEP_SECONDS = 5
export const MIN_TAIL_SECONDS = 0.4

export function normalizeTranscript(text) {
    return String(text || "").replace(/\s+/g, " ").trim()
}

export function mergeOverlap(existing, incoming) {
    const left = normalizeTranscript(existing)
    const right = normalizeTranscript(incoming)
    if (!right) return left
    if (!left) return right

    const leftWords = left.split(" ")
    const rightWords = right.split(" ")
    const max = Math.min(leftWords.length, rightWords.length)
    let overlap = 0

    for (let size = max; size >= 2; size -= 1) {
        let match = true
        for (let i = 0; i < size; i += 1) {
            const suffix = leftWords[leftWords.length - size + i]
            if (suffix.toLowerCase() !== rightWords[i].toLowerCase()) {
                match = false
                break
            }
        }
        if (match) {
            overlap = size
            break
        }
    }

    if (!overlap) return `${left} ${right}`
    const rest = rightWords.slice(overlap).join(" ")
    return rest ? `${left} ${rest}` : left
}

export function createScheduler(sampleRate = 16_000) {
    return {
        windowSamples: Math.round(WINDOW_SECONDS * sampleRate),
        stepSamples: Math.round(STEP_SECONDS * sampleRate),
        minTailSamples: Math.round(MIN_TAIL_SECONDS * sampleRate),
        nextStart: 0,
        processedUntil: 0,
        inflight: null,
        queued: null,
        accepting: true,
        holdForTail: false,
    }
}

export function noteBuffer(scheduler, bufferLength) {
    if (!scheduler.accepting || scheduler.holdForTail) return null
    if (scheduler.inflight && scheduler.queued) return null

    const startSample = scheduler.nextStart
    if (bufferLength < startSample + scheduler.windowSamples) return null

    const job = {
        startSample,
        endSample: startSample + scheduler.windowSamples,
        attempt: 0,
        tail: false,
    }
    scheduler.nextStart = startSample + scheduler.stepSamples

    if (scheduler.inflight) {
        scheduler.queued = job
        return null
    }

    scheduler.inflight = job
    return job
}

export function markSent(scheduler, requestId, sessionId) {
    if (!scheduler.inflight) return null
    scheduler.inflight = { ...scheduler.inflight, requestId, sessionId }
    return scheduler.inflight
}

function takeQueued(scheduler) {
    if (!scheduler.queued) return null
    const job = scheduler.queued
    scheduler.queued = null
    scheduler.inflight = job
    return job
}

export function settleSuccess(scheduler, { sessionId, requestId, currentSessionId, endSample }) {
    const inflight = scheduler.inflight
    if (!inflight) return { applied: false }
    if (sessionId !== currentSessionId || requestId !== inflight.requestId) {
        return { applied: false }
    }

    scheduler.processedUntil = endSample
    scheduler.inflight = null
    const send = takeQueued(scheduler)
    return { applied: true, send, tail: !send && !scheduler.accepting }
}

export function settleFailure(scheduler, { sessionId, requestId, currentSessionId }) {
    const inflight = scheduler.inflight
    if (!inflight) return { applied: false }
    if (sessionId !== currentSessionId || requestId !== inflight.requestId) {
        return { applied: false }
    }

    if ((inflight.attempt || 0) < 1) {
        scheduler.inflight = { ...inflight, attempt: 1 }
        return { applied: true, retry: scheduler.inflight, send: null, tail: false }
    }

    const wasTail = Boolean(inflight.tail)
    scheduler.inflight = null
    scheduler.queued = null
    scheduler.holdForTail = true
    return { applied: true, retry: null, send: null, tail: false, hold: true, wasTail }
}

export function stopAccepting(scheduler) {
    scheduler.accepting = false
}

export function planTail(scheduler, bufferLength) {
    if (scheduler.inflight) return { wait: true, send: null, empty: false }

    const startSample = Math.max(0, scheduler.processedUntil)
    const endSample = Math.max(startSample, bufferLength)
    if (endSample - startSample < scheduler.minTailSamples) {
        return { wait: false, send: null, empty: true }
    }

    const job = { startSample, endSample, attempt: 0, tail: true }
    scheduler.inflight = job
    return { wait: false, send: job, empty: false }
}
