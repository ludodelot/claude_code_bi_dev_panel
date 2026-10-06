const test = require('node:test')
const assert = require('node:assert/strict')
const A = require('../extension/analytics')

const HOUR = 3600000
const NOW = Date.now()

const stateWith = (overrides = {}) => ({
  updatedAt: NOW,
  startedAt: NOW - 2 * HOUR,
  usd: 4,
  contextPercent: 30,
  totals: { input: 100, output: 50, cacheRead: 800, cacheWrite: 100 },
  limits: [{ kind: 'five_hour', percentUsed: 40, resetsAt: new Date(NOW + 2 * HOUR).toISOString() }],
  ...overrides,
})

test('toneFor and colorFor map percentages to theme tokens', () => {
  assert.equal(A.toneFor(10), 'ok')
  assert.equal(A.toneFor(60), 'warn')
  assert.equal(A.toneFor(85), 'hot')
  assert.equal(A.colorFor(90), 'var(--hot)')
})

test('cacheHitRate is null without prompt data and a percentage otherwise', () => {
  assert.equal(A.cacheHitRate({}), null)
  assert.equal(A.cacheHitRate({ input: 100, cacheWrite: 100, cacheRead: 800 }), 80)
})

test('tokenParts totals every bucket', () => {
  const { parts, total } = A.tokenParts({ input: 1, output: 2, cacheRead: 3, cacheWrite: 4 })
  assert.equal(parts.length, 4)
  assert.equal(total, 10)
})

test('costPerHour needs a minimum elapsed span and spend', () => {
  assert.equal(A.costPerHour(stateWith({ startedAt: NOW - 60000 })), null)
  assert.equal(A.costPerHour(stateWith({ usd: 0 })), null)
  assert.equal(A.costPerHour(stateWith()), 2)
})

test('paceInfo returns null when the limit has no reset time', () => {
  assert.equal(A.paceInfo([], 'five', stateWith({ limits: [] })), null)
})

test('paceInfo projects hitting 100% when usage grows quickly', () => {
  const state = stateWith({ limits: [{ kind: 'five_hour', percentUsed: 60, resetsAt: new Date(NOW + HOUR).toISOString() }] })
  const fr = state.limits[0].resetsAt
  const history = [
    { t: NOW - 20 * 60000, f: 20, fr },
    { t: NOW - 10 * 60000, f: 40, fr },
    { t: NOW, f: 60, fr },
  ]
  const info = A.paceInfo(history, 'five', state)
  assert.ok(info.slope > 0)
  assert.equal(info.willHit, true)
  assert.ok(info.timeTo100 > NOW)
})

test('paceInfo reports a steady window without growth', () => {
  const state = stateWith()
  const fr = state.limits[0].resetsAt
  const info = A.paceInfo([{ t: NOW - 600000, f: 40, fr }], 'five', state)
  assert.equal(info.slope, 0)
  assert.equal(info.willHit, false)
})

test('contextInsight escalates with usage', () => {
  assert.equal(A.contextInsight(10).tone, 'ok')
  assert.equal(A.contextInsight(70).tone, 'warn')
  assert.equal(A.contextInsight(90).tone, 'hot')
  assert.equal(A.contextInsight(undefined), null)
})

test('cacheInsight flags low reuse', () => {
  assert.equal(A.cacheInsight(null), null)
  assert.equal(A.cacheInsight(30).tone, 'warn')
  assert.equal(A.cacheInsight(95).tone, 'ok')
})

test('buildInsights never throws on sparse state', () => {
  const sparse = stateWith({ limits: [], totals: undefined, contextPercent: undefined, usd: 0 })
  assert.ok(Array.isArray(A.buildInsights([], sparse)))
})

test('sessionSamples keeps only numeric samples from this session', () => {
  const state = stateWith()
  const history = [
    { t: state.startedAt - 1, c: 5 },
    { t: state.startedAt + 1, c: 10 },
    { t: state.startedAt + 2, c: null },
  ]
  assert.deepEqual(A.sessionSamples(history, state, 'c'), [{ t: state.startedAt + 1, v: 10 }])
})
