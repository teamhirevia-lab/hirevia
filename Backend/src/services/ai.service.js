const { GoogleGenAI } = require("@google/genai")
const puppeteer = require("puppeteer")
const {
    roadmapDayCount,
    experienceBand,
    resolveInterviewWindow,
    withSkillGapResources,
    buildCoreRoadmap,
    expandRoadmap,
} = require("../utils/interviewIntake")
const { redactSecrets } = require("../utils/redact")
const { logGemini, logPuppeteer, logResources, classifyGeminiError } = require("../utils/observability")
const { getCachedResumeHtml, cacheResumeHtml } = require("./cache.service")
const companyResearchRepository = require("../repositories/companyResearch.repository")
const {
    KNOWN_TECH_LEXICON,
    skillAppearsInText,
    canonicalTechName,
    findUnverifiedForeignTech,
} = require("../utils/technologyMatcher")
const { isValidPlanQuestion, isValidMockQuestion } = require("../utils/questionValidator")
const { questionsAreSimilar } = require("../utils/questionSimilarity")
const { prepareQuestionSet } = require("../utils/questionSet")
const {
    emptyStructured,
    compactResearch,
    researchCorpusText,
    researchPromptBlock,
} = require("../utils/researchBrief")
const {
    buildCompactContext,
    compactContextJson,
    groundingCorpus,
} = require("../utils/compactContext")

const PLAN_TECH = { min: 8, max: 14 }
const PLAN_BEHAVIOR = { min: 6, max: 10 }
const MOCK_TECH = { min: 5, max: 5 }
const MOCK_BEHAVIOR = { min: 4, max: 4 }
const MAX_REPLACEMENT_ROUNDS = 2

const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY
})

const GEMINI_REPORT_MODELS = [
    "gemini-2.5-flash-lite",
    "gemini-3.5-flash-lite",
]
const GEMINI_RESEARCH_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
]
const GEMINI_FAST = GEMINI_REPORT_MODELS[0]
const GEMINI_MODELS = GEMINI_REPORT_MODELS

const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 45_000

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function tokenUsage(response) {
    const meta = response?.usageMetadata || response?.usage_metadata || {}
    return {
        inputTokens: meta.promptTokenCount ?? meta.prompt_token_count ?? null,
        outputTokens: meta.candidatesTokenCount ?? meta.candidates_token_count ?? null,
        totalTokens: meta.totalTokenCount ?? meta.total_token_count ?? null,
    }
}

function parseGeminiJson(text) {
    try {
        return JSON.parse(text)
    } catch {
        const err = new Error("Malformed Gemini JSON")
        err.code = "GEMINI_PARSE"
        err.status = 502
        throw err
    }
}

async function withTimeout(promise, ms) {
    let timer
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const err = new Error("Gemini request timed out")
            err.code = "GEMINI_TIMEOUT"
            err.status = 504
            reject(err)
        }, ms)
    })
    try {
        return await Promise.race([promise, timeout])
    } finally {
        clearTimeout(timer)
    }
}

async function generateContentWithRetry(params, {
    models = [GEMINI_MODELS[0]],
    maxAttemptsPerModel = 2,
    timeoutMs = GEMINI_TIMEOUT_MS,
    route,
} = {}) {
    let lastError

    for (const model of models) {
        for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
            const started = Date.now()
            try {
                const response = await withTimeout(
                    ai.models.generateContent({
                        ...params,
                        model,
                    }),
                    timeoutMs
                )
                logGemini({
                    route,
                    model,
                    attempt,
                    ms: Date.now() - started,
                    status: "success",
                    ...tokenUsage(response),
                })
                return response
            } catch (err) {
                lastError = err
                const errorClass = classifyGeminiError(err)
                logGemini({
                    route,
                    model,
                    attempt,
                    ms: Date.now() - started,
                    status: "error",
                    errorClass,
                })
                if (errorClass === "billing" || errorClass === "rate_limited") {
                    throw err
                }
                if (errorClass === "timeout" || errorClass === "not_found") {
                    break
                }
                if (errorClass === "unavailable" && attempt < maxAttemptsPerModel) {
                    await sleep(800 * attempt)
                    continue
                }
                throw err
            }
        }
    }

    throw lastError
}

async function generateStructuredJson(params, { route, fallbackModel = GEMINI_REPORT_MODELS[1] } = {}) {
    try {
        const response = await generateContentWithRetry(params, {
            models: GEMINI_REPORT_MODELS,
            maxAttemptsPerModel: 1,
            route,
        })
        return parseGeminiJson(response.text)
    } catch (err) {
        if (err?.code !== "GEMINI_PARSE") throw err
        const response = await generateContentWithRetry(params, {
            models: [fallbackModel],
            maxAttemptsPerModel: 1,
            route,
        })
        return parseGeminiJson(response.text)
    }
}

function incompleteQuestionSet(message) {
    const err = new Error(message || "Could not assemble a complete question set. Please try again.")
    err.code = "QUESTION_SET_INCOMPLETE"
    err.status = 503
    return err
}

function isCompanyResearchGrounded(question) {
    return /company research|hiring research|typical round|recent interview|system design|hld/i.test(
        `${question?.sourceGrounding || ""} ${question?.intention || ""}`
    )
}

function planQuestionItemSchema() {
    return {
        type: "object",
        properties: {
            question: { type: "string" },
            intention: { type: "string" },
            answer: { type: "string" },
            sourceGrounding: { type: "string" },
            groundedSkills: { type: "array", items: { type: "string" } },
            mentionedTechnologies: { type: "array", items: { type: "string" } },
        },
        required: ["question", "intention", "answer", "sourceGrounding", "groundedSkills", "mentionedTechnologies"],
    }
}

function planQuestionArraySchema(minItems, maxItems) {
    return {
        type: "array",
        minItems,
        maxItems,
        items: planQuestionItemSchema(),
    }
}

function mockQuestionItemSchema() {
    return {
        type: "object",
        properties: {
            question: { type: "string" },
            intention: { type: "string" },
            expectedAnswer: { type: "string" },
        },
        required: ["question", "intention", "expectedAnswer"],
    }
}

function mockQuestionArraySchema(minItems, maxItems) {
    return {
        type: "array",
        minItems,
        maxItems,
        items: mockQuestionItemSchema(),
    }
}

