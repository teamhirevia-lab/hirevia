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
    expandRoadmap,
}
