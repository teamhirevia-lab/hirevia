const test = require("node:test")
const assert = require("node:assert/strict")
const { quotaWindow } = require("./quota.service")

test("quota renews one month after the account was created", () => {
    const anchor = new Date("2026-09-15T08:30:00.000Z")
    const during = quotaWindow(anchor, new Date("2026-09-29T12:00:00.000Z"))
    assert.equal(during.period, "2026-09-15")
    assert.equal(during.end.toISOString(), "2026-10-15T08:30:00.000Z")

    const next = quotaWindow(anchor, new Date("2026-10-15T08:30:00.000Z"))
    assert.equal(next.period, "2026-10-15")
    assert.equal(next.end.toISOString(), "2026-11-15T08:30:00.000Z")
})

test("accounts created on different days do not share the first of the month", () => {
    const now = new Date("2026-09-30T04:00:00.000Z")
    const early = quotaWindow(new Date("2026-09-02T00:00:00.000Z"), now)
    const late = quotaWindow(new Date("2026-09-28T18:00:00.000Z"), now)
    assert.equal(early.end.toISOString().slice(0, 10), "2026-10-02")
    assert.equal(late.end.toISOString().slice(0, 10), "2026-10-28")
})

test("a 31st signup clamps short months and returns to the 31st", () => {
    const anchor = new Date("2026-01-31T00:00:00.000Z")
    const february = quotaWindow(anchor, new Date("2026-02-20T00:00:00.000Z"))
    assert.equal(february.end.toISOString().slice(0, 10), "2026-02-28")
    const march = quotaWindow(anchor, new Date("2026-03-01T00:00:00.000Z"))
    assert.equal(march.period, "2026-02-28")
    assert.equal(march.end.toISOString().slice(0, 10), "2026-03-31")
})