function partitionPlanQuestions(rawList, corpusText) {
    const accepted = []
    let rejected = 0
    for (const question of rawList || []) {
        if (!isValidPlanQuestion(question)) {
            rejected += 1
            continue
        }
        const foreign = findUnverifiedForeignTech(question.question, corpusText)
        const researchGrounded = isCompanyResearchGrounded(question)
        if (foreign && !researchGrounded) {
            rejected += 1
            continue
        }
        accepted.push({
            ...question,
            isVerified: true,
            verificationStatus: researchGrounded
                ? "VERIFIED_COMPANY_RESEARCH"
                : "VERIFIED_GROUNDED",
        })
    }
    return { accepted, rejected }
}

function partitionBehavioralQuestions(rawList) {
    const accepted = []
    let rejected = 0
    for (const question of rawList || []) {
        if (!isValidPlanQuestion(question)) {
            rejected += 1
            continue
        }
        accepted.push({
            ...question,
            isVerified: true,
            verificationStatus: "VERIFIED_BEHAVIORAL",
        })
    }
    return { accepted, rejected }
}

function acceptMockQuestions(rawList, blockedTexts) {
    const accepted = []
    const acceptedTexts = []
    for (const question of rawList || []) {
        if (!isValidMockQuestion(question)) continue
        const compared = [...blockedTexts, ...acceptedTexts]
        if (compared.some((text) => questionsAreSimilar(question.question, text))) continue
        accepted.push(question)
        acceptedTexts.push(question.question)
    }
    return accepted
}

async function generatePlanQuestionFill({
    techMissing,
    behaviorMissing,
    acceptedTechnical,
    acceptedBehavioral,
    compactContext,
    company,
    jobProfile,
    band,
}) {
    const avoidTechnical = (acceptedTechnical || []).map((question) => question.question).join("\n- ")
    const avoidBehavioral = (acceptedBehavioral || []).map((question) => question.question).join("\n- ")
    const prompt = `
Fill only the missing interview-plan questions for ${jobProfile} at ${company} (${band}).

Return exactly ${techMissing} technicalQuestions and exactly ${behaviorMissing} behavioralQuestions.
Do not repeat or lightly rephrase these accepted questions:
Technical:
- ${avoidTechnical || "None"}
Behavioral:
- ${avoidBehavioral || "None"}

Compact candidate context (use this instead of a full resume/JD):
${compactContextJson(compactContext)}

Each question needs question, intention, answer, sourceGrounding, groundedSkills, and mentionedTechnologies.
Technical answers: 50–80 words of key points, not an essay.
Behavioral answers: 60–100 words STAR key points.
Do not invent tools that appear in none of the context skills, JD skills, projects, or companyFocus.
`

    return generateStructuredJson({
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "object",
                properties: {
                    technicalQuestions: planQuestionArraySchema(techMissing, techMissing),
                    behavioralQuestions: planQuestionArraySchema(behaviorMissing, behaviorMissing),
                },
                required: ["technicalQuestions", "behavioralQuestions"],
            },
        },
    }, { route: "generatePlanQuestionFill" })
}

async function generateMockQuestionFill({
    techMissing,
    behaviorMissing,
    avoidTexts,
    resume,
    selfDescription,
    jobDescription,
    skillGaps,
    company,
    jobProfile,
    band,
    researchBlock,
}) {
    const prompt = `
You are a senior interviewer at ${company || "the target company"} filling a live mock for "${jobProfile || "this role"}" (${band}).

Return exactly ${techMissing} technical questions and exactly ${behaviorMissing} behavioral questions.
These must be new angles. Do not copy or lightly rephrase any question below:
- ${(avoidTexts || []).join("\n- ") || "None"}

Candidate resume:
${resume || "Not provided"}

Self description:
${selfDescription || "Not provided"}

Job description:
${jobDescription}

Skill gaps to optionally probe:
${skillGaps || "None listed"}

Company hiring research:
${researchBlock}

Questions should fit this company, role, job description, and research. They do not have to name a tool from the resume.
expectedAnswer is a concise model answer. Behavioral prompts should be answerable with STAR.
`

    return generateStructuredJson({
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "object",
                properties: {
                    technical: mockQuestionArraySchema(techMissing, techMissing),
                    behavioral: mockQuestionArraySchema(behaviorMissing, behaviorMissing),
                },
                required: ["technical", "behavioral"],
            },
        },
    }, { route: "generateMockQuestionFill" })
}

function fallbackCompanyResearch({ company, jobProfile, band }) {
    return {
        available: false,
        company,
        jobProfile,
        experienceBand: band,
        brief: `Web research was unavailable. Infer the hiring process from company="${company}", role="${jobProfile}", experience="${band}".`,
        structured: emptyStructured(),
        sources: [],
        note: "web research unavailable",
    }
}

function researchFromPayload(payload, { company, jobProfile, band }) {
    if (!payload) return fallbackCompanyResearch({ company, jobProfile, band })
    return {
        available: Boolean(payload.available),
        company: payload.company || company,
        jobProfile,
        experienceBand: band,
        brief: payload.brief || "",
        structured: payload.structured || emptyStructured(),
        sources: payload.sources || [],
        note: payload.note || "",
    }
}

async function fetchCompanyHiringResearch({ company, jobProfile, yearsOfExperience }) {
    const band = experienceBand(yearsOfExperience)
    const prompt = `
You are an interview-intelligence researcher. Use Google Search to research how ${company} hires for "${jobProfile}" at the ${band} level.

Search recent (last 1-3 years when possible) interview experiences, hiring process writeups, and candidate reports for this company + role + experience band.

Write a short factual research brief with these sections:
1. HIRING_PROCESS — typical rounds in order
2. COMMON_ROUNDS — OA, DSA, LLD, HLD/system design, case, domain, HR, etc.
3. QUESTION_PATTERNS — what they actually ask at this experience level
4. INCLUDE_SYSTEM_DESIGN — yes or no, and why
5. PREP_FOCUS — what to prioritize given this company

Keep the prose under 400 words. End with a single JSON object and no other text after it:
{
  "interviewRounds": [],
  "questionPatterns": [],
  "technicalFocus": [],
  "behavioralFocus": [],
  "systemDesign": false,
  "companyTechnologies": [],
  "hiringSignals": [],
  "sources": []
}
Use short strings. Set systemDesign to true only when this company asks system design or HLD at this level.
`

    try {
        const response = await generateContentWithRetry({
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            },
        }, {
            models: GEMINI_RESEARCH_MODELS,
            maxAttemptsPerModel: 1,
            route: "researchCompanyHiring",
        })

        const brief = response.text || ""
        const grounding = response.candidates?.[0]?.groundingMetadata || response.groundingMetadata || {}
        const chunks = grounding.groundingChunks || []
        const sources = chunks
            .map((chunk) => chunk.web?.uri || chunk.web?.title)
            .filter(Boolean)
            .slice(0, 8)

        return {
            available: Boolean(brief.trim()),
            company,
            jobProfile,
            experienceBand: band,
            brief,
            structured: compactResearch(brief, sources),
            sources,
            note: brief.trim() ? "" : "web research returned an empty brief",
        }
    } catch (err) {
        console.warn(
            "Company hiring research failed:",
            err?.status || err?.code || err?.name || redactSecrets(err?.message)
        )
        return fallbackCompanyResearch({ company, jobProfile, band })
    }
}

