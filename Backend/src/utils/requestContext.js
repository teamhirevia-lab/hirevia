const { AsyncLocalStorage } = require("async_hooks")

const storage = new AsyncLocalStorage()

function runWithContext(ctx, fn) {
    const parent = storage.getStore() || {}
    return storage.run({ ...parent, ...ctx }, fn)
}

function getContext() {
    return storage.getStore() || {}
}

function setContext(patch) {
    const store = storage.getStore()
    if (store) Object.assign(store, patch)
}

function getCorrelationId() {
    return getContext().correlationId || "-"
}

module.exports = {
    runWithContext,
    getContext,
    setContext,
    getCorrelationId,
}
