const MOCK_RESUME = {
    name: "Jordan Hale",
    title: "Frontend Engineer",
    contact: "jordan.hale@email.com  ·  (555) 010-4472  ·  Austin, TX",
    summary:
        "Frontend engineer with 5 years building accessible product UIs in React and TypeScript. Comfortable owning design-system work, performance, and checkout flows.",
    experience: [
        {
            role: "Senior Frontend Engineer, Northline",
            dates: "2022 - Present",
            bullets: [
                "Led the checkout redesign that cut drop-off 18% while keeping WCAG 2.2 AA.",
                "Built a token-based component library used by four product teams.",
            ],
        },
        {
            role: "Frontend Engineer, Brightwell",
            dates: "2019 - 2022",
            bullets: [
                "Shipped analytics dashboards with virtualized tables and keyboard navigation.",
            ],
        },
    ],
    education: "B.S. Computer Science, University of Texas",
    skills: "React, TypeScript, accessibility, design systems, performance",
}

const ResumePreview = ({ templateId, onClose }) => {
    const template = templateId || "classic"

    return (
        <div className="resume-preview" role="dialog" aria-modal="true" aria-labelledby="resume-preview-title">
            <button
                type="button"
                className="resume-preview__backdrop"
                aria-label="Close preview"
                onClick={onClose}
            />
            <div className="resume-preview__panel">
                <header className="resume-preview__header">
                    <div>
                        <p className="resume-preview__kicker">Sample layout</p>
                        <h2 id="resume-preview-title">
                            {template === "modern" && "Modern"}
                            {template === "compact" && "Compact"}
                            {template === "executive" && "Executive"}
                            {template === "classic" && "Classic ATS"}
                        </h2>
                    </div>
                    <button type="button" className="button secondary-button" onClick={onClose}>
                        Close
                    </button>
                </header>
                <p className="resume-preview__note">Preview uses mock data so you can compare layouts. Your download uses your own facts.</p>
                <div className={`resume-sheet resume-sheet--${template}`}>
                    <h1>{MOCK_RESUME.name}</h1>
                    <p className="resume-sheet__title">{MOCK_RESUME.title}</p>
                    <p className="resume-sheet__contact">{MOCK_RESUME.contact}</p>
                    <h2>Summary</h2>
                    <p>{MOCK_RESUME.summary}</p>
                    <h2>Experience</h2>
                    {MOCK_RESUME.experience.map((job) => (
                        <div key={job.role} className="resume-sheet__job">
                            <p className="resume-sheet__role">{job.role}</p>
                            <p className="resume-sheet__dates">{job.dates}</p>
                            <ul>
                                {job.bullets.map((bullet) => (
                                    <li key={bullet}>{bullet}</li>
                                ))}
                            </ul>
                        </div>
                    ))}
                    <h2>Education</h2>
                    <p>{MOCK_RESUME.education}</p>
                    <h2>Skills</h2>
                    <p>{MOCK_RESUME.skills}</p>
                </div>
            </div>
        </div>
    )
}

export default ResumePreview
