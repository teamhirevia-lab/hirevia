export function buildProgress(reports = []) {
    const sorted = [...reports].sort(
        (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
    )

    const points = sorted.map((report) => ({
        id: report.id || report._id,
        title: report.title || "Untitled role",
        score: Math.round((Number(report.matchScore) || 0) * 100) / 100,
        date: report.createdAt,
    }))

    const scores = points.map((point) => point.score)
    const average = scores.length
        ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100
        : 0
    const latest = points.at(-1) || null
    const first = points[0] || null
    const delta = latest && first
        ? Math.round((latest.score - first.score) * 100) / 100
        : 0

    const gapMap = new Map()
    for (const report of reports) {
        for (const gap of report.skillGaps || []) {
            const skill = gap.skill || gap
            if (!skill) continue
            const current = gapMap.get(skill) || { skill, count: 0, severity: gap.severity || "medium" }
            current.count += 1
            if (severityRank(gap.severity) > severityRank(current.severity)) {
                current.severity = gap.severity
            }
            gapMap.set(skill, current)
        }
    }

    const targets = [...gapMap.values()]
        .sort((a, b) => b.count - a.count || severityRank(b.severity) - severityRank(a.severity))
        .slice(0, 6)

    return { points, average, latest, delta, targets, planCount: reports.length }
}

function severityRank(value) {
    if (value === "high") return 3
    if (value === "medium") return 2
    return 1
}

export function greetingFor(date = new Date()) {
    const hour = date.getHours()
    if (hour < 12) return "Good morning"
    if (hour < 17) return "Good afternoon"
    return "Good evening"
}
