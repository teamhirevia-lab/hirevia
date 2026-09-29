const {
    KNOWN_TECH_LEXICON,
    skillAppearsInText,
    canonicalTechName,
} = require("./technologyMatcher")
const { emptyStructured, researchCorpusText } = require("./researchBrief")

function normalizeCompanyKey(name) {
    return String(name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
}

function extractSkills(text, limit = 16) {
    const seen = new Set()
    const skills = []
    for (const tech of KNOWN_TECH_LEXICON) {
        const name = canonicalTechName(tech)
        if (!name || seen.has(name)) continue
        if (!skillAppearsInText(tech, text || "")) continue
        seen.add(name)
        skills.push(name)
        if (skills.length >= limit) break
    }
    return skills
}

function extractProjects(resume, selfDescription, limit = 5) {
    const blob = `${resume || ""}\n${selfDescription || ""}`
    const lines = blob.split(/\n/)
    const projects = []
    const seen = new Set()
    for (const raw of lines) {
        const line = raw.replace(/^[\s•\-*\d.)]+/, "").replace(/\s+/g, " ").trim()
        if (line.length < 24 || line.length > 200) continue
        const key = line.toLowerCase()
        if (seen.has(key)) continue
        const looksLikeWork = /project|built|developed|implemented|designed|led |owned |created |launched /i.test(line)
        if (!looksLikeWork && projects.length >= 3) continue
        seen.add(key)
        projects.push(line.slice(0, 160))
        if (projects.length >= limit) break
    }
    return projects
}

function clip(value, maxChars) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxChars)
}

function buildCompactContext({
    role,
    experience,
    resume,
    selfDescription,
    jobDescription,
    companyResearch,
}) {
    const resumeText = `${resume || ""} ${selfDescription || ""}`
    const structured = companyResearch?.structured || emptyStructured()
    const companyFocus = [
        ...(structured.technicalFocus || []),
        ...(structured.questionPatterns || []),
        ...(structured.companyTechnologies || []),
        ...(structured.hiringSignals || []),
    ].filter(Boolean).slice(0, 10)

    return {
        role: String(role || "").trim(),
        experience: String(experience || "").trim(),
        skills: extractSkills(resumeText),
        projects: extractProjects(resume, selfDescription),
        jdSkills: extractSkills(jobDescription || ""),
        companyFocus,
        systemDesign: Boolean(structured.systemDesign),
        interviewRounds: (structured.interviewRounds || []).slice(0, 8),
    }
}

function compactContextJson(context) {
    return JSON.stringify(context || {})
}

function groundingCorpus({
    resume,
    selfDescription,
    jobDescription,
    company,
    jobProfile,
    companyResearch,
}) {
    const researchText = researchCorpusText(companyResearch?.structured)
    return [
        clip(resume, 4000),
        clip(selfDescription, 1200),
        clip(jobDescription, 4000),
        researchText,
        company || "",
        jobProfile || "",
    ].join(" ")
}

module.exports = {
    normalizeCompanyKey,
    extractSkills,
    extractProjects,
    buildCompactContext,
    compactContextJson,
    groundingCorpus,
}
