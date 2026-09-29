const test = require("node:test")
const assert = require("node:assert/strict")
const {
    skillAppearsInText,
    canonicalTechName,
    findUnverifiedForeignTech,
} = require("./technologyMatcher")
const { isValidPlanQuestion, isValidMockQuestion } = require("./questionValidator")
const { questionsAreSimilar } = require("./questionSimilarity")
const { prepareQuestionSet } = require("./questionSet")
const { compactResearch, researchCorpusText } = require("./researchBrief")

const planQuestion = {
    question: "How does Redis expiration work in this service?",
    intention: "Checks whether the candidate understands cache expiry.",
    answer: "Redis keys can expire with a TTL so stale session data is removed.",
    sourceGrounding: "Job Description - Required Skill: Redis",
    groundedSkills: ["Redis"],
    mentionedTechnologies: ["Redis"],
}

test("go about is not the Go language", () => {
    const sentence = "How would you go about debugging a production API?"
    assert.equal(skillAppearsInText("go", sentence), false)
    assert.equal(skillAppearsInText("golang", sentence), false)
    assert.equal(findUnverifiedForeignTech(sentence, ""), null)
})

test("golang and written-in-Go phrases match Go", () => {
    assert.equal(skillAppearsInText("golang", "The service is written in Golang"), true)
    assert.equal(skillAppearsInText("go", "This backend is written in Go"), true)
    assert.equal(skillAppearsInText("go", "Go programming uses goroutines"), true)
    assert.equal(canonicalTechName("golang"), "Go")
    assert.equal(canonicalTechName("postgres"), "PostgreSQL")
    assert.equal(canonicalTechName("postgresql"), "PostgreSQL")
    assert.equal(canonicalTechName("node.js"), "Node.js")
})

test("node, sql, and postgres matching stays precise", () => {
    assert.equal(skillAppearsInText("node.js", "a node in the tree"), false)
    assert.equal(skillAppearsInText("nodejs", "built with Node.js"), true)
    assert.equal(skillAppearsInText("sql", "mysql replication lag"), false)
    assert.equal(skillAppearsInText("sql", "optimize this SQL query"), true)
    assert.equal(skillAppearsInText("postgres", "we run PostgreSQL 16"), true)
    assert.equal(skillAppearsInText("c", "c programming exercises"), true)
    assert.equal(skillAppearsInText("c", "a c in the word"), false)
    assert.equal(findUnverifiedForeignTech("Explain Kafka retention", ""), "Kafka")
    assert.equal(findUnverifiedForeignTech("Explain Kafka retention", "Kafka is required"), null)
})

test("plan and mock question objects are validated", () => {
    assert.equal(isValidPlanQuestion(planQuestion), true)
    assert.equal(isValidPlanQuestion({ ...planQuestion, answer: "" }), false)
    assert.equal(isValidPlanQuestion({ ...planQuestion, groundedSkills: "Redis" }), false)
    assert.equal(isValidMockQuestion({
        question: "How would you explain a failed launch to a stakeholder?",
        intention: "Looks for ownership and a clear recovery story.",
        expectedAnswer: "I would state the impact, what I did next, and what changed after.",
    }), true)
    assert.equal(isValidMockQuestion({
        question: "Too short",
        intention: "Looks for ownership and a clear recovery story.",
        expectedAnswer: "I would state the impact, what I did next, and what changed after.",
    }), false)
})

test("question sets trim to the max and report the deficit", () => {
    const many = Array.from({ length: 16 }, (_, index) => ({
        question: `How would you practice skill number ${index} before the interview?`,
    }))
    const trimmed = prepareQuestionSet(many, { min: 8, max: 14 })
    assert.equal(trimmed.questions.length, 14)
    assert.equal(trimmed.missing, 0)

    const short = prepareQuestionSet(many.slice(0, 5), { min: 8, max: 14 })
    assert.equal(short.questions.length, 5)
    assert.equal(short.missing, 3)

    const duplicated = prepareQuestionSet([
        { question: "How would you design a REST API for payments?" },
        { question: "How would you design a REST API for payments?" },
    ], { min: 1, max: 10 })
    assert.equal(duplicated.questions.length, 1)
})

test("mock similarity catches paraphrases and keeps distinct questions", () => {
    assert.equal(questionsAreSimilar(
        "How would you design a REST API for an e-commerce platform?",
        "How would you build REST APIs for an online shopping application?"
    ), true)
    assert.equal(questionsAreSimilar(
        "How would you design a REST API?",
        "How would you design a caching strategy?"
    ), false)
})

test("research signals past the opening are kept", () => {
    const padding = "HIRING_PROCESS — recruiter screen. ".repeat(40)
    const brief = `${padding}
3. QUESTION_PATTERNS — system design for checkout, SQL window functions
4. INCLUDE_SYSTEM_DESIGN — yes, senior candidates get an HLD round
{
  "interviewRounds": ["recruiter", "onsite"],
  "questionPatterns": ["system design for checkout", "SQL window functions"],
  "technicalFocus": ["distributed checkout"],
  "behavioralFocus": ["conflict"],
  "systemDesign": true,
  "companyTechnologies": ["Kafka", "PostgreSQL"],
  "hiringSignals": ["recent loop includes HLD"],
  "sources": ["https://example.com/interview"]
}`
    const structured = compactResearch(brief, ["https://grounding.example"])
    assert.deepEqual(structured.questionPatterns, ["system design for checkout", "SQL window functions"])
    assert.equal(structured.systemDesign, true)
    assert.deepEqual(structured.companyTechnologies, ["Kafka", "PostgreSQL"])
    assert.match(researchCorpusText(structured), /Kafka/)
    assert.match(researchCorpusText(structured), /PostgreSQL/)

    const sectionsOnly = `
1. HIRING_PROCESS — phone screen, then onsite
2. COMMON_ROUNDS — coding and hiring manager
3. QUESTION_PATTERNS — API design and incident response
4. INCLUDE_SYSTEM_DESIGN — no for this analyst track
7. PREP_FOCUS — SQL and stakeholder stories
`
    const fromSections = compactResearch(sectionsOnly, [])
    assert.deepEqual(fromSections.questionPatterns, ["API design and incident response"])
    assert.equal(fromSections.systemDesign, false)
    assert.deepEqual(fromSections.technicalFocus, ["SQL and stakeholder stories"])
})
