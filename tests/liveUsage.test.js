// Tests for contents/ui/liveUsage.js (fork addition). Run: node --test tests/*.test.js
// The file is loaded the way QML sees it: as a plain script whose top-level functions
// become globals of a fresh context.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const ctx = vm.createContext({})
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'contents', 'ui', 'liveUsage.js'), 'utf8'), ctx)
const L = ctx
const NOW = Date.parse('2026-11-07T18:00:00Z')
const MIN = 60000

const file = (timestamp, data) => JSON.stringify({ timestamp, data })

test('parseLiveUsage: weekly-only reading', () => {
    const u = L.parseLiveUsage(file(NOW - MIN, { fiveHour: null, weekly: { percentage: 93.4, resetsAt: '2026-11-11T06:00:00.000Z' } }), NOW)
    assert.strictEqual(u.observedAt, NOW - MIN)
    assert.strictEqual(u.session, null)
    assert.strictEqual(u.sessionResetMs, null)
    assert.strictEqual(u.weekly, 93.4)
    assert.strictEqual(u.weeklyResetMs, Date.parse('2026-11-11T06:00:00.000Z'))
})

test('parseLiveUsage: both windows, API-style reset with microseconds and offset', () => {
    const u = L.parseLiveUsage(file(NOW, { fiveHour: { percentage: 12, resetsAt: '2026-11-07T20:00:00.016384+00:00' }, weekly: { percentage: 40, resetsAt: null } }), NOW)
    assert.strictEqual(u.session, 12)
    assert.ok(Math.abs(u.sessionResetMs - Date.parse('2026-11-07T20:00:00Z')) < 1000)
    assert.strictEqual(u.weekly, 40)
    assert.strictEqual(u.weeklyResetMs, null)
})

test('parseLiveUsage: rejects what is not a usable reading', () => {
    const ok = { fiveHour: null, weekly: { percentage: 50, resetsAt: null } }
    const cases = {
        'not json': 'garbage',
        'empty': '',
        'no timestamp': JSON.stringify({ data: ok }),
        'string timestamp': JSON.stringify({ timestamp: String(NOW), data: ok }),
        'zero timestamp': file(0, ok),
        'future > 1 min': file(NOW + 2 * MIN, ok),
        'no data': JSON.stringify({ timestamp: NOW }),
        'no window': file(NOW, { fiveHour: null, weekly: null }),
        'percent > 100': file(NOW, { fiveHour: null, weekly: { percentage: 101, resetsAt: null } }),
        'percent negative': file(NOW, { fiveHour: null, weekly: { percentage: -1, resetsAt: null } }),
        'percent string': file(NOW, { fiveHour: null, weekly: { percentage: '50', resetsAt: null } }),
        'bad reset': file(NOW, { fiveHour: null, weekly: { percentage: 50, resetsAt: 'soon' } }),
        'bucket not object': file(NOW, { fiveHour: 5, weekly: { percentage: 50, resetsAt: null } }),
        'legacy single format': JSON.stringify({ timestamp: NOW, data: { percentage: 50, resetsAt: null } })
    }
    for (const [name, text] of Object.entries(cases)) assert.strictEqual(L.parseLiveUsage(text, NOW), null, name)
    assert.ok(L.parseLiveUsage(file(NOW + 30000, ok), NOW), 'up to a minute ahead is accepted')
})

test('liveIsFresh', () => {
    assert.strictEqual(L.liveIsFresh(NOW - 9 * MIN, NOW, 10 * MIN), true)
    assert.strictEqual(L.liveIsFresh(NOW - 10 * MIN, NOW, 10 * MIN), false)
    assert.strictEqual(L.liveIsFresh(NOW + 30000, NOW, 10 * MIN), true)
    assert.strictEqual(L.liveIsFresh(NOW + 2 * MIN, NOW, 10 * MIN), false)
    assert.strictEqual(L.liveIsFresh(0, NOW, 10 * MIN), false)
})

