function renderInline(text) {
    const nodes = []
    const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g
    let cursor = 0
    let match
    let key = 0

    while ((match = pattern.exec(text))) {
        if (match.index > cursor) {
            nodes.push(text.slice(cursor, match.index))
        }
        if (match[1] != null) {
            nodes.push(<strong key={`b-${key++}`}>{match[1]}</strong>)
        } else {
            nodes.push(<code key={`c-${key++}`}>{match[2]}</code>)
        }
        cursor = match.index + match[0].length
    }

    if (cursor < text.length) {
        nodes.push(text.slice(cursor))
    }

    return nodes
}

function parseNumberedItems(text) {
    if ((text.match(/\d+\.\s+/g) || []).length < 2) return null

    const parts = text.split(/(?=\d+\.\s+)/)
    const first = parts[0]?.trim() || ""
    const hasIntro = first && !/^\d+\.\s+/.test(first)
    const items = (hasIntro ? parts.slice(1) : parts)
        .map((part) => part.replace(/^\d+\.\s+/, "").trim())
        .filter(Boolean)

    if (items.length < 2) return null
    return { intro: hasIntro ? first : "", items }
}

function parseBullets(text) {
    const lines = text.split(/\n+/)
    const bulletLines = lines.filter((line) => /^\s*[-*]\s+/.test(line))
    if (bulletLines.length < 2) return null

    const intro = lines.filter((line) => !/^\s*[-*]\s+/.test(line)).join(" ").trim()
    const items = bulletLines.map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    return { intro, items }
}

function AnswerItem({ text }) {
    const labeled = text.match(/^\*\*(.+?)\*\*:?\s*([\s\S]*)/)
    if (labeled) {
        const label = labeled[1].replace(/:$/, "")
        const body = labeled[2].trim()
        return (
            <>
                <strong className="formatted-answer__label">{label}</strong>
                {body ? <span>{renderInline(body)}</span> : null}
            </>
        )
    }

    return renderInline(text)
}

const FormattedAnswer = ({ text }) => {
    if (!text) return null

    const numbered = parseNumberedItems(text)
    if (numbered) {
        return (
            <div className="formatted-answer">
                {numbered.intro ? <p>{renderInline(numbered.intro)}</p> : null}
                <ol>
                    {numbered.items.map((item, index) => (
                        <li key={index}>
                            <AnswerItem text={item} />
                        </li>
                    ))}
                </ol>
            </div>
        )
    }

    const bullets = parseBullets(text)
    if (bullets) {
        return (
            <div className="formatted-answer">
                {bullets.intro ? <p>{renderInline(bullets.intro)}</p> : null}
                <ul>
                    {bullets.items.map((item, index) => (
                        <li key={index}>{renderInline(item)}</li>
                    ))}
                </ul>
            </div>
        )
    }

    return (
        <div className="formatted-answer">
            {text.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index}>{renderInline(paragraph.trim())}</p>
            ))}
        </div>
    )
}

export default FormattedAnswer
