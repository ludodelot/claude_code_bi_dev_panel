// In the webview format.js runs first and declares Format; in Node we require it.
const fmt = typeof Format !== 'undefined' ? Format : require('./format')

const WARN_AT = 60
const HOT_AT = 85
const ACTIVE_MS = 20000
const MIN_SLOPE_SPAN_MS = 3 * 60000
const RESET_MATCH_MS = 60000
const HOUR_MS = 3600000
const DAY_MS = 24 * HOUR_MS
const MIN_DAILY_SPAN_MS = DAY_MS
const MIN_RATE_SPAN_MS = 2 * 60000
const GOOD_CACHE_HIT = 80
const LOW_CACHE_HIT = 50
const LOOKBACK_MS = { five: 30 * 60000, seven: 6 * HOUR_MS }
const WINDOW_MS = { five: 5 * HOUR_MS, seven: 7 * 24 * HOUR_MS }
const LIMIT_KIND = { five: 'five_hour', seven: 'seven_day' }
const HISTORY_FIELDS = { five: ['f', 'fr'], seven: ['s', 'sr'] }
const LIMIT_NAME = { five: '5-hour', seven: '7-day' }

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

const toneFor = p => (p >= HOT_AT ? 'hot' : p >= WARN_AT ? 'warn' : 'ok')
const TONE_COLOR = { hot: 'var(--hot)', warn: 'var(--warn)', ok: 'var(--ok)' }
const colorFor = p => TONE_COLOR[toneFor(p)]


const limitOf = (state, kind) => (state.limits || []).find(l => l.kind === LIMIT_KIND[kind])

function pointsFor(history, kind, limit, state) {
  const [valueKey, resetKey] = HISTORY_FIELDS[kind]
  const end = Date.parse(limit.resetsAt)
  const pts = history
    .filter(h => h[resetKey] && Math.abs(Date.parse(h[resetKey]) - end) < RESET_MATCH_MS && typeof h[valueKey] === 'number')
    .map(h => ({ t: h.t, v: h[valueKey] }))
  const last = pts[pts.length - 1]
  if (!last || last.t < state.updatedAt) pts.push({ t: state.updatedAt, v: limit.percentUsed })
  return pts
}

function slopeOf(kind, pts) {
  const last = pts[pts.length - 1]
  const first = pts.find(pt => pt.t >= last.t - LOOKBACK_MS[kind])
  const dt = last.t - first.t
  return dt >= MIN_SLOPE_SPAN_MS && last.v > first.v ? (last.v - first.v) / dt : 0
}

// The weekly limit is judged by the average spend per day since the window opened, so nights and idle
// stretches count as part of the rhythm. Under one day of data the span is floored to avoid wild projections.
function dailyAverageSlope(percentUsed, start, now) {
  const elapsed = Math.max(now - start, MIN_DAILY_SPAN_MS)
  return percentUsed > 0 ? percentUsed / elapsed : 0
}

function paceInfo(history, kind, state) {
  const limit = limitOf(state, kind)
  if (!limit || !limit.resetsAt) return null
  const end = Date.parse(limit.resetsAt)
  const start = end - WINDOW_MS[kind]
  const pts = pointsFor(history, kind, limit, state)
  const last = pts[pts.length - 1]
  const slope = kind === 'seven' ? dailyAverageSlope(last.v, start, last.t) : pts.length >= 2 ? slopeOf(kind, pts) : 0
  const timeTo100 = slope > 0 ? last.t + (100 - last.v) / slope : Infinity
  const projEnd = Math.min(timeTo100, end)
  const projP = slope > 0 ? last.v + slope * (projEnd - last.t) : last.v
  const evenPace = clamp((Date.now() - start) / (end - start), 0, 1) * 100
  return {
    limit, start, end, pts, last, slope, timeTo100, projEnd, projP,
    avgPerDay: slope * DAY_MS,
    willHit: timeTo100 < end,
    aheadOfEven: limit.percentUsed - evenPace,
  }
}

function tokenParts(totals) {
  const t = totals || {}
  const parts = [
    { key: 'input', name: 'New input', icon: 'up', value: t.input || 0 },
    { key: 'cacheWrite', name: 'Cache write', icon: 'database', value: t.cacheWrite || 0 },
    { key: 'cacheRead', name: 'Cache read', icon: 'zap', value: t.cacheRead || 0 },
    { key: 'output', name: 'Generated', icon: 'down', value: t.output || 0 },
  ]
  const total = parts.reduce((sum, p) => sum + p.value, 0)
  return { parts, total }
}

