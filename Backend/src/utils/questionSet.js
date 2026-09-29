const { normalizeQuestionKey } = require("./questionSimilarity")

function prepareQuestionSet(questions, { min, max }) {
    const seen = new Set()
    const unique = []
    for (const question of questions || []) {
        const key = normalizeQuestionKey(question?.question || "")
        if (!key || seen.has(key)) continue
        seen.add(key)
        unique.push(question)
    }
    const trimmed = unique.slice(0, max)
    return {
        questions: trimmed,
        missing: Math.max(0, min - trimmed.length),
        count: trimmed.length,
    }
}

module.exports = {
    prepareQuestionSet,
}