test('shouldApplyLive', () => {
    assert.strictEqual(L.shouldApplyLive(NOW, NOW - 1), true)
    assert.strictEqual(L.shouldApplyLive(NOW, NOW), false)
    assert.strictEqual(L.shouldApplyLive(NOW - 6 * MIN, NOW - 2 * 3600000), true, 'older than fresh but newer than shown')
})

test('apiNeeded', () => {
    assert.strictEqual(L.apiNeeded(NOW, false, NOW, 15 * MIN), true, 'no fresh live data')
    assert.strictEqual(L.apiNeeded(NOW, true, NOW - 5 * MIN, 15 * MIN), false, 'fresh, details not due')
    assert.strictEqual(L.apiNeeded(NOW, true, NOW - 15 * MIN, 15 * MIN), true, 'fresh, details due')
    assert.strictEqual(L.apiNeeded(NOW, true, 0, 15 * MIN), true, 'never asked')
})

test('rateLimitShown', () => {
    assert.strictEqual(L.rateLimitShown(true, false), true)
    assert.strictEqual(L.rateLimitShown(true, true), false)
    assert.strictEqual(L.rateLimitShown(false, false), false)
})

test('modelLimitsStale', () => {
    assert.strictEqual(L.modelLimitsStale(NOW, NOW - 44 * MIN, 15 * MIN, false), false)
    assert.strictEqual(L.modelLimitsStale(NOW, NOW - 46 * MIN, 15 * MIN, false), true)
    assert.strictEqual(L.modelLimitsStale(NOW, 0, 15 * MIN, true), true, 'before the first answer: follows isStale')
    assert.strictEqual(L.modelLimitsStale(NOW, 0, 15 * MIN, false), false)
})

test('resolveBucket', () => {
    const later = NOW + 3600000, earlier = NOW - 3600000
    assert.deepStrictEqual({ ...L.resolveBucket(40, later, 30, earlier, NOW) }, { percent: 40, resetMs: later }, 'new value and reset')
    assert.deepStrictEqual({ ...L.resolveBucket(40, null, 30, later, NOW) }, { percent: 40, resetMs: later }, 'new value keeps a reset still ahead')
    assert.deepStrictEqual({ ...L.resolveBucket(40, null, 30, earlier, NOW) }, { percent: 40, resetMs: null }, 'new value drops a passed reset')
    assert.deepStrictEqual({ ...L.resolveBucket(0, later, 95, later, NOW) }, { percent: 0, resetMs: later }, 'a real 0 is taken')
    assert.deepStrictEqual({ ...L.resolveBucket(null, null, 95, later, NOW) }, { percent: 95, resetMs: later }, 'missing window, reset ahead: kept (no false quota reset)')
    assert.deepStrictEqual({ ...L.resolveBucket(null, null, 23, earlier, NOW) }, { percent: 0, resetMs: null }, 'missing window, reset passed: empty')
    assert.deepStrictEqual({ ...L.resolveBucket(undefined, undefined, 23, null, NOW) }, { percent: 0, resetMs: null }, 'missing window, reset unknown: empty')
    assert.deepStrictEqual({ ...L.resolveBucket(98, earlier, 98, earlier, NOW) }, { percent: 0, resetMs: null }, 'reading from a window that has reset: empty')
    assert.deepStrictEqual({ ...L.resolveBucket(98, NOW, 40, later, NOW) }, { percent: 0, resetMs: null }, 'resetting exactly now: empty')
    // rollOverPassedWindows re-checks the shown window against itself
    assert.deepStrictEqual({ ...L.resolveBucket(98, later, 98, later, NOW) }, { percent: 98, resetMs: later }, 'shown window, reset ahead: unchanged')
    assert.deepStrictEqual({ ...L.resolveBucket(98, null, 98, null, NOW) }, { percent: 98, resetMs: null }, 'shown window, reset unknown: unchanged')
})
