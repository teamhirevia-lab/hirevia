const ProgressChart = ({ points = [] }) => {
    const width = 640
    const height = 220
    const pad = { top: 18, right: 16, bottom: 28, left: 36 }
    const innerW = width - pad.left - pad.right
    const innerH = height - pad.top - pad.bottom

    if (points.length === 0) {
        return (
            <div className="progress-chart progress-chart--empty">
                <p>Generate a plan to plot match scores over time.</p>
            </div>
        )
    }

    const values = points.map((point) => point.score)
    const min = 0
    const max = 100
    const x = (index) => pad.left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW)
    const y = (value) => pad.top + innerH - ((value - min) / (max - min)) * innerH

    const line = points
        .map((point, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(point.score)}`)
        .join(" ")

    const area = `${line} L ${x(points.length - 1)} ${pad.top + innerH} L ${x(0)} ${pad.top + innerH} Z`

    return (
        <svg className="progress-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Match score over plans">
            {[0, 50, 100].map((tick) => (
                <g key={tick}>
                    <line
                        x1={pad.left}
                        x2={width - pad.right}
                        y1={y(tick)}
                        y2={y(tick)}
                        className="progress-chart__grid"
                    />
                    <text x={8} y={y(tick) + 4} className="progress-chart__tick">{tick}</text>
                </g>
            ))}
            <path d={area} className="progress-chart__area" />
            <path d={line} className="progress-chart__line" />
            {points.map((point, index) => (
                <circle
                    key={point.id || index}
                    cx={x(index)}
                    cy={y(point.score)}
                    r="4.5"
                    className="progress-chart__dot"
                >
                    <title>{`${point.title}: ${Number(point.score).toFixed(2)}%`}</title>
                </circle>
            ))}
            {points.length > 1 && points.map((point, index) => (
                <text
                    key={`label-${point.id || index}`}
                    x={x(index)}
                    y={height - 8}
                    textAnchor="middle"
                    className="progress-chart__label"
                >
                    {new Date(point.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </text>
            ))}
        </svg>
    )
}

export default ProgressChart