async function researchCompanyHiring({ company, jobProfile, yearsOfExperience }) {
    const band = experienceBand(yearsOfExperience)
    const companyKey = companyResearchRepository.normalizeCompanyKey(company)
    if (!companyKey) {
        return fallbackCompanyResearch({ company, jobProfile, band })
    }

    const cached = await companyResearchRepository.findFresh(companyKey)
    if (cached?.payload) {
        return researchFromPayload(cached.payload, { company: cached.companyLabel || company, jobProfile, band })
    }

    const fresh = await fetchCompanyHiringResearch({ company, jobProfile, yearsOfExperience })
    if (fresh.available) {
        await companyResearchRepository.upsert({
            companyKey,
            companyLabel: company,
            payload: {
                available: true,
                company,
                brief: fresh.brief,
                structured: fresh.structured,
                sources: fresh.sources,
                note: fresh.note,
            },
        })
    }
    return fresh
}

async function generateInterviewReport({
    resume,
    selfDescription,
    jobDescription,
    company,
    jobProfile,
    yearsOfExperience,
    interviewWindow,
}) {
    const windowMeta = resolveInterviewWindow(interviewWindow)
    const roadmapDays = roadmapDayCount(interviewWindow)
    const band = experienceBand(yearsOfExperience)
    const companyResearch = await researchCompanyHiring({
        company,
        jobProfile,
        yearsOfExperience,
    })
    const compactContext = buildCompactContext({
        role: jobProfile,
        experience: `${yearsOfExperience} (${band})`,
        resume,
        selfDescription,
        jobDescription,
        companyResearch,
    })
    const corpusText = groundingCorpus({
        resume,
        selfDescription,
        jobDescription,
        company,
        jobProfile,
        companyResearch,
    })
    const resumeAndSelfText = `${resume || ""} ${selfDescription || ""}`
    const jdText = `${jobDescription || ""}`
    const researchText = researchCorpusText(companyResearch.structured)

    const questionsData = await generateStructuredJson({
        contents: `
You write interview questions for ${jobProfile} at ${company} (${band}).
Interview window: ${windowMeta.label}.

Compact candidate context:
${compactContextJson(compactContext)}

Return 8 to 14 technicalQuestions and 6 to 10 behavioralQuestions.
Company research in the context MUST drive which round types appear.
Include system design / HLD only if companyFocus or systemDesign says this company uses it.
Junior → more fundamentals. Mid/senior → design/leadership only if the company uses them.
Do not invent employers or tools outside skills, jdSkills, projects, and companyFocus.

Each question needs question, intention, answer, sourceGrounding, groundedSkills, mentionedTechnologies.
Technical answer: 50–80 words of key points, not an essay.
Behavioral answer: 60–100 words STAR key points.
sourceGrounding examples: "Resume - Project: ...", "Job Description - Required Skill: Redis", "Company research — ${company} typically includes HLD".
        `,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "object",
                properties: {
                    technicalQuestions: planQuestionArraySchema(PLAN_TECH.min, PLAN_TECH.max),
                    behavioralQuestions: planQuestionArraySchema(PLAN_BEHAVIOR.min, PLAN_BEHAVIOR.max),
                },
                required: ["technicalQuestions", "behavioralQuestions"],
            },
        },
    }, { route: "generateInterviewQuestions" })

    const initialTechnical = partitionPlanQuestions(questionsData.technicalQuestions, corpusText)
    const initialBehavioral = partitionBehavioralQuestions(questionsData.behavioralQuestions)
    const initialTotal = initialTechnical.accepted.length + initialTechnical.rejected
        + initialBehavioral.accepted.length + initialBehavioral.rejected
    const initialVerified = initialTechnical.accepted.length + initialBehavioral.accepted.length
    const groundingAccuracyScore = initialTotal > 0
        ? Math.round((initialVerified / initialTotal) * 100)
        : 100

    let technical = prepareQuestionSet(initialTechnical.accepted, PLAN_TECH).questions
    let behavioral = prepareQuestionSet(initialBehavioral.accepted, PLAN_BEHAVIOR).questions

    for (let round = 0; round < MAX_REPLACEMENT_ROUNDS; round += 1) {
        const techMissing = Math.max(0, PLAN_TECH.min - technical.length)
        const behaviorMissing = Math.max(0, PLAN_BEHAVIOR.min - behavioral.length)
        if (techMissing === 0 && behaviorMissing === 0) break

        const filled = await generatePlanQuestionFill({
            techMissing,
            behaviorMissing,
            acceptedTechnical: technical,
            acceptedBehavioral: behavioral,
            compactContext,
            company,
            jobProfile,
            band,
        })
        const moreTechnical = partitionPlanQuestions(filled.technicalQuestions, corpusText)
        const moreBehavioral = partitionBehavioralQuestions(filled.behavioralQuestions)
        technical = prepareQuestionSet(technical.concat(moreTechnical.accepted), PLAN_TECH).questions
        behavioral = prepareQuestionSet(behavioral.concat(moreBehavioral.accepted), PLAN_BEHAVIOR).questions
    }

    if (
        technical.length < PLAN_TECH.min
        || technical.length > PLAN_TECH.max
        || behavioral.length < PLAN_BEHAVIOR.min
        || behavioral.length > PLAN_BEHAVIOR.max
    ) {
        throw incompleteQuestionSet("Could not assemble a complete interview plan. Please try again.")
    }

    const analysisData = await generateStructuredJson({
        contents: `
Score this candidate for ${jobProfile} at ${company} (${band}).
Prefer title "${jobProfile} at ${company}" when that fits.

Compact candidate context:
${compactContextJson(compactContext)}

Accepted technical questions (titles only):
${technical.map((question) => question.question).join("\n")}

Accepted behavioral questions (titles only):
${behavioral.map((question) => question.question).join("\n")}

Return matchScore 0–100, short skillGaps for JD or company skills missing from the candidate, and validation.
skillGaps: skill, severity (low/medium/high), one-sentence justification. No resources. No roadmap. No questions.
        `,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "object",
                properties: {
                    matchScore: { type: "number" },
                    title: { type: "string" },
                    skillGaps: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                skill: { type: "string" },
                                severity: {
                                    type: "string",
                                    enum: ["low", "medium", "high"],
                                },
                                justification: { type: "string" },
                            },
                            required: ["skill", "severity", "justification"],
                        },
                    },
                    validation: {
                        type: "object",
                        properties: {
                            qualityScore: { type: "number" },
                            verdict: {
                                type: "string",
                                enum: [
                                    "Excellent Alignment",
                                    "Good Alignment",
                                    "Moderate Misalignment",
                                    "Significant Misalignment",
                                    "Poor Alignment",
                                ],
                            },
                            verdictExplanation: { type: "string" },
                        },
                        required: ["qualityScore", "verdict", "verdictExplanation"],
                    },
                },
                required: ["matchScore", "title", "skillGaps", "validation"],
            },
        },
    }, { route: "generateInterviewAnalysis" })

    const aiSkillGaps = (analysisData.skillGaps || []).map((sg) => {
        const existsInJD = skillAppearsInText(sg.skill, jdText)
        const existsInResearch = skillAppearsInText(sg.skill, researchText)
        const existsInResume = skillAppearsInText(sg.skill, resumeAndSelfText)
        const isFairGap = (existsInJD || existsInResearch) && !existsInResume

        return {
            ...sg,
            isVerifiedFair: isFairGap,
            verificationStatus: isFairGap
                ? existsInJD
                    ? "VERIFIED_FAIR_GAP"
                    : "VERIFIED_FAIR_GAP_COMPANY_RESEARCH"
                : existsInResume
                    ? "UNFAIR_GAP_CANDIDATE_ALREADY_HAS_SKILL"
                    : "UNVERIFIED_GAP_NOT_IN_JD",
        }
    })

    const programmaticGaps = []
    const seenGapNames = new Set()
    for (const tech of KNOWN_TECH_LEXICON) {
        const skillName = canonicalTechName(tech)
        if (seenGapNames.has(skillName)) continue
        seenGapNames.add(skillName)
        const inJD = skillAppearsInText(tech, jdText)
        const inResume = skillAppearsInText(tech, resumeAndSelfText)

        if (inJD && !inResume) {
            const alreadyListed = [...aiSkillGaps, ...programmaticGaps].some(
                (gap) => gap.skill.toLowerCase() === skillName.toLowerCase()
                    || skillAppearsInText(tech, gap.skill.toLowerCase())
            )

            if (!alreadyListed) {
                programmaticGaps.push({
                    skill: skillName,
                    severity: "high",
                    justification: `Required in the Job Description but not found in the candidate's Resume / Self Description.`,
                    isVerifiedFair: true,
                    verificationStatus: "VERIFIED_FAIR_GAP_PROGRAMMATIC",
                })
            }
        }
    }

    const finalSkillGaps = [
        ...aiSkillGaps.filter((g) => g.isVerifiedFair),
        ...programmaticGaps,
    ]
    const finalSkillGapsWithResources = finalSkillGaps.map(withSkillGapResources)
    const coreDays = buildCoreRoadmap({
        targetDays: roadmapDays,
        company,
        jobProfile,
        skillGaps: finalSkillGapsWithResources,
        technicalQuestions: technical,
        behavioralQuestions: behavioral,
        compactContext,
    })
    const normalizedPlan = expandRoadmap({
        coreDays,
        laterArc: {
            spiralSkills: finalSkillGapsWithResources.map((gap) => gap.skill).filter(Boolean),
            rehearsalFocus: technical.slice(0, 3).map((question) => question.question),
            weekThemes: [],
        },
        targetDays: roadmapDays,
        skillGaps: finalSkillGapsWithResources,
        technicalQuestions: technical,
        behavioralQuestions: behavioral,
    })

    logResources("generateInterviewReport")
    return {
        matchScore: analysisData.matchScore,
        title: analysisData.title || `${jobProfile} at ${company}`,
        technicalQuestions: technical,
        behavioralQuestions: behavioral,
        skillGaps: finalSkillGapsWithResources,
        preparationPlan: normalizedPlan,
        companyResearch,
        validation: {
            ...analysisData.validation,
            groundingAccuracyScore,
        },
    }
}

