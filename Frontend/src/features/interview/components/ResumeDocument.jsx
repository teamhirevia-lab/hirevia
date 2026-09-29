const SECTION_HEADINGS = new Set([
    "summary",
    "professional summary",
    "profile",
    "objective",
    "experience",
    "work experience",
    "professional experience",
    "employment",
    "education",
    "academic",
    "skills",
    "technical skills",
    "core skills",
    "projects",
    "selected projects",
    "certifications",
    "certificates",
    "awards",
    "achievements",
    "languages",
    "interests",
    "activities",
    "publications",
    "volunteer",
    "volunteering",
])

function normalizeHeading(line) {
    return line.replace(/[:.\s]+$/g, "").toLowerCase()
}

function isHeading(line) {
    const normalized = normalizeHeading(line)
    if (SECTION_HEADINGS.has(normalized)) return true
    const letters = line.replace(/[^A-Za-z]/g, "")
    return (
        line.length >= 3
        && line.length <= 42
        && letters.length >= 3
        && line === line.toUpperCase()
        && /[A-Z]/.test(line)
        && !line.includes("@")
        && !/\d/.test(line)
    )
}

function isJunkLine(line) {
    return (
        /^[^A-Za-z0-9@+]{1,3}$/.test(line)
        || /^[A-Z]$/.test(line)
    )
}

function isBullet(line) {
    return /^\s*([-*•])(\s+|$)/.test(line) || /^\s*\d+[.)]\s+/.test(line)
}

function bulletText(line) {
    return line.replace(/^\s*([-*•]|\d+[.)])\s*/, "").trim()
}

function parseResume(text) {
    const lines = String(text || "")
        .split(/\r?\n/)
        .map((line) => line.trim())

    const firstHeading = lines.findIndex((line) => line && isHeading(line))
    const headerLines = (firstHeading === -1 ? lines : lines.slice(0, firstHeading))
        .filter(Boolean)
    const bodyLines = firstHeading === -1 ? [] : lines.slice(firstHeading)

    const name = headerLines[0] || ""
    const restHeader = headerLines.slice(1).filter((line) => !isJunkLine(line))

    const sections = []
    let current = null
    let pendingBullet = false

    const pushSection = () => {
        if (current) sections.push(current)
    }

    for (const line of bodyLines) {
        if (!line) {
            if (current && !pendingBullet) current.items.push({ type: "break" })
            continue
        }
        if (isHeading(line)) {
            pendingBullet = false
            pushSection()
            current = { title: line.replace(/[:.\s]+$/g, ""), items: [] }
            continue
        }
        if (!current) {
            current = { title: "", items: [] }
        }
        if (isJunkLine(line)) continue
        if (/^\s*[-*•]\s*$/.test(line)) {
            pendingBullet = true
            continue
        }
        if (pendingBullet || isBullet(line)) {
            current.items.push({
                type: "bullet",
                text: pendingBullet ? line : bulletText(line),
            })
            pendingBullet = false
        } else {
            current.items.push({ type: "line", text: line })
        }
    }
    pushSection()

    return { name, header: restHeader, sections }
}

const ResumeDocument = ({ text, role = "" }) => {
    if (!text?.trim()) {
        return <p className="resume-document__empty">No resume saved for this plan.</p>
    }

    const parsed = parseResume(text)

    return (
        <div className="resume-document">
            <div className="resume-sheet resume-sheet--classic">
                {parsed.name && <h1>{parsed.name}</h1>}
                {role && <p className="resume-sheet__title">{role}</p>}
                {parsed.header.length > 0 && (
                    <p className="resume-sheet__contact">{parsed.header.join(" | ")}</p>
                )}
                {parsed.sections.length === 0 ? (
                    <p>{text}</p>
                ) : (
                    parsed.sections.map((section, sectionIndex) => {
                        const bullets = []
                        const blocks = []
                        const flushBullets = () => {
                            if (bullets.length === 0) return
                            blocks.push(
                                <ul key={`ul-${sectionIndex}-${blocks.length}`}>
                                    {bullets.splice(0).map((item, index) => (
                                        <li key={index}>{item}</li>
                                    ))}
                                </ul>
                            )
                        }

                        section.items.forEach((item, index) => {
                            if (item.type === "bullet") {
                                bullets.push(item.text)
                                return
                            }
                            flushBullets()
                            if (item.type === "line") {
                                blocks.push(<p key={`${sectionIndex}-${index}`}>{item.text}</p>)
                            }
                        })
                        flushBullets()

                        return (
                            <section key={`${section.title}-${sectionIndex}`}>
                                {section.title ? <h2>{section.title}</h2> : null}
                                {blocks}
                            </section>
                        )
                    })
                )}
            </div>
        </div>
    )
}

export default ResumeDocument
