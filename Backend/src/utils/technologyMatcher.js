const AMBIGUOUS = {
    go: { test: mentionsGo, canonical: "Go" },
    golang: { test: mentionsGo, canonical: "Go" },
    node: { test: mentionsNode, canonical: "Node.js" },
    nodejs: { test: mentionsNode, canonical: "Node.js" },
    "node.js": { test: mentionsNode, canonical: "Node.js" },
    postgres: { test: mentionsPostgres, canonical: "PostgreSQL" },
    postgresql: { test: mentionsPostgres, canonical: "PostgreSQL" },
    sql: { test: mentionsSql, canonical: "SQL" },
    c: { test: mentionsC, canonical: "C" },
    r: { test: mentionsR, canonical: "R" },
}

const ALIASES = {
    kafka: ["kafka", "apache kafka"],
    redis: ["redis"],
    rabbitmq: ["rabbitmq", "rabbit mq", "rabbit"],
    docker: ["docker"],
    kubernetes: ["kubernetes", "k8s"],
    k8s: ["kubernetes", "k8s"],
    aws: ["aws", "amazon web services"],
    azure: ["azure"],
    gcp: ["gcp", "google cloud"],
    postgres: ["postgres", "postgresql", "postgre sql"],
    postgresql: ["postgres", "postgresql", "postgre sql"],
    mysql: ["mysql"],
    mongodb: ["mongodb", "mongo"],
    graphql: ["graphql"],
    grpc: ["grpc"],
    nodejs: ["node.js", "nodejs", "node js"],
    "node.js": ["node.js", "nodejs", "node js"],
    react: ["react", "react.js", "reactjs"],
    typescript: ["typescript", "ts"],
    javascript: ["javascript", "js"],
    python: ["python"],
    java: ["java"],
    golang: ["golang", "go lang"],
    go: ["golang", "go lang"],
    terraform: ["terraform"],
    elasticsearch: ["elasticsearch", "elastic search"],
    dynamodb: ["dynamodb", "dynamo db"],
    lambda: ["lambda", "aws lambda"],
    s3: ["s3"],
    nginx: ["nginx"],
    mongoose: ["mongoose"],
    prisma: ["prisma"],
    redux: ["redux"],
    nextjs: ["next.js", "nextjs"],
    "next.js": ["next.js", "nextjs"],
    sql: ["sql"],
}

const KNOWN_TECH_LEXICON = [
    "kafka", "rabbitmq", "activemq", "sqs", "sns", "pubsub", "nats", "bullmq",
    "docker", "kubernetes", "k8s", "helm", "terraform", "ansible",
    "aws", "azure", "gcp", "ec2", "s3", "lambda", "ecs", "eks", "dynamodb",
    "graphql", "grpc", "protobuf", "websocket", "webrtc",
    "redis", "memcached", "elasticsearch", "opensearch",
    "postgres", "postgresql", "mysql", "mongodb", "sqlite", "cassandra", "neo4j",
    "prisma", "mongoose", "typeorm", "sequelize", "supabase", "firebase", "nginx",
    "spark", "hadoop", "flink", "snowflake", "databricks", "bigquery",
    "rust", "golang", "java", "kotlin", "scala", "python", "django", "flask", "fastapi",
    "nodejs", "node.js", "typescript", "javascript", "react", "next.js", "nextjs",
    "vue", "angular", "svelte", "tailwind", "redux", "zustand",
    "jenkins", "prometheus", "grafana", "datadog", "opentelemetry",
    "sql",
]

function mentionsGo(text) {
    const value = String(text || "")
    return (
        /\bgolang\b/i.test(value)
        || /\bgo\s+lang\b/i.test(value)
        || /\bgo\s+(?:programming|language|modules?|routines?)\b/i.test(value)
        || /\b(?:written|coded|implemented|built|programming)\s+in\s+go\b/i.test(value)
    )
}

function mentionsNode(text) {
    const value = String(text || "")
    return (
        /\bnode\.js\b/i.test(value)
        || /\bnodejs\b/i.test(value)
        || /\bnode\s+js\b/i.test(value)
    )
}

function mentionsPostgres(text) {
    const value = String(text || "")
    return /\bpostgres(?:ql)?\b/i.test(value) || /\bpostgre\s+sql\b/i.test(value)
}

function mentionsSql(text) {
    return /(?:^|[^a-z0-9.+#])sql(?:$|[^a-z0-9.+#])/i.test(String(text || ""))
}

function mentionsC(text) {
    const value = String(text || "")
    return /\bc\s+(?:programming|language)\b/i.test(value) || /\bprogramming\s+in\s+c\b/i.test(value)
}

function mentionsR(text) {
    const value = String(text || "")
    return /\br\s+(?:programming|language)\b/i.test(value) || /\bprogramming\s+in\s+r\b/i.test(value)
}

function hasToken(keyword, targetText) {
    if (!keyword || !targetText) return false
    const cleanKey = String(keyword).toLowerCase().trim()
    if (!cleanKey || cleanKey.length <= 1 && !AMBIGUOUS[cleanKey]) return false
    if (AMBIGUOUS[cleanKey]) return AMBIGUOUS[cleanKey].test(targetText)
    const escaped = cleanKey.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")
    const regex = new RegExp(`(?:^|[^a-z0-9.+#])${escaped}(?:$|[^a-z0-9.+#])`, "i")
    return regex.test(targetText)
}

function skillAppearsInText(skill, targetText) {
    if (!skill || !targetText) return false
    const clean = String(skill).toLowerCase().trim()
    if (hasToken(clean, targetText)) return true

    const aliases = ALIASES[clean]
    if (aliases && aliases.some((alias) => hasToken(alias, targetText))) return true

    const tokens = clean.split(/[\s,/|()]+/).filter((token) => token.length > 2)
    return tokens.some((token) => {
        if (ALIASES[token]) {
            return ALIASES[token].some((alias) => hasToken(alias, targetText))
        }
        return hasToken(token, targetText)
    })
}

function canonicalTechName(tech) {
    const clean = String(tech || "").toLowerCase().trim()
    if (AMBIGUOUS[clean]) return AMBIGUOUS[clean].canonical
    if (clean === "k8s") return "Kubernetes"
    if (clean === "javascript") return "JavaScript"
    if (clean === "typescript") return "TypeScript"
    return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : ""
}

function findUnverifiedForeignTech(questionText, corpusText) {
    if (!questionText) return null
    const seen = new Set()
    for (const tech of KNOWN_TECH_LEXICON) {
        const canonical = canonicalTechName(tech)
        if (seen.has(canonical)) continue
        seen.add(canonical)
        if (skillAppearsInText(tech, questionText) && !skillAppearsInText(tech, corpusText || "")) {
            return canonical
        }
    }
    return null
}

module.exports = {
    KNOWN_TECH_LEXICON,
    skillAppearsInText,
    canonicalTechName,
    findUnverifiedForeignTech,
}