const RESUME_TEMPLATES = {
    classic: {
        id: "classic",
        label: "Classic ATS",
        promptRules: `
6. DESIGN RULES (mandatory):
- Font family: Calibri, "Segoe UI", Arial, sans-serif ONLY
- ALL text color: #000000
- Single column, dense ATS layout
- Section headings: 13pt to 14pt bold, thin black bottom border
- Candidate name: 16pt bold
- Body / bullets: 10pt to 10.5pt
- No colored bars, icons, or sidebars
`,
        styles: `
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0 !important; padding: 0 !important; font-family: Calibri, "Segoe UI", Arial, sans-serif !important; font-size: 10pt !important; line-height: 1.12 !important; color: #000 !important; background: #fff !important; }
  table, .sidebar, .two-col { width: 100% !important; display: block !important; }
  td, th { display: block !important; width: 100% !important; }
  h1, h2, h3, p, li, a, div, span { color: #000 !important; font-family: Calibri, "Segoe UI", Arial, sans-serif !important; line-height: 1.12 !important; }
  a { text-decoration: underline !important; }
  h1 { font-size: 15pt !important; font-weight: 700 !important; margin: 0 0 1pt 0 !important; line-height: 1.1 !important; }
  h2, h3 { font-size: 11.5pt !important; font-weight: 700 !important; margin: 6pt 0 2pt 0 !important; padding-bottom: 1pt !important; border-bottom: 1px solid #000 !important; }
  p, li { font-size: 10pt !important; margin: 0 0 1pt 0 !important; }
  ul, ol { margin: 0 0 3pt 0 !important; padding-left: 13pt !important; }
</style>
`,
    },
    modern: {
        id: "modern",
        label: "Modern",
        promptRules: `
6. DESIGN RULES (mandatory):
- Font family: "Segoe UI", Arial, sans-serif
- Name in #111827, section headings in #1f4e79
- Thin #1f4e79 rule under headings
- Contact line in #374151
- Single column with a slightly stronger header
- Body 10pt to 10.5pt, black or near-black
- No icons, no photos, no multi-column sidebar
`,
        styles: `
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0 !important; padding: 0 !important; font-family: "Segoe UI", Arial, sans-serif !important; font-size: 10pt !important; line-height: 1.12 !important; color: #111827 !important; background: #fff !important; }
  a { color: #111827 !important; text-decoration: underline !important; }
  h1 { font-size: 16pt !important; font-weight: 750 !important; margin: 0 0 2pt 0 !important; color: #111827 !important; letter-spacing: -0.02em !important; line-height: 1.1 !important; }
  .contact, .header-contact { color: #374151 !important; font-size: 9.5pt !important; }
  h2, h3 { font-size: 11pt !important; font-weight: 700 !important; margin: 6pt 0 2pt 0 !important; padding-bottom: 1pt !important; color: #1f4e79 !important; border-bottom: 1.5px solid #1f4e79 !important; text-transform: uppercase !important; letter-spacing: 0.04em !important; }
  p, li { font-size: 10pt !important; margin: 0 0 1pt 0 !important; color: #111827 !important; line-height: 1.12 !important; }
  ul, ol { margin: 0 0 3pt 0 !important; padding-left: 13pt !important; }
</style>
`,
    },
    compact: {
        id: "compact",
        label: "Compact",
        promptRules: `
6. DESIGN RULES (mandatory):
- Font family: Arial, Helvetica, sans-serif
- Very dense one-page layout
- Name 15pt, headings 11pt, body 9.5pt
- Black text, thin gray heading borders
- Short one-line bullets
- Minimal vertical gaps
`,
        styles: `
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0 !important; padding: 0 !important; font-family: Arial, Helvetica, sans-serif !important; font-size: 9pt !important; line-height: 1.1 !important; color: #111 !important; background: #fff !important; }
  h1, h2, h3, p, li, a { color: #111 !important; font-family: Arial, Helvetica, sans-serif !important; line-height: 1.1 !important; }
  a { text-decoration: underline !important; }
  h1 { font-size: 14pt !important; font-weight: 700 !important; margin: 0 0 1pt 0 !important; }
  h2, h3 { font-size: 10.5pt !important; font-weight: 700 !important; margin: 5pt 0 1pt 0 !important; padding-bottom: 1pt !important; border-bottom: 1px solid #666 !important; }
  p, li { font-size: 9pt !important; margin: 0 0 1pt 0 !important; }
  ul, ol { margin: 0 0 2pt 0 !important; padding-left: 12pt !important; }
</style>
`,
    },
    executive: {
        id: "executive",
        label: "Executive",
        promptRules: `
6. DESIGN RULES (mandatory):
- Font family: Georgia, "Times New Roman", serif for headings; Calibri or Arial for body
- Centered name and contact in the header
- More breathing room than compact
- Headings in #1a1a1a with a thin bottom border
- Body 10.5pt, name 18pt
- No accent colors, no icons, no photos
`,
        styles: `
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0 !important; padding: 0 !important; font-family: Calibri, Arial, sans-serif !important; font-size: 10pt !important; line-height: 1.12 !important; color: #1a1a1a !important; background: #fff !important; }
  a { color: #1a1a1a !important; text-decoration: underline !important; }
  h1 { font-family: Georgia, "Times New Roman", serif !important; font-size: 16pt !important; font-weight: 600 !important; text-align: center !important; margin: 0 0 2pt 0 !important; line-height: 1.1 !important; }
  .contact, .header-contact, header p { text-align: center !important; color: #333 !important; }
  h2, h3 { font-family: Georgia, "Times New Roman", serif !important; font-size: 11.5pt !important; font-weight: 600 !important; margin: 7pt 0 2pt 0 !important; padding-bottom: 1pt !important; border-bottom: 1px solid #1a1a1a !important; }
  p, li { font-size: 10pt !important; margin: 0 0 1pt 0 !important; line-height: 1.12 !important; }
  ul, ol { margin: 0 0 3pt 0 !important; padding-left: 13pt !important; }
</style>
`,
    },
}

