function countFollowUps(questions) {
    const lists = [questions?.technical || [], questions?.behavioral || []]
    return lists.flat().filter((item) => item?.isFollowUp).length
}

function shouldCallFollowUpModel({ userAnswer, expectedAnswer, followUpCount }) {
    if (followUpCount >= 2) return false

    const words = String(userAnswer || "").trim().split(/\s+/).filter(Boolean)
    if (words.length < 25) return false

    const expected = String(expectedAnswer || "").toLowerCase()
    if (!expected) return true

    const keywords = expected.split(/[^a-z0-9.+#]+/).filter((word) => word.length > 3)
    if (keywords.length < 4) return true

    const answer = String(userAnswer || "").toLowerCase()
    const hits = keywords.filter((word) => answer.includes(word)).length
    return hits / keywords.length < 0.5
}

module.exports = {
    countFollowUps,
    shouldCallFollowUpModel,
}
