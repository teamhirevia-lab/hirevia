const LIST_KEYS = [
    "interviewRounds",
    "questionPatterns",
    "technicalFocus",
    "behavioralFocus",
    "companyTechnologies",
    "hiringSignals",
    "sources",
]

function emptyStructured() {
    return {
        interviewRounds: [],
        questionPatterns: [],
        technicalFocus: [],
        behavioralFocus: [],
        systemDesign: false,
        companyTechnologies: [],
        hiringSignals: [],
        sources: [],
    }
}

function capList(value) {
    if (!Array.isArray(value)) return []
    return value
        .map((item) => String(item || "").replace(/\s+/g, " ").trim().slice(0, 160))
        .filter(Boolean)
        .slice(0, 8)
}

function parseTrailingJson(brief) {
    const text = String(brief || "")
    const end = text.lastIndexOf("}")
    const start = text.lastIndexOf("{", end)
    if (start === -1 || end <= start) return null
    try {
        const parsed = JSON.parse(text.slice(start, end + 1))
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
        return parsed
    } catch {
        return null
    }
}

function sectionBody(brief, label) {
    const match = String(brief || "").match(
        new RegExp(
            `${label}\\s*[\\u2014:\\-]\\s*([\\s\\S]*?)(?=\\n\\s*\\d+\\.\\s|\\n\\s*[A-Z][A-Z0-9_ ]{3,}\\s*[\\u2014:\\-]|$)`,
            "i"
        )
    )
    if (!match) return ""
    return match[1]
}

function sectionItems(brief, label) {
    return sectionBody(brief, label)
        .split(/\n|•/)
        .map((line) => line.replace(/^\s*[-*\d.)]+\s*/, "").trim())
        .filter((line) => line && !/^[{\[]/.test(line))
}

function structuredFromSections(brief) {
    const systemLine = sectionBody(brief, "INCLUDE_SYSTEM_DESIGN").trim()
    return {
        interviewRounds: capList([
            ...sectionItems(brief, "HIRING_PROCESS"),
            ...sectionItems(brief, "COMMON_ROUNDS"),
        ]),
        questionPatterns: capList(sectionItems(brief, "QUESTION_PATTERNS")),
        technicalFocus: capList(sectionItems(brief, "PREP_FOCUS")),
        behavioralFocus: [],
        systemDesign: /^\s*yes\b/i.test(systemLine),
        companyTechnologies: [],
        hiringSignals: capList(sectionItems(brief, "RECENT_CANDIDATE_NOTES")),
        sources: [],
    }
}

function structuredHasSignal(structured) {
    return Boolean(
        structured.systemDesign
        || LIST_KEYS.some((key) => key !== "sources" && structured[key]?.length)
    )
}

function fromParsed(parsed) {
    const structured = emptyStructured()
    for (const key of LIST_KEYS) {
        structured[key] = capList(parsed[key])
    }
    structured.systemDesign = Boolean(parsed.systemDesign)
    return structured
}

function compactResearch(brief, groundingSources) {
    const parsed = parseTrailingJson(brief)
    const fromJson = parsed ? fromParsed(parsed) : null
    const structured = fromJson && structuredHasSignal(fromJson)
        ? fromJson
        : structuredFromSections(brief)

    if ((!structured.sources || structured.sources.length === 0) && groundingSources?.length) {
        structured.sources = capList(groundingSources)
    }
    return structured
}

function researchCorpusText(structured) {
    const source = structured || emptyStructured()
    return [
        ...(source.companyTechnologies || []),
        ...(source.questionPatterns || []),
        ...(source.technicalFocus || []),
        source.systemDesign ? "system design hld" : "",
    ].filter(Boolean).join(" ")
}

function researchPromptBlock(structured) {
    return JSON.stringify(structured || emptyStructured())
}

module.exports = {
    emptyStructured,
    compactResearch,
    researchCorpusText,
    researchPromptBlock,
}