function resolveResumeTemplate(templateId) {
    return RESUME_TEMPLATES[templateId] || RESUME_TEMPLATES.classic
}

function extractResumeLinks(text) {
    if (!text) return []
    const compact = String(text).replace(/\s+/g, " ")
    const links = new Set()
    const add = (raw, prefix = "") => {
        if (!raw) return
        let href = String(raw).trim().replace(/[.,;:)\]\}]+$/g, "")
        if (prefix && !/^https?:\/\//i.test(href) && !href.startsWith("mailto:")) {
            href = prefix + href.replace(/^\/\//, "")
        }
        if (/^https?:\/\//i.test(href) || href.startsWith("mailto:")) {
            links.add(href.replace(/"/g, ""))
        }
    }

    for (const match of compact.match(/href\s*=\s*["']([^"']+)["']/gi) || []) {
        add(match.replace(/^href\s*=\s*["']/i, "").replace(/["']$/, ""))
    }
    for (const match of compact.match(/https?:\/\/[^\s<>"')\]]+/gi) || []) {
        add(match)
    }
    for (const match of compact.match(/(?:www\.)?(?:linkedin\.com\/in\/[A-Za-z0-9._\-\/%]+)/gi) || []) {
        add(match, "https://")
    }
    for (const match of compact.match(/(?:www\.)?(?:github\.com\/[A-Za-z0-9._\-]+(?:\/[A-Za-z0-9._\-]+)?)/gi) || []) {
        add(match, "https://")
    }
    for (const match of compact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []) {
        add(match, "mailto:")
    }
    return [...links]
}

function resumeLinkLabel(href) {
    try {
        if (href.startsWith("mailto:")) return href.slice(7)
        const url = new URL(href)
        const host = url.hostname.replace(/^www\./, "")
        if (host.includes("linkedin")) return "LinkedIn"
        if (host.includes("github")) return url.pathname.replace(/\/$/, "") ? `GitHub${url.pathname}` : "GitHub"
        return host
    } catch {
        return href
    }
}

function ensureResumeLinks(html, links) {
    if (!html || !links.length) return html
    const missing = links.filter((href) => !html.includes(href))
    if (!missing.length) return html

    const row = `<p class="contact header-contact">${missing
        .map((href) => `<a href="${href}">${resumeLinkLabel(href)}</a>`)
        .join(" | ")}</p>`

    if (/<h1[^>]*>[\s\S]*?<\/h1>/i.test(html)) {
        return html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, (match) => `${match}${row}`)
    }
    if (/<\/body>/i.test(html)) {
        return html.replace(/<\/body>/i, `${row}</body>`)
    }
    return html + row
}

function stripActiveHtml(html) {
    return String(html || "")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
        .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, "")
        .replace(/<embed\b[^>]*>/gi, "")
        .replace(/<link\b[^>]*>/gi, "")
        .replace(/<meta\b[^>]*>/gi, "")
        .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/javascript\s*:/gi, "")
}

let pdfChain = Promise.resolve()

function withPdfLock(fn) {
    const run = pdfChain.then(fn, fn)
    pdfChain = run.then(() => {}, () => {})
    return run
}

async function generatePdfFromHtml(htmlContent, templateId = "classic") {
    return withPdfLock(async () => {
        const started = Date.now()
        const template = resolveResumeTemplate(templateId)
        const launchOptions = {
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        }

        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
        }

        let browser
        try {
            browser = await puppeteer.launch(launchOptions)
            const page = await browser.newPage()
            await page.setJavaScriptEnabled(false)
            await page.setRequestInterception(true)
            page.on("request", (request) => {
                if (request.resourceType() === "document") {
                    request.continue()
                    return
                }
                request.abort()
            })

            const enforcedStyles = template.styles
            const safeHtml = stripActiveHtml(htmlContent)

            const htmlWithStyles = /<\/head>/i.test(safeHtml)
                ? safeHtml.replace(/<\/head>/i, `${enforcedStyles}</head>`)
                : `<!DOCTYPE html><html><head>${enforcedStyles}</head><body>${safeHtml}</body></html>`

            await page.setContent(htmlWithStyles, { waitUntil: "domcontentloaded" })

            const contentHeight = await page.evaluate(() => Math.max(
                document.body?.scrollHeight || 0,
                document.documentElement?.scrollHeight || 0
            ))
            const printableHeightPx = 1000
            const scale = contentHeight > printableHeightPx
                ? Math.max(0.35, Math.min(1, printableHeightPx / contentHeight))
                : 1

            const pdfBuffer = await page.pdf({
                format: "A4",
                printBackground: true,
                scale,
                margin: {
                    top: "8mm",
                    bottom: "8mm",
                    left: "9mm",
                    right: "9mm"
                }
            })

            logPuppeteer({ ms: Date.now() - started, outcome: "success" })
            logResources("pdf")
            return pdfBuffer
        } catch (err) {
            logPuppeteer({
                ms: Date.now() - started,
                outcome: "error",
                errorClass: err?.code || err?.name || "error",
            })
            throw err
        } finally {
            if (browser) {
                try {
                    await browser.close()
                } catch {
                    // ignore close errors
                }
            }
        }
    })
}

async function generateResumePdf({
    resume,
    selfDescription,
    jobDescription,
    template: templateId = "classic",
    reportId = null,
}) {
    const template = resolveResumeTemplate(templateId)

    const prompt = `
You are an expert ATS resume writer and recruiter.

Your task is to optimize and rewrite the candidate's existing resume for the given job description WITHOUT changing factual information.

You MUST follow these strict rules:

1. DO NOT change:
- candidate name
- email
- phone number
- companies
- education
- years
- job titles
- projects
- achievements

2. DO NOT invent:
- fake skills
- fake experience
- fake internships
- fake certifications
- fake projects

3. You MAY:
- improve wording
- rewrite bullet points professionally
- reorder sections
- emphasize relevant skills
- optimize ATS keywords
- improve formatting
- tailor summary for the target role

4. The generated resume should:
- be ATS friendly: single column, standard headings (Summary, Skills, Experience, Projects, Education)
- use keywords from the Job Description in existing bullets where they are factually true
- be professional
- look human-written
- fit STRICTLY on ONE A4 page (dense spacing, short bullets, drop older/irrelevant detail first)
- prioritize relevance over quantity
- highlight skills matching the job description
- maintain factual accuracy

5. Important:
The generated resume MUST preserve the candidate's identity and original background. Never replace the candidate with another fictional person.

6. LINKS (mandatory):
- Preserve every URL, LinkedIn, GitHub, portfolio, project, and email from the original resume.
- Render them as HTML <a href="..."> tags (mailto: for emails).
- Do not drop or rewrite the original href values.

${template.promptRules}

- Page margins inside HTML: padding 0; keep content dense enough for one A4 page
- Keep bullet points short (1 line each when possible)
- No photos, no icons, no fake credentials

Return ONLY a valid JSON object in this format:

{
   "html": "<complete HTML resume>"
}

The HTML should:
- be a full HTML document with <style> or inline styles
- follow ALL design rules above exactly
- work well when converted to PDF using Puppeteer
- avoid external CDN dependencies
- use a white background and follow the template color rules above

Candidate Resume:
${resume}

Candidate Self Description:
${selfDescription}

Target Job Description:
${jobDescription}
`

    let html = reportId ? await getCachedResumeHtml(reportId, template.id) : null
    if (!html) {
        const jsonContent = await generateStructuredJson({
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "object",
                    properties: {
                        html: { type: "string" },
                    },
                    required: ["html"],
                },
            }
        }, { route: "generateResumePdf" })
        const originalLinks = extractResumeLinks(`${resume || ""}\n${selfDescription || ""}`)
        html = ensureResumeLinks(jsonContent.html, originalLinks)
        if (reportId) await cacheResumeHtml(reportId, template.id, html)
    }

    return generatePdfFromHtml(html, template.id)

}

