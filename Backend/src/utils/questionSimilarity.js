const STOPWORDS = new Set([
    "a", "an", "the", "how", "would", "you", "your", "for", "to", "of", "in", "on",
    "and", "or", "with", "about", "what", "why", "when", "where", "do", "does",
    "did", "is", "are", "was", "were", "be", "been", "being", "this", "that",
    "these", "those", "it", "its", "at", "from", "by", "as", "if", "can", "could",
    "should", "tell", "me", "please", "describe", "explain", "walk", "through",
    "an", "into", "over", "our", "we", "i",
])

const PARAPHRASE = {
    build: "design",
    architect: "design",
}

function contentTokens(text) {
    let normalized = String(text || "").toLowerCase()
    normalized = normalized.replace(/[^a-z0-9.+#\s]/g, " ")
    normalized = normalized.replace(/\s+/g, " ").trim()
    normalized = normalized.replace(/\be commerce\b/g, "ecommerce")
    normalized = normalized.replace(/\bonline shopping\b/g, "ecommerce")

    const tokens = []
    for (let token of normalized.split(" ")) {
        if (!token || STOPWORDS.has(token)) continue
        if (token.endsWith("s") && token.length > 3 && !token.endsWith("ss")) {
            token = token.slice(0, -1)
        }
        if (PARAPHRASE[token]) token = PARAPHRASE[token]
        if (!token || STOPWORDS.has(token)) continue
        tokens.push(token)
    }
    return tokens
}

function normalizeQuestionKey(text) {
    return contentTokens(text).join(" ")
}

function questionsAreSimilar(leftText, rightText) {
    const left = contentTokens(leftText)
    const right = contentTokens(rightText)
    if (!left.length || !right.length) return false

    const leftSet = new Set(left)
    const rightSet = new Set(right)
    let intersection = 0
    for (const token of leftSet) {
        if (rightSet.has(token)) intersection += 1
    }
    const union = leftSet.size + rightSet.size - intersection
    if (union && intersection / union >= 0.55) return true

    const shorter = Math.min(leftSet.size, rightSet.size)
    if (shorter >= 4 && intersection / shorter >= 0.7) return true
    return false
}

module.exports = {
    contentTokens,
    normalizeQuestionKey,
    questionsAreSimilar,
}
