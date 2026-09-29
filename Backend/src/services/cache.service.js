const { redis } = require("../config/redis")

const DAY_SECONDS = 24 * 60 * 60

const keys = {
    blacklist: (token) => `blacklist:${token}`,
    mock: (id) => `mock:${id}`,
    interview: (id) => `interview:${id}`,
    quota: (userId) => `quota:${userId}`,
    resumeHtml: (reportId, template) => `resumehtml:${reportId}:${template}`,
    scoreLock: (mockId) => `scorelock:${mockId}`,
}

async function blacklistToken(token, ttlSeconds = DAY_SECONDS) {
    if (!token) return
    await redis.set(keys.blacklist(token), "1", "EX", ttlSeconds)
}

async function isTokenBlacklisted(token) {
    if (!token) return false
    const value = await redis.get(keys.blacklist(token))
    return Boolean(value)
}

async function cacheMock(mock) {
    if (!mock?.id) return
    await redis.set(keys.mock(mock.id), JSON.stringify(mock), "EX", DAY_SECONDS)
}

async function getCachedMock(id) {
    const raw = await redis.get(keys.mock(id))
    return raw ? JSON.parse(raw) : null
}

async function invalidateMock(id) {
    if (!id) return
    await redis.del(keys.mock(id))
}

async function cacheInterview(report) {
    if (!report?.id) return
    await redis.set(keys.interview(report.id), JSON.stringify(report), "EX", DAY_SECONDS)
}

async function getCachedInterview(id) {
    const raw = await redis.get(keys.interview(id))
    return raw ? JSON.parse(raw) : null
}

async function invalidateInterview(id) {
    if (!id) return
    await redis.del(keys.interview(id))
}

async function cacheQuota(userId, quota) {
    if (!userId || !quota) return
    await redis.set(keys.quota(userId), JSON.stringify(quota), "EX", 45)
}

async function getCachedQuota(userId) {
    if (!userId) return null
    const raw = await redis.get(keys.quota(userId))
    return raw ? JSON.parse(raw) : null
}

async function invalidateQuota(userId) {
    if (!userId) return
    await redis.del(keys.quota(userId))
}

async function invalidateAllQuotas() {
    const found = await redis.keys("quota:*")
    if (found.length) await redis.del(...found)
}

async function getCachedResumeHtml(reportId, template) {
    const raw = await redis.get(keys.resumeHtml(reportId, template))
    return raw || null
}

async function cacheResumeHtml(reportId, template, html) {
    if (!reportId || !html) return
    await redis.set(keys.resumeHtml(reportId, template), html, "EX", DAY_SECONDS)
}

async function acquireScoreLock(mockId) {
    if (!mockId) return false
    const ok = await redis.set(keys.scoreLock(mockId), "1", "EX", 120, "NX")
    return ok === "OK"
}

async function releaseScoreLock(mockId) {
    if (!mockId) return
    await redis.del(keys.scoreLock(mockId))
}

module.exports = {
    blacklistToken,
    isTokenBlacklisted,
    cacheMock,
    getCachedMock,
    invalidateMock,
    cacheInterview,
    getCachedInterview,
    invalidateInterview,
    cacheQuota,
    getCachedQuota,
    invalidateQuota,
    invalidateAllQuotas,
    getCachedResumeHtml,
    cacheResumeHtml,
    acquireScoreLock,
    releaseScoreLock,
}