async function generateMockInterviewReport({

    answers

}) {

    // Deterministic presentation score from local CV metrics (0–10). Gemini must not invent this.
    const computePresentationScore = (videoMetrics) => {

        if (!videoMetrics || typeof videoMetrics.cameraEngagement !== "number") {
            return null
        }

        const engagement = Number(videoMetrics.cameraEngagement) || 0
        const visibility = Number(videoMetrics.faceVisibility) || 0
        const excessive = Number(videoMetrics.excessiveMovement) || 0
        const eyeContact = typeof videoMetrics.eyeContact === "number"
            ? Number(videoMetrics.eyeContact)
            : engagement
        const gazeAway = typeof videoMetrics.gazeAwayRate === "number"
            ? Number(videoMetrics.gazeAwayRate)
            : Math.max(0, 1 - engagement)

        const postureBonus =
            videoMetrics.posture === "stable" ? 0.08
                : videoMetrics.posture === "unstable" ? -0.05
                    : 0

        const raw =
            (engagement * 0.28)
            + (eyeContact * 0.28)
            + (visibility * 0.18)
            + ((1 - Math.min(1, gazeAway)) * 0.12)
            + ((1 - Math.min(1, excessive)) * 0.14)
            + postureBonus

        return Math.max(0, Math.min(10, Number((raw * 10).toFixed(1))))
    }

    const compactMetrics = (metrics) => {
        if (!metrics || typeof metrics !== "object") return null
        return {
            cameraEngagement: metrics.cameraEngagement,
            eyeContact: metrics.eyeContact,
            gazeAwayRate: metrics.gazeAwayRate,
            blinkRate: metrics.blinkRate,
            faceVisibility: metrics.faceVisibility,
            headMovement: metrics.headMovement,
            posture: metrics.posture,
            excessiveMovement: metrics.excessiveMovement,
        }
    }

    const scoringAnswers = (answers || []).map((answer) => ({
        questionIndex: answer.questionIndex,
        section: answer.section,
        question: answer.question,
        expectedAnswer: answer.expectedAnswer,
        userAnswer: answer.userAnswer,
        videoMetrics: compactMetrics(answer.videoMetrics),
    }))

    const prompt = `

You are an expert technical interviewer.

Evaluate the candidate's mock interview answers.

For every answer you receive question, expectedAnswer, userAnswer, and optional videoMetrics.

videoMetrics (when present) are deterministic computer-vision observations from the browser:
- cameraEngagement: fraction of frames facing the camera
- eyeContact: fraction of frames with iris/gaze toward the camera
- gazeAwayRate: fraction of visible-face frames looking away
- blinkRate: blinks per minute when available
- faceVisibility, headMovement, posture, excessiveMovement

Rules:
- Score technical accuracy and communication clarity from the TRANSCRIPT only.
- Use videoMetrics only for qualitative presentation feedback (eye contact, gaze, posture, movement).
- Do NOT invent numeric presentation scores. Do NOT claim the candidate is nervous, anxious, dishonest, or lacking confidence.
- Prefer observable language: "camera engagement", "eye contact", "gaze away", "head orientation", "movement".

For every answer return:
- questionIndex
- section (must match the input)
- technicalScore out of 10 (content accuracy / relevance)
- communicationScore out of 10 (clarity / structure)
- feedback: concise actionable feedback that may mention presentation signals when videoMetrics exist

Also provide:
- overallFeedback summarizing the interview (including presentation themes if metrics exist)

Candidate Answers:
${JSON.stringify(scoringAnswers)}

`

    const aiEvaluation = await generateStructuredJson({

            contents: prompt,

            config: {

                responseMimeType:
                    "application/json",

                responseSchema: {

                    type: "object",

                    properties: {

                        answers: {

                            type: "array",

                            items: {

                                type: "object",

                                properties: {

                                    questionIndex: {
                                        type: "number"
                                    },

                                    section: {
                                        type: "string"
                                    },

                                    technicalScore: {
                                        type: "number"
                                    },

                                    communicationScore: {
                                        type: "number"
                                    },

                                    feedback: {
                                        type: "string"
                                    }

                                },

                                required: [

                                    "questionIndex",

                                    "technicalScore",

                                    "communicationScore",

                                    "feedback"
                                ]
                            }
                        },

                        overallFeedback: {
                            type: "string"
                        }
                    },

                    required: [

                        "answers",

                        "overallFeedback"
                    ]
                }
            }
        }, { route: "generateMockInterviewReport" })

    const evaluatedAnswers =
        answers.map(answer => {

            const evaluation =
                aiEvaluation.answers.find(

                    item =>

                        item.questionIndex === answer.questionIndex
                        && (!item.section || item.section === answer.section)
                )
                || aiEvaluation.answers.find(

                    item => item.questionIndex === answer.questionIndex
                )

            const technicalScore =
                evaluation?.technicalScore
                ?? evaluation?.score
                ?? 0

            const communicationScore =
                evaluation?.communicationScore
                ?? technicalScore

            const presentationScore =
                computePresentationScore(answer.videoMetrics)

            // Blend: technical 50% + communication 35% + presentation 15% (redistribute if no CV)
            let score
            if (presentationScore == null) {
                score = Number(
                    (
                        technicalScore * 0.6
                        + communicationScore * 0.4
                    ).toFixed(1)
                )
            } else {
                score = Number(
                    (
                        technicalScore * 0.5
                        + communicationScore * 0.35
                        + presentationScore * 0.15
                    ).toFixed(1)
                )
            }

            return {

                ...answer,

                technicalScore,

                communicationScore,

                presentationScore,

                score,

                feedback:
                    evaluation?.feedback
                    ?? ""
            }
        })

    const overallScore = evaluatedAnswers.length
        ? Math.round(
            evaluatedAnswers.reduce((sum, a) => sum + (a.score || 0), 0)
            / evaluatedAnswers.length
            * 10
        )
        : 0

    const answersWithMetrics = evaluatedAnswers.filter(a => a.videoMetrics)
    let presentationSummary = null

    if (answersWithMetrics.length > 0) {
        const avgEngagement =
            answersWithMetrics.reduce((s, a) => s + (a.videoMetrics.cameraEngagement || 0), 0)
            / answersWithMetrics.length

        const avgVisibility =
            answersWithMetrics.reduce((s, a) => s + (a.videoMetrics.faceVisibility || 0), 0)
            / answersWithMetrics.length

        const avgPresentation =
            answersWithMetrics.reduce((s, a) => s + (a.presentationScore || 0), 0)
            / answersWithMetrics.length

        const avgEyeContact =
            answersWithMetrics.reduce((s, a) => s + ((a.videoMetrics.eyeContact ?? a.videoMetrics.cameraEngagement) || 0), 0)
            / answersWithMetrics.length

        const avgGazeAway =
            answersWithMetrics.reduce((s, a) => s + (a.videoMetrics.gazeAwayRate || 0), 0)
            / answersWithMetrics.length

        const blinkSamples = answersWithMetrics.filter((a) => typeof a.videoMetrics.blinkRate === "number")
        const avgBlinkRate = blinkSamples.length
            ? blinkSamples.reduce((s, a) => s + a.videoMetrics.blinkRate, 0) / blinkSamples.length
            : null

        presentationSummary = {
            cameraEngagement: Number(avgEngagement.toFixed(2)),
            faceVisibility: Number(avgVisibility.toFixed(2)),
            eyeContact: Number(avgEyeContact.toFixed(2)),
            gazeAwayRate: Number(avgGazeAway.toFixed(2)),
            blinkRate: avgBlinkRate == null ? null : Number(avgBlinkRate.toFixed(1)),
            averagePresentationScore: Number(avgPresentation.toFixed(1))
        }
    }

    return {

        answers:
            evaluatedAnswers,

        overallScore,

        overallFeedback:
            aiEvaluation.overallFeedback,

        presentationSummary
    }
}


