// Live usage from Claude Code (fork addition).
//
// Claude Code hands its statusline the account's rate limits from the headers of its own
// API responses. A statusline that stores them (see README, "Live usage from Claude Code")
// writes ${CLAUDE_CONFIG_DIR:-~/.claude}/cache/usage-cache.json:
//   { timestamp: <ms the reading was observed>,
//     data: { fiveHour: { percentage, resetsAt } | null, weekly: { … } | null } }
// The widget shows those numbers and asks the usage API only for what they lack.
//
// Plain helpers for main.qml, also loaded by tests/liveUsage.test.js under node's vm:
// top-level function declarations only, no QML API, no .pragma or .import.

// One window of the file: null when absent, undefined when malformed
function parseLiveBucket(bucket) {
    if (bucket === null || bucket === undefined) return null
    if (typeof bucket !== "object") return undefined
    var percent = bucket.percentage
    if (typeof percent !== "number" || !isFinite(percent) || percent < 0 || percent > 100) return undefined
    var resetMs = null
    if (bucket.resetsAt !== null && bucket.resetsAt !== undefined) {
        resetMs = new Date(bucket.resetsAt).getTime()
        if (!isFinite(resetMs)) return undefined
    }
    return { percent: percent, resetMs: resetMs }
}

// Returns { observedAt, session, sessionResetMs, weekly, weeklyResetMs } with session or
// weekly null for a missing window, or null when the text is no usable reading (unparseable,
// malformed, no window at all, or observed more than a minute in the future).
function parseLiveUsage(text, now) {
    var obj
    try {
        obj = JSON.parse(text)
    } catch (e) {
        return null
    }
    if (!obj || typeof obj !== "object") return null
    var observedAt = obj.timestamp
    if (typeof observedAt !== "number" || !isFinite(observedAt) || observedAt <= 0) return null
    if (observedAt > now + 60000) return null
    var data = obj.data
    if (!data || typeof data !== "object") return null
    var five = parseLiveBucket(data.fiveHour)
    var week = parseLiveBucket(data.weekly)
    if (five === undefined || week === undefined) return null
    if (five === null && week === null) return null
    return {
        observedAt: observedAt,
        session: five ? five.percent : null,
        sessionResetMs: five ? five.resetMs : null,
        weekly: week ? week.percent : null,
        weeklyResetMs: week ? week.resetMs : null
    }
}

// Recent enough to stand in for the usage API. A reading up to a minute in the future
// (clock skew between processes) counts as fresh.
function liveIsFresh(observedAt, now, freshMs) {
    if (!(observedAt > 0)) return false
    var age = now - observedAt
    return age >= -60000 && age < freshMs
}

// Only a reading newer than what is shown replaces it, whatever its source
function shouldApplyLive(observedAt, lastSuccessTime) {
    return observedAt > lastSuccessTime
}

// While live numbers are fresh the API is only asked for the extras (model limits, extra
// usage), every detailsMs
function apiNeeded(now, liveFresh, lastApiSuccess, detailsMs) {
    return !liveFresh || now - lastApiSuccess >= detailsMs
}

// The rate-limit state is only shown while no fresh live numbers cover for the API
function rateLimitShown(hasRateLimitError, liveFresh) {
    return hasRateLimitError && !liveFresh
}

// Model limits come only from the API: they are stale when the API has not answered for
// three detail intervals (or, before its first answer in this run, when the data is stale)
function modelLimitsStale(now, lastApiSuccess, detailsMs, isStale) {
    return lastApiSuccess > 0 ? now - lastApiSuccess > 3 * detailsMs : isStale
}

// The value and reset time to show for one window. A reading without the window keeps the
// shown value while its reset is still ahead (a reading can lack a window that still
// exists); once that reset has passed, or was never known, the window is empty. A reading
// whose window has already reset (an old file) also means an empty window. A reading with
// the window but no reset time keeps a reset that is still ahead.
// Returns { percent, resetMs } (resetMs null = unknown).
function resolveBucket(newPercent, newResetMs, oldPercent, oldResetMs, now) {
    var oldResetAhead = oldResetMs !== null && oldResetMs !== undefined && oldResetMs > now
    if (newResetMs !== null && newResetMs !== undefined && newResetMs <= now) return { percent: 0, resetMs: null }
    if (newPercent !== null && newPercent !== undefined) {
        if (newResetMs !== null && newResetMs !== undefined) return { percent: newPercent, resetMs: newResetMs }
        return { percent: newPercent, resetMs: oldResetAhead ? oldResetMs : null }
    }
    if (oldResetAhead) return { percent: oldPercent, resetMs: oldResetMs }
    return { percent: 0, resetMs: null }
}
