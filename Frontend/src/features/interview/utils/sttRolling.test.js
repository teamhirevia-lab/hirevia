import test from "node:test"
import assert from "node:assert/strict"
import {
    createScheduler,
    markSent,
    mergeOverlap,
    noteBuffer,
    planTail,
    settleFailure,
    settleSuccess,
    stopAccepting,
} from "./sttRolling.js"

test("overlap merge keeps one copy of the shared words", () => {
    const merged = mergeOverlap(
        "I worked on a React project where",
        "React project where I implemented authentication",
    )
    assert.equal(merged, "I worked on a React project where I implemented authentication")
    assert.equal(merged.includes("React React"), false)
    assert.equal(merged.includes("project project"), false)
})

test("no reliable overlap appends and keeps the existing words", () => {
    const merged = mergeOverlap(
        "I worked on a React project",
        "The database was Postgres",
    )
    assert.equal(merged, "I worked on a React project The database was Postgres")
})

test("a single shared word is not enough to delete existing speech", () => {
    const merged = mergeOverlap("I worked on React", "React")
    assert.equal(merged, "I worked on React React")
})

test("empty incoming text leaves the transcript untouched", () => {
    assert.equal(mergeOverlap("I worked on a React project", "   "), "I worked on a React project")
})

test("windows are 0-10s then 5-15s and the same span is not sent twice", () => {
    const scheduler = createScheduler(16_000)
    const fullMinute = 30 * 16_000

    const first = noteBuffer(scheduler, fullMinute)
    assert.deepEqual(
        [first.startSample, first.endSample],
        [0, 10 * 16_000],
    )

    assert.equal(noteBuffer(scheduler, fullMinute), null)
    assert.equal(scheduler.queued.startSample, 5 * 16_000)
    assert.equal(scheduler.queued.endSample, 15 * 16_000)
    assert.equal(noteBuffer(scheduler, fullMinute), null)
    assert.equal(scheduler.queued.startSample, 5 * 16_000)

    markSent(scheduler, 1, 4)
    const settled = settleSuccess(scheduler, {
        sessionId: 4,
        requestId: 1,
        currentSessionId: 4,
        endSample: 10 * 16_000,
    })
    assert.equal(scheduler.processedUntil, 10 * 16_000)
    assert.deepEqual(
        [settled.send.startSample, settled.send.endSample],
        [5 * 16_000, 15 * 16_000],
    )
})

test("stop tail is only the unprocessed end", () => {
    const scheduler = createScheduler(16_000)
    const first = noteBuffer(scheduler, 12 * 16_000)
    markSent(scheduler, 1, 4)
    settleSuccess(scheduler, {
        sessionId: 4,
        requestId: 1,
        currentSessionId: 4,
        endSample: first.endSample,
    })
    stopAccepting(scheduler)
    const tail = planTail(scheduler, 12 * 16_000)
    assert.deepEqual(
        [tail.send.startSample, tail.send.endSample],
        [10 * 16_000, 12 * 16_000],
    )
})

test("a near-empty tail finalizes without another window", () => {
    const scheduler = createScheduler(16_000)
    scheduler.processedUntil = 10 * 16_000
    stopAccepting(scheduler)
    const tail = planTail(scheduler, 10 * 16_000 + 1000)
    assert.equal(tail.empty, true)
    assert.equal(tail.send, null)
})

test("a stale sessionId is ignored", () => {
    const scheduler = createScheduler(16_000)
    noteBuffer(scheduler, 10 * 16_000)
    markSent(scheduler, 1, 4)
    const stale = settleSuccess(scheduler, {
        sessionId: 4,
        requestId: 1,
        currentSessionId: 9,
        endSample: 10 * 16_000,
    })
    assert.equal(stale.applied, false)
    assert.equal(scheduler.processedUntil, 0)
    assert.equal(scheduler.inflight.startSample, 0)
})

test("a failed window is retried once and then left for the stop tail", () => {
    const scheduler = createScheduler(16_000)
    noteBuffer(scheduler, 20 * 16_000)
    markSent(scheduler, 1, 4)
    const retry = settleFailure(scheduler, {
        sessionId: 4,
        requestId: 1,
        currentSessionId: 4,
    })
    assert.equal(retry.retry.attempt, 1)
    assert.equal(scheduler.processedUntil, 0)
    assert.equal(scheduler.queued, null)

    markSent(scheduler, 2, 4)
    const failed = settleFailure(scheduler, {
        sessionId: 4,
        requestId: 2,
        currentSessionId: 4,
    })
    assert.equal(failed.retry, null)
    assert.equal(scheduler.processedUntil, 0)
    assert.equal(scheduler.holdForTail, true)
    assert.equal(noteBuffer(scheduler, 20 * 16_000), null)

    stopAccepting(scheduler)
    const tail = planTail(scheduler, 20 * 16_000)
    assert.deepEqual(
        [tail.send.startSample, tail.send.endSample],
        [0, 20 * 16_000],
    )
})