async function generateFreshMockQuestions({
    resume,
    selfDescription,
    jobDescription,
    skillGaps,
    existingTechnical,
    existingBehavioral,
    company,
    jobProfile,
    yearsOfExperience,
    companyResearch,
}) {
    const planTexts = [...(existingTechnical || []), ...(existingBehavioral || [])]
        .map((question) => question?.question)
        .filter(Boolean)
    const gapText = (skillGaps || []).map((gap) => gap.skill).join(", ")
    const band = experienceBand(yearsOfExperience)
    const structured = companyResearch?.structured
        || compactResearch(companyResearch?.brief || "", companyResearch?.sources)
    const researchBlock = researchPromptBlock(structured)
    const compact = buildCompactContext({
        role: jobProfile,
        experience: `${yearsOfExperience} (${band})`,
        resume,
        selfDescription,
        jobDescription,
        companyResearch,
    })
    const existingTechnicalText = (existingTechnical || []).map((question) => question.question).join("\n- ")
    const existingBehavioralText = (existingBehavioral || []).map((question) => question.question).join("\n- ")

    const prompt = `
You are a senior interviewer at ${company || "the target company"} running a LIVE mock for "${jobProfile || "this role"}" (${band}).

Generate a FRESH set of interview questions.
These questions must NOT copy or lightly rephrase the existing prep-report questions.

Existing technical questions to AVOID:
- ${existingTechnicalText || "None"}

Existing behavioral questions to AVOID:
- ${existingBehavioralText || "None"}

Compact candidate context:
${compactContextJson(compact)}

Skill gaps to optionally probe:
${gapText || "None listed"}

Company hiring signals:
${researchBlock}

Rules:
- Create exactly 5 technical and exactly 4 behavioral questions.
- Match this company's real mix: include system design / HLD only if research says this company asks it at this level. Skip it otherwise.
- Include at least one HR question and one question about a co-curricular or project from the compact context when those exist.
- Questions must be new angles, deeper scenarios, or different skills than the avoided list.
- Questions should fit this company, role, and context. They do not have to name a tool from the resume.
- expectedAnswer should be a concise model answer the interviewer can score against.
- Use STAR-friendly prompts for behavioral.
`

    const parsed = await generateStructuredJson({
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "object",
                properties: {
                    technical: mockQuestionArraySchema(MOCK_TECH.min, MOCK_TECH.max),
                    behavioral: mockQuestionArraySchema(MOCK_BEHAVIOR.min, MOCK_BEHAVIOR.max),
                },
                required: ["technical", "behavioral"],
            },
        },
    }, { route: "generateFreshMockQuestions" })

    let technical = prepareQuestionSet(
        acceptMockQuestions(parsed.technical, planTexts),
        MOCK_TECH
    ).questions
    let behavioral = prepareQuestionSet(
        acceptMockQuestions(parsed.behavioral, planTexts),
        MOCK_BEHAVIOR
    ).questions

    for (let round = 0; round < MAX_REPLACEMENT_ROUNDS; round += 1) {
        const techMissing = Math.max(0, MOCK_TECH.min - technical.length)
        const behaviorMissing = Math.max(0, MOCK_BEHAVIOR.min - behavioral.length)
        if (techMissing === 0 && behaviorMissing === 0) break

        const filled = await generateMockQuestionFill({
            techMissing,
            behaviorMissing,
            avoidTexts: [
                ...planTexts,
                ...technical.map((question) => question.question),
                ...behavioral.map((question) => question.question),
            ],
            resume,
            selfDescription,
            jobDescription,
            skillGaps: gapText,
            company,
            jobProfile,
            band,
            researchBlock,
        })
        const blocked = [
            ...planTexts,
            ...technical.map((question) => question.question),
            ...behavioral.map((question) => question.question),
        ]
        technical = prepareQuestionSet(
            technical.concat(acceptMockQuestions(filled.technical, blocked)),
            MOCK_TECH
        ).questions
        behavioral = prepareQuestionSet(
            behavioral.concat(acceptMockQuestions(filled.behavioral, blocked)),
            MOCK_BEHAVIOR
        ).questions
    }

    if (technical.length !== MOCK_TECH.min || behavioral.length !== MOCK_BEHAVIOR.min) {
        throw incompleteQuestionSet("Could not assemble a complete mock interview. Please try again.")
    }

    return { technical, behavioral }
}

