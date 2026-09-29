function redactSecrets(value) {
    return String(value ?? "")
        .replace(/([a-z][a-z0-9+.-]*:\/\/)[^:\s/@]+:[^@\s/]+@/gi, "$1[redacted]@")
        .replace(/([?&](?:key|api[_-]?key|access[_-]?token|token|secret|password)=)[^&\s'"]+/gi, "$1[redacted]")
        .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g, "[redacted]")
}

function logSafeError(label, err) {
    const status = err?.status || err?.code || err?.name || "Error"
    const message = redactSecrets(err?.message || "")
    console.error(label, status, message)
}

module.exports = {
    redactSecrets,
    logSafeError,
}
