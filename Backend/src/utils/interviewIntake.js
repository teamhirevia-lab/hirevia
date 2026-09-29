const INTERVIEW_WINDOWS = {
    dont_know: { id: "dont_know", label: "Don't know", days: 24, grouped: true },
    within_3_days: { id: "within_3_days", label: "Within 3 days", days: 3, grouped: false },
    this_week: { id: "this_week", label: "This week", days: 7, grouped: false },
    next_week: { id: "next_week", label: "Next week", days: 10, grouped: false },
    in_2_weeks: { id: "in_2_weeks", label: "In 2 weeks", days: 14, grouped: false },
    in_3_weeks: { id: "in_3_weeks", label: "In 3 weeks", days: 21, grouped: false },
    in_1_month: { id: "in_1_month", label: "In about a month", days: 28, grouped: false },
    later: { id: "later", label: "Later than a month", days: 24, grouped: true },
}

function resolveInterviewWindow(windowId) {
    return INTERVIEW_WINDOWS[windowId] || INTERVIEW_WINDOWS.dont_know
}

function roadmapDayCount(windowId) {
    return resolveInterviewWindow(windowId).days
}

function experienceBand(yearsOfExperience) {
    const years = Number(yearsOfExperience)
    if (!Number.isFinite(years) || years < 1) return "campus / intern / 0-1 years"
    if (years < 3) return "junior (1-2 years)"
    if (years < 6) return "mid-level (3-5 years)"
    return "senior (6+ years)"
}

function topicResourceLinks(topic, kind = "interview prep") {
    const label = String(topic || "").trim()
    if (!label) return []
    const query = encodeURIComponent(`${label} ${kind}`)
    return [
        {
            title: `Google: ${label}`,
            url: `https://www.google.com/search?q=${query}`,
            source: "google",
        },
        {
            title: `YouTube: ${label}`,
            url: `https://www.youtube.com/results?search_query=${query}`,
            source: "youtube",
        },
    ]
}

function skillResourceLinks(skill) {
    return topicResourceLinks(skill, "interview prep")
}

function isSafeResourceUrl(url) {
    try {
        const parsed = new URL(String(url || ""))
        return parsed.protocol === "https:" || parsed.protocol === "http:"
    } catch {
        return false
    }
}

function mergeResourceLists(existing, fallbacks) {
    const merged = []
    const seen = new Set()
    for (const item of [...(existing || []), ...(fallbacks || [])]) {
        if (!item?.url || !isSafeResourceUrl(item.url) || seen.has(item.url)) continue
        seen.add(item.url)
        merged.push({
            title: item.title || item.url,
            url: item.url,
            source: item.source || "web",
        })
    }
    return merged
}

function withSkillGapResources(gap) {
    return {
        ...gap,
        resources: mergeResourceLists(gap.resources, skillResourceLinks(gap.skill)),
    }
}

function withDayResources(day) {
    return {
        ...day,
        resources: mergeResourceLists(day.resources, topicResourceLinks(day.focus, "tutorial")),
    }
}

function pickItem(list, index, fallback) {
    if (!Array.isArray(list) || list.length === 0) return fallback
    return list[index % list.length]
}