async function generateFollowUpQuestion({
    section,
    question,
    expectedAnswer,
    userAnswer,
    previousAnswers,
}) {
    const prompt = `
You are a live interviewer. Decide whether to ask ONE follow-up after this answer.

Section: ${section}
Original question: ${question}
What a strong answer covers: ${expectedAnswer || "Not specified"}
Candidate answer: ${userAnswer}

Recent answers (context only):
${JSON.stringify((previousAnswers || []).slice(-2).map((a) => ({
        question: a.question,
        userAnswer: a.userAnswer,
    })), null, 2)}

Ask a follow-up ONLY when the answer is vague, incomplete, contradictory, or mentions something worth probing.
Do NOT follow up if the answer is already complete and specific.
If you follow up, the question must reference something the candidate actually said.
`

    const response = await generateContentWithRetry({
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "object",
                properties: {
                    shouldFollowUp: { type: "boolean" },
                    question: { type: "string" },
                    intention: { type: "string" },
                    expectedAnswer: { type: "string" },
                },
                required: ["shouldFollowUp"],
            },
        },
    }, {
        models: [GEMINI_FAST],
        maxAttemptsPerModel: 1,
        timeoutMs: 20_000,
        route: "generateFollowUpQuestion",
    })

    return parseGeminiJson(response.text)
}

module.exports = {
    generateInterviewReport,
    generateResumePdf,
    generateMockInterviewReport,
    generateFreshMockQuestions,
    generateFollowUpQuestion,
}