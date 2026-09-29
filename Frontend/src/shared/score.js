export function parseMatchScore(value) {
    const number = Number(value)
    return Number.isFinite(number) ? number : 0
}

export function formatMatchScore(value) {
    return parseMatchScore(value).toFixed(2)
}

export function matchScoreTone(value) {
    const score = parseMatchScore(value)
    if (score >= 80) return "is-high"
    if (score >= 60) return "is-mid"
    return "is-low"
}