function buildCoreRoadmap({
    targetDays,
    company,
    jobProfile,
    skillGaps,
    technicalQuestions,
    behavioralQuestions,
    compactContext,
}) {
    const daysWanted = Math.min(7, Math.max(1, Number(targetDays) || 7))
    const gaps = (skillGaps || []).map((gap) => gap.skill).filter(Boolean)
    const skills = gaps.length
        ? gaps
        : (compactContext?.jdSkills || compactContext?.skills || ["core role skills"])
    const techQs = (technicalQuestions || []).map((question) => question.question).filter(Boolean)
    const behaviorQs = (behavioralQuestions || []).map((question) => question.question).filter(Boolean)
    const projects = compactContext?.projects || []
    const companyName = company || "the company"
    const role = jobProfile || "this role"

    const templates = [
        {
            focus: "Technical fundamentals",
            details: `Cover the core tools for ${role} at ${companyName}. Close the most important gap first.`,
            outcome: "Explain the primary stack out loud without notes.",
            task: (i) => [
                `Study ${pickItem(skills, i, "the core stack")} from first principles`,
                techQs[0] ? `Outline an answer to: ${String(techQs[0]).slice(0, 140)}` : `Write a 8–10 sentence fundamentals answer`,
                `Note one mistake you would correct tomorrow`,
            ],
        },
        {
            focus: "Role-specific concepts",
            details: `Practice what this ${role} actually does day to day, using JD skills rather than generic trivia.`,
            outcome: "Map two JD requirements to how you have used them.",
            task: (i) => [
                `Drill ${pickItem(skills, i + 1, "a JD skill")} in a role-specific scenario`,
                techQs[1] ? `Answer: ${String(techQs[1]).slice(0, 140)}` : `Walk through a typical workflow for this role`,
                `List what you would ask the interviewer to clarify`,
            ],
        },
        {
            focus: "Project and resume questions",
            details: `Turn resume work into interview stories. Interviewers will probe depth on what you listed.`,
            outcome: "Tell one project story with tradeoffs and your role.",
            task: (i) => [
                projects[0] ? `Prep a 90-second story for: ${String(projects[0]).slice(0, 120)}` : "Pick one resume project and write STAR beats",
                techQs[2] ? `Tie that project to: ${String(techQs[2]).slice(0, 140)}` : "Write what you would do differently next time",
                `Name one metric or outcome from that work`,
            ],
        },
        {
            focus: "Advanced technical topics",
            details: `Go one level deeper on gaps and company-typical rounds so you are not stuck on follow-ups.`,
            outcome: "Handle a follow-up on the hardest gap skill.",
            task: (i) => [
                `Deepen ${pickItem(skills, i + 2, "the hardest gap")}`,
                techQs[3] ? `Timed drill: ${String(techQs[3]).slice(0, 140)}` : "Solve two harder practice problems",
                `Write the first 30 seconds of your answer only`,
            ],
        },
        {
            focus: "Behavioral preparation",
            details: `HR and teamwork questions for ${companyName}. Keep STAR tight.`,
            outcome: "A spoken intro and one conflict or failure story.",
            task: (i) => [
                behaviorQs[0] ? `Answer out loud: ${String(behaviorQs[0]).slice(0, 140)}` : "Draft tell-me-about-yourself in 90 seconds",
                behaviorQs[1] ? `STAR for: ${String(behaviorQs[1]).slice(0, 140)}` : "Write why this company in 6 sentences",
                `Record or note the weakest beat and rewrite it`,
            ],
        },
        {
            focus: "Company-specific preparation",
            details: `Practice rounds this company actually uses for ${role}.`,
            outcome: "Name the likely rounds and one company-typical question.",
            task: (i) => [
                `Skim how ${companyName} interviews for ${role}`,
                techQs[4] ? `Company-style drill: ${String(techQs[4]).slice(0, 140)}` : `Prep one question unique to ${companyName}`,
                `Write why you want this ${role} in one paragraph`,
            ],
        },
        {
            focus: "Mock interview",
            details: `Full rehearsal. Time-box answers and recover from a weak one.`,
            outcome: "A complete mock pass you can repeat tomorrow.",
            task: (i) => [
                techQs[5] ? `Live answer: ${String(techQs[5]).slice(0, 140)}` : "Run a 20-minute technical mock",
                behaviorQs[2] ? `Live answer: ${String(behaviorQs[2]).slice(0, 140)}` : "Run a 10-minute behavioral mock",
                "Score yourself and list two fixes for tomorrow",
            ],
        },
    ]

    return templates.slice(0, daysWanted).map((template, index) => {
        const dayNumber = index + 1
        return withDayResources({
            day: dayNumber,
            week: 1,
            focus: template.focus,
            details: template.details,
            outcome: template.outcome,
            tasks: template.task(index),
            resources: [],
        })
    })
}

