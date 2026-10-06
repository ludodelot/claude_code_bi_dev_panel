const test = require('node:test')
const assert = require('node:assert/strict')
const { forecastFor, suggest } = require('../extension/advisor')

const HOUR = 3600000
const MIN = 60000
const NOW = Date.now()

const limit = (kind, pct, hoursToReset) => ({ kind, percentUsed: pct, resetsAt: new Date(NOW + hoursToReset * HOUR).toISOString() })

const stateWith = (overrides = {}) => ({
  updatedAt: NOW,
  startedAt: NOW - HOUR,
  usd: 2,
  contextPercent: 30,
  totals: { input: 100, output: 50, cacheRead: 900, cacheWrite: 100 },
  limits: [limit('five_hour', 40, 3), limit('seven_day', 20, 100)],
  ...overrides,
})

// Samples that climb 20 points every 10 minutes for the given reset marker.
const climbing = (resetsAt, field = 'f', resetField = 'fr') =>
  [20, 40, 60].map((v, i) => ({ t: NOW - (2 - i) * 10 * MIN, [field]: v, [resetField]: resetsAt }))

test('forecastFor reports no reading without a limit', () => {
  const f = forecastFor('five', [], stateWith({ limits: [] }), NOW)
  assert.equal(f.available, false)
})

test('forecastFor warns when the pace exhausts the limit before reset', () => {
  const state = stateWith({ limits: [limit('five_hour', 60, 4), limit('seven_day', 20, 100)] })
  const f = forecastFor('five', climbing(state.limits[0].resetsAt), state, NOW)
  assert.equal(f.willHit, true)
  assert.ok(f.hitAt > NOW)
  assert.match(f.headline, /^Runs out /)
  assert.match(f.detail, /before it resets/)
})

test('forecastFor is critical when the limit runs out within the hour', () => {
  const state = stateWith({ limits: [limit('five_hour', 60, 4), limit('seven_day', 20, 100)] })
  const f = forecastFor('five', climbing(state.limits[0].resetsAt), state, NOW)
  assert.equal(f.tone, 'hot')
})

test('forecastFor says the limit lasts when growth is slow', () => {
  const state = stateWith({ limits: [limit('five_hour', 12, 1), limit('seven_day', 20, 100)] })
  const fr = state.limits[0].resetsAt
  const history = [
    { t: NOW - 10 * MIN, f: 10, fr },
    { t: NOW, f: 12, fr },
  ]
  const f = forecastFor('five', history, state, NOW)
  assert.equal(f.willHit, false)
  assert.equal(f.tone, 'ok')
  assert.equal(f.headline, 'Lasts until reset')
})

test('forecastFor flags a reached limit', () => {
  const state = stateWith({ limits: [limit('five_hour', 100, 2), limit('seven_day', 20, 100)] })
  assert.equal(forecastFor('five', [], state, NOW).headline, 'Limit reached')
})

test('suggest recommends /compact only when context is high', () => {
  const calm = suggest({ state: stateWith({ contextPercent: 40 }), history: [], activity: null, now: NOW })
  assert.ok(!calm.some(s => s.command === '/compact'))
  const warn = suggest({ state: stateWith({ contextPercent: 75 }), history: [], activity: null, now: NOW })
  assert.equal(warn.find(s => s.command === '/compact').tone, 'warn')
  const hot = suggest({ state: stateWith({ contextPercent: 90 }), history: [], activity: null, now: NOW })
  assert.equal(hot.find(s => s.command === '/compact').tone, 'hot')
})

test('suggest proposes switching model when a limit will run out', () => {
  const state = stateWith({ limits: [limit('five_hour', 60, 4), limit('seven_day', 20, 100)] })
  const out = suggest({ state, history: climbing(state.limits[0].resetsAt), activity: null, now: NOW })
  assert.ok(out.some(s => s.id === 'five-hit' && s.command === '/model'))
})

test('suggest warns about low cache reuse only after a meaningful session', () => {
  const low = { input: 900, output: 50, cacheRead: 100, cacheWrite: 100 }
  const shortSession = suggest({ state: stateWith({ totals: low, startedAt: NOW - 5 * MIN }), history: [], activity: null, now: NOW })
  assert.ok(!shortSession.some(s => s.id === 'cache-low'))
  const longSession = suggest({ state: stateWith({ totals: low, startedAt: NOW - HOUR }), history: [], activity: null, now: NOW })
  assert.ok(longSession.some(s => s.id === 'cache-low'))
})

test('suggest flags Opus used by read-only exploration agents', () => {
  const activity = { agents: [{ status: 'running', model: 'claude-opus-5-5', type: 'Explore' }], sessions: [] }
  const out = suggest({ state: stateWith(), history: [], activity, now: NOW })
  assert.ok(out.some(s => s.id === 'agent-model'))
})

test('suggest flags a prompt that dominates the session', () => {
  const task = (id, burned) => ({ id, burned })
  const activity = { agents: [], sessions: [{ active: true, tasks: [task('a', 300000), task('b', 50000)] }] }
  const out = suggest({ state: stateWith(), history: [], activity, now: NOW })
  assert.ok(out.some(s => s.id === 'task-dominant'))
})

test('suggest returns a single healthy item when nothing needs attention', () => {
  const out = suggest({ state: stateWith(), history: [], activity: null, now: NOW })
  assert.deepEqual(out.map(s => s.id), ['all-good'])
})

test('suggest sorts critical items first and caps the list', () => {
  const state = stateWith({ contextPercent: 90, limits: [limit('five_hour', 60, 4), limit('seven_day', 20, 100)], totals: { input: 900, output: 5, cacheRead: 10, cacheWrite: 10 }, startedAt: NOW - 5 * HOUR })
  const activity = { agents: [1, 2, 3, 4].map(() => ({ status: 'running', model: 'claude-opus-5-5', type: 'Explore' })), sessions: [] }
  const out = suggest({ state, history: climbing(state.limits[0].resetsAt), activity, now: NOW })
  assert.ok(out.length <= 5)
  assert.equal(out[0].tone, 'hot')
})

test('suggest returns nothing without state', () => {
  assert.deepEqual(suggest({ state: null, history: [], activity: null, now: NOW }), [])
})
