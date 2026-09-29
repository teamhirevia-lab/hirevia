require("dotenv").config()
if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run verification scripts in production")
    process.exit(1)
}
const bcrypt = require("bcryptjs")
const { connectPostgres, pool } = require("../src/config/postgres")
const { connectRedis, redis } = require("../src/config/redis")
const userRepository = require("../src/repositories/user.repository")
const interviewReportRepository = require("../src/repositories/interviewReport.repository")
const mockInterviewRepository = require("../src/repositories/mockInterview.repository")
const { getCachedInterview, getCachedMock, blacklistToken, isTokenBlacklisted } = require("../src/services/cache.service")
const { logSafeError } = require("../src/utils/redact")

async function main() {
    await connectPostgres()
    await connectRedis()

    const stamp = Date.now()
    const username = `verify_${stamp}`
    const email = `verify_${stamp}@hirevia.test`
    const password = await bcrypt.hash("test-password", 8)

    const user = await userRepository.createUser({ username, email, password })
    if (!user?.id) throw new Error("user create failed")

    const found = await userRepository.findByEmail(email)
    if (!found || found.id !== user.id) throw new Error("user read failed")

    const report = await interviewReportRepository.createInterviewReport({
        userId: user.id,
        title: "Backend Engineer",
        jobDescription: "Build APIs with Postgres and Redis.",
        resume: "Built Node APIs.",
        selfDescription: "Backend focused.",
        matchScore: 82,
        technicalQuestions: [{ question: "How would you model this?", intention: "design", answer: "Use JSONB." }],
        behavioralQuestions: [{ question: "Tell me about ownership.", intention: "behavior", answer: "STAR." }],
        skillGaps: [{ skill: "Kafka", severity: "medium", justification: "JD asks for it." }],
        preparationPlan: [{ day: 1, focus: "SQL", tasks: ["Review joins"] }],
        validation: { qualityScore: 80, verdict: "Good Alignment", verdictExplanation: "Solid overlap." },
    })

    const fetchedReport = await interviewReportRepository.findByIdForUser(report.id, user.id)
    if (fetchedReport.title !== "Backend Engineer") throw new Error("interview read failed")
    if (!Array.isArray(fetchedReport.technicalQuestions)) throw new Error("JSONB questions missing")

    const cachedReport = await getCachedInterview(report.id)
    if (!cachedReport || cachedReport.id !== report.id) throw new Error("interview redis cache failed")

    const mock = await mockInterviewRepository.createMockInterview({
        userId: user.id,
        interviewReportId: report.id,
        questions: {
            technical: [{ id: "q1", question: "Fresh SQL question", expectedAnswer: "Indexes" }],
            behavioral: [{ id: "q2", question: "Fresh ownership question", expectedAnswer: "STAR" }],
        },
        currentSection: "technical",
    })

    const updated = await mockInterviewRepository.updateMockInterview(mock.id, user.id, report.id, {
        answers: [{ questionId: "q1", userAnswer: "Use a btree index.", videoMetrics: { eyeContact: 0.8 } }],
        currentQuestionIndex: 1,
        completedSections: ["technical"],
    })

    if (updated.answers.length !== 1) throw new Error("mock update failed")
    if (updated.currentQuestionIndex !== 1) throw new Error("mock progress failed")

    const cachedMock = await getCachedMock(mock.id)
    if (!cachedMock || cachedMock.answers.length !== 1) throw new Error("mock redis cache failed")

    await blacklistToken("verify-token")
    if (!(await isTokenBlacklisted("verify-token"))) throw new Error("redis blacklist failed")

    const deletedMock = await mockInterviewRepository.deleteByIdForUser(mock.id, user.id, report.id)
    const deletedReport = await interviewReportRepository.deleteByIdForUser(report.id, user.id)
    if (!deletedMock || !deletedReport) throw new Error("delete failed")

    const gone = await interviewReportRepository.findByIdForUser(report.id, user.id)
    if (gone) throw new Error("deleted report still readable")

    await pool.query("DELETE FROM users WHERE id = $1", [user.id])

    console.log("CRUD + Redis cache checks passed")
    await redis.quit()
    await pool.end()
}

main().catch(async (err) => {
    logSafeError("verify-crud failed:", err)
    try { await redis.quit() } catch {}
    try { await pool.end() } catch {}
    process.exit(1)
})