function expandRoadmap({
    coreDays,
    laterArc,
    targetDays,
    skillGaps,
    technicalQuestions,
    behavioralQuestions,
}) {
    const target = Math.max(1, Number(targetDays) || 7)
    const core = (coreDays || [])
        .slice(0, Math.min(7, target))
        .map((day, index) => {
            const dayNumber = Number(day.day) || index + 1
            return withDayResources({
                ...day,
                day: dayNumber,
                week: Number(day.week) || Math.ceil(dayNumber / 7),
                focus: day.focus || `Day ${dayNumber} prep`,
                details: day.details || "",
                outcome: day.outcome || "",
                tasks: Array.isArray(day.tasks) ? day.tasks : [],
            })
        })

    if (core.length >= target) return core.slice(0, target)

    const gaps = (skillGaps || []).map((gap) => gap.skill).filter(Boolean)
    const techQs = (technicalQuestions || []).map((q) => q.question).filter(Boolean)
    const behaviorQs = (behavioralQuestions || []).map((q) => q.question).filter(Boolean)
    const spiral = (laterArc?.spiralSkills || []).filter(Boolean)
    const skills = spiral.length ? spiral : (gaps.length ? gaps : ["core role skills"])
    const themes = laterArc?.weekThemes || []
    const rehearsal = laterArc?.rehearsalFocus || []

    const days = [...core]
    for (let dayNumber = days.length + 1; dayNumber <= target; dayNumber += 1) {
        const week = Math.ceil(dayNumber / 7)
        const theme = themes.find((item) => Number(item.week) === week)
            || themes[(week - 2 + themes.length) % Math.max(themes.length, 1)]
            || null
        const skill = skills[(dayNumber - 1) % skills.length]
        const techQ = techQs[(dayNumber - 1) % Math.max(techQs.length, 1)] || skill
        const behaviorQ = behaviorQs[(dayNumber - 1) % Math.max(behaviorQs.length, 1)] || "Tell me about yourself"
        const rehearsalItem = rehearsal[(dayNumber - 1) % Math.max(rehearsal.length, 1)] || skill
        const pattern = (dayNumber - 1) % 4
        const themeLabel = theme?.theme || `Week ${week} continuation`

        let focus
        let details
        let outcome
        let tasks

        if (pattern === 0) {
            focus = `${skill}: deepen and close the gap`
            details = `Continue the ${themeLabel.toLowerCase()} arc. Spend this day closing the "${skill}" gap with targeted practice, not generic review.`
            outcome = `Explain ${skill} out loud with a company-relevant example.`
            tasks = [
                `Study one focused explainer on ${skill}`,
                `Write a 8–10 sentence answer that uses ${skill} in this role`,
                techQ ? `Drill a variant of: ${String(techQ).slice(0, 140)}` : `Solve two practice problems for ${skill}`,
                `Note one mistake and how you would correct it tomorrow`,
            ]
        } else if (pattern === 1) {
            focus = `Timed drill: ${skill}`
            details = `Treat today as a rehearsal block for ${themeLabel.toLowerCase()}. Time-box answers so you build speed before the interview window closes.`
            outcome = `Complete a timed set without notes.`
            tasks = [
                `20-minute timed practice on ${skill}`,
                `Self-score against the model answer for ${rehearsalItem}`,
                `Redo the weakest step once`,
                `Log what you would say in the first 30 seconds`,
            ]
        } else if (pattern === 2) {
            focus = `Mock pass: ${rehearsalItem}`
            details = `Simulate a live round. Use a question from your plan and answer out loud, then tighten structure.`
            outcome = `A spoken answer you can repeat tomorrow.`
            tasks = [
                `Answer out loud: ${String(techQ || behaviorQ).slice(0, 140)}`,
                `Record or note STAR beats if this is behavioral`,
                `Compare to the expected answer and rewrite the weak paragraph`,
                `Prep one clarifying question you would ask the interviewer`,
            ]
        } else {
            focus = `Polish and recover: ${skill}`
            details = `Lighter load so the previous drills stick. Review only what you missed, then rest the voice and posture you will use on camera.`
            outcome = `A short checklist of remaining gaps for ${themeLabel}.`
            tasks = [
                `Revisit only the missed items for ${skill}`,
                `Speak a 90-second version of your intro or why-this-company`,
                `Update your gap list: keep, drop, or schedule one more drill`,
                `Sleep and a short walk count as part of this day`,
            ]
        }

        days.push(withDayResources({
            day: dayNumber,
            week,
            focus,
            details,
            outcome,
            tasks,
            resources: [],
        }))
    }

    return days
}

module.exports = {
    INTERVIEW_WINDOWS,
    resolveInterviewWindow,
    roadmapDayCount,
    experienceBand,
    skillResourceLinks,
    topicResourceLinks,
    withSkillGapResources,
    withDayResources,
    buildCoreRoadmap,
    expandRoadmap,
}