function cacheHitRate(totals) {
  const t = totals || {}
  const prompt = (t.input || 0) + (t.cacheWrite || 0) + (t.cacheRead || 0)
  return prompt > 0 ? ((t.cacheRead || 0) / prompt) * 100 : null
}

const sessionSamples = (history, state, key) =>
  history
    .filter(h => h.t >= state.startedAt && typeof h[key] === 'number')
    .map(h => ({ t: h.t, v: h[key] }))

function costPerHour(state) {
  const elapsed = state.updatedAt - state.startedAt
  return elapsed >= MIN_RATE_SPAN_MS && state.usd > 0 ? state.usd / (elapsed / HOUR_MS) : null
}

function paceInsight(kind, info) {
  const name = LIMIT_NAME[kind] + ' limit'
  if (info.willHit) {
    const eta = info.timeTo100 - Date.now()
    return {
      icon: 'flame',
      tone: eta < HOUR_MS ? 'hot' : 'warn',
      title: name + ' may run out',
      text: (kind === 'seven' ? 'Averaging ' + Math.round(info.avgPerDay) + '% per day, ' : 'At the current pace ') + 'you hit 100% in about ' + fmt.span(eta) + ', before it resets.',
    }
  }
  if (info.slope > 0) {
    const rhythm = kind === 'seven' ? 'Averaging ' + Math.round(info.avgPerDay) + '% per day, projected' : 'Projected'
    return { icon: 'trend', tone: 'ok', title: name + ' on track', text: rhythm + ' to end this window around ' + Math.round(info.projP) + '%.' }
  }
  return { icon: 'check', tone: 'ok', title: name + ' steady', text: 'No recent growth, so there is plenty of room.' }
}

function cacheInsight(hit) {
  if (hit === null) return null
  const pct = Math.round(hit)
  if (hit >= GOOD_CACHE_HIT) {
    return { icon: 'database', tone: 'ok', title: 'Cache is paying off', text: pct + '% of the prompt is served from cache, which is faster and cheaper.' }
  }
  if (hit < LOW_CACHE_HIT) {
    return { icon: 'database', tone: 'warn', title: 'Low cache reuse', text: 'Only ' + pct + '% of the prompt comes from cache. Long pauses or context edits break it.' }
  }
  return { icon: 'database', tone: 'info', title: 'Cache warming up', text: pct + '% of the prompt comes from cache and it improves as the session continues.' }
}

function contextInsight(percentUsed) {
  if (typeof percentUsed !== 'number') return null
  if (percentUsed >= HOT_AT) {
    return { icon: 'layers', tone: 'hot', title: 'Context almost full', text: 'At ' + percentUsed + '%, run /compact or start a fresh session.' }
  }
  if (percentUsed >= WARN_AT) {
    return { icon: 'layers', tone: 'warn', title: 'Context is filling up', text: percentUsed + '% used. Consider /compact before a big task.' }
  }
  return { icon: 'layers', tone: 'ok', title: 'Context is healthy', text: percentUsed + '% of the window used.' }
}

function costInsight(state) {
  const rate = costPerHour(state)
  if (rate === null) return null
  return { icon: 'dollar', tone: 'info', title: 'API-equivalent burn', text: 'About ' + fmt.money(rate) + ' per hour, ' + fmt.money(state.usd) + ' this session.' }
}

function buildInsights(history, state) {
  const infos = ['five', 'seven'].map(kind => [kind, paceInfo(history, kind, state)])
  const pace = infos.filter(([, info]) => info).map(([kind, info]) => paceInsight(kind, info))
  return [
    ...pace,
    cacheInsight(cacheHitRate(state.totals)),
    contextInsight(state.contextPercent),
    costInsight(state),
  ].filter(Boolean)
}

if (typeof module !== 'undefined') {
  module.exports = {
    toneFor, colorFor, clamp, limitOf, pointsFor, slopeOf, paceInfo, tokenParts, cacheHitRate,
    sessionSamples, costPerHour, paceInsight, cacheInsight, contextInsight, costInsight, buildInsights,
    HOT_AT, WARN_AT,
  }
}
