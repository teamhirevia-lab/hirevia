function wordCount(value) {
    return String(value || "").trim().split(/\s+/).filter(Boolean).length
}

function nonEmptyString(value, { minWords = 0, minChars = 1, maxChars = 4000 } = {}) {
    if (typeof value !== "string") return false
    const text = value.trim()
    if (!text || text.length < minChars || text.length > maxChars) return false
    if (minWords && wordCount(text) < minWords) return false
    return true
}

function stringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function isValidPlanQuestion(question) {
    if (!question || typeof question !== "object") return false
    return (
        nonEmptyString(question.question, { minWords: 3, minChars: 12, maxChars: 500 })
        && nonEmptyString(question.intention, { minChars: 8, maxChars: 500 })
        && nonEmptyString(question.answer, { minChars: 20, maxChars: 2500 })
        && nonEmptyString(question.sourceGrounding, { minChars: 3, maxChars: 300 })
        && stringArray(question.groundedSkills)
        && stringArray(question.mentionedTechnologies)
    )
}

function isValidMockQuestion(question) {
    if (!question || typeof question !== "object") return false
    return (
        nonEmptyString(question.question, { minWords: 3, minChars: 12, maxChars: 500 })
        && nonEmptyString(question.intention, { minChars: 8, maxChars: 500 })
        && nonEmptyString(question.expectedAnswer, { minChars: 20, maxChars: 2500 })
    )
}

module.exports = {
    isValidPlanQuestion,
    isValidMockQuestion,
}
