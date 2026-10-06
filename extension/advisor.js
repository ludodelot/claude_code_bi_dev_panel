// Forecast and suggestion rules. Pure functions: shared by the webview (concatenated script) and the tests (require).
// In the webview analytics.js runs first, so its helpers are globals; in Node they are required.
const Adv = (() => {
  const base = typeof paceInfo !== 'undefined' ? { paceInfo, limitOf, cacheHitRate, fmt: Format } : { ...require('./analytics'), fmt: require('./format') }

  const MINUTE_MS = 60000
  const HOUR_MS = 3600000
  const CONTEXT_COMPACT_WARN = 70
  const CONTEXT_COMPACT_HOT = 85
  const LIMIT_NEAR_END = 90
  const HIT_SOON_MS = HOUR_MS
  const LOW_CACHE_HIT = 50
  const MIN_CACHE_SESSION_MS = 20 * MINUTE_MS
  const LONG_SESSION_MS = 4 * HOUR_MS
  const LONG_SESSION_CONTEXT = 40
  const PARALLEL_AGENTS = 4
  const DOMINANT_SHARE = 0.5
  const DOMINANT_MIN_TOKENS = 200000
  const MAX_SUGGESTIONS = 5
  const CHEAP_WORK_AGENTS = ['Explore', 'code-explorer', 'docs-lookup']
  const TONE_RANK = { hot: 0, warn: 1, info: 2, ok: 3 }
  const WINDOW_NAME = { five: '5-hour', seven: '7-day' }

  const timeLabel = (kind, ms) => (kind === 'five' ? base.fmt.clock(ms) : base.fmt.dayClock(ms))

  // What the burn rate means for one limit window: when it runs out, or where it will end.
  function forecastFor(kind, history, state, now) {
    const info = base.paceInfo(history, kind, state)
    const name = WINDOW_NAME[kind]
    if (!info) return { kind, name, available: false, tone: 'info', headline: 'No reading yet', detail: 'Send a message in Claude Code to start the forecast.' }
    const pct = info.limit.percentUsed
    const reset = base.fmt.span(info.end - now)
    const common = { kind, name, available: true, pct, projPct: info.projP, resetAt: info.end, resetLabel: timeLabel(kind, info.end), resetIn: reset, willHit: info.willHit, slope: info.slope }
    if (pct >= 100) return { ...common, tone: 'hot', headline: 'Limit reached', detail: 'Resets in ' + reset + ' (' + common.resetLabel + ').' }
    if (info.willHit) {
      const eta = info.timeTo100 - now
      const early = info.end - info.timeTo100
      return {
        ...common,
        tone: eta < HIT_SOON_MS ? 'hot' : 'warn',
        hitAt: info.timeTo100,
        hitLabel: timeLabel(kind, info.timeTo100),
        earlyBy: base.fmt.span(early),
        headline: 'Runs out ' + timeLabel(kind, info.timeTo100),
        detail: 'In ' + base.fmt.span(eta) + ', ' + base.fmt.span(early) + ' before it resets.',
      }
    }
    if (info.slope > 0) {
      return { ...common, tone: 'ok', headline: 'Lasts until reset', detail: 'Projected ' + Math.round(info.projP) + '% when it resets in ' + reset + '.' }
    }
    return { ...common, tone: 'ok', headline: 'Steady', detail: 'No recent growth. Resets in ' + reset + '.' }
  }

  const item = (id, tone, icon, title, why, command) => ({ id, tone, icon, title, why, command: command || null })

  function contextRule(ctx) {
    if (typeof ctx !== 'number' || ctx < CONTEXT_COMPACT_WARN) return null
    if (ctx >= CONTEXT_COMPACT_HOT) {
      return item('ctx-hot', 'hot', 'layers', 'Compact now', 'Context is at ' + ctx + '%. Compact before the next big step so it does not auto-compact mid-task and lose detail.', '/compact')
    }
    return item('ctx-warn', 'warn', 'layers', 'Compact at the next pause', 'Context is at ' + ctx + '%. Compacting now keeps answers sharp and the cache cheaper.', '/compact')
  }

  function limitRule(kind, forecast) {
    if (!forecast.available || forecast.tone === 'ok') return null
    const name = forecast.name + ' limit'
    if (forecast.pct >= 100) return item(kind + '-gone', 'hot', 'flame', name + ' reached', 'Work resumes ' + forecast.resetLabel + '. Plan offline work until then.', null)
    const nearEnd = forecast.pct >= LIMIT_NEAR_END
    const why = nearEnd
      ? 'At ' + Math.round(forecast.pct) + '% already. Move routine work to a lighter model.'
      : 'At this pace it runs out ' + forecast.hitLabel + ', ' + forecast.earlyBy + ' before it resets at ' + forecast.resetLabel + '. Move routine work to a lighter model or pause until then.'
    return item(kind + '-hit', forecast.tone, 'flame', name + ' may run out', why, '/model')
  }

  function cacheRule(state, history) {
    const hit = base.cacheHitRate(state.totals)
    const elapsed = state.updatedAt - state.startedAt
    if (hit === null || hit >= LOW_CACHE_HIT || elapsed < MIN_CACHE_SESSION_MS) return null
    return item('cache-low', 'warn', 'database', 'Cache reuse is low (' + Math.round(hit) + '%)', 'Pauses over 5 minutes expire the cache. Batch related prompts and avoid editing CLAUDE.md or MCP servers mid-session.', null)
  }

  function agentRules(activity) {
    const running = ((activity && activity.agents) || []).filter(a => a.status === 'running')
    const rules = []
    const costlyScouts = running.filter(a => /opus/i.test(a.model || '') && CHEAP_WORK_AGENTS.includes(a.type))
    if (costlyScouts.length) {
      rules.push(item('agent-model', 'warn', 'sparkles', 'Exploration agent running on Opus', costlyScouts.length + ' read-only agent(s) use Opus. Set model: haiku or sonnet in their definition to save limit.', null))
    }
    if (running.length >= PARALLEL_AGENTS) {
      rules.push(item('agent-parallel', 'warn', 'sparkles', running.length + ' agents running in parallel', 'Parallel agents multiply token use. Wait for results before launching more.', null))
    }
    return rules
  }

  function dominantTaskRule(activity) {
    const live = ((activity && activity.sessions) || []).find(s => s.active)
    const tasks = (live && live.tasks) || []
    const total = tasks.reduce((sum, t) => sum + t.burned, 0)
    const top = tasks.reduce((best, t) => (t.burned > (best ? best.burned : 0) ? t : best), null)
    if (!top || total < DOMINANT_MIN_TOKENS || top.burned / total < DOMINANT_SHARE) return null
    const share = Math.round((top.burned / total) * 100)
    return item('task-dominant', 'info', 'bulb', 'One prompt used ' + share + '% of this session', 'Split big requests and use plan mode (Shift+Tab) first so each step stays small.', null)
  }

  function longSessionRule(state) {
    const elapsed = state.updatedAt - state.startedAt
    if (elapsed < LONG_SESSION_MS || !(state.contextPercent >= LONG_SESSION_CONTEXT)) return null
    return item('session-long', 'info', 'timer', 'Long session, new topic?', 'After ' + base.fmt.span(elapsed) + ', start unrelated work with /clear so old context is not paid for again.', '/clear')
  }

  function suggest({ state, history, activity, now }) {
    if (!state) return []
    const rules = [
      contextRule(state.contextPercent),
      limitRule('five', forecastFor('five', history, state, now)),
      limitRule('seven', forecastFor('seven', history, state, now)),
      cacheRule(state, history),
      ...agentRules(activity),
      dominantTaskRule(activity),
      longSessionRule(state),
    ].filter(Boolean)
    if (!rules.length) return [item('all-good', 'ok', 'check', 'Nothing to fix', 'Pace, context and cache look healthy.', null)]
    return rules.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]).slice(0, MAX_SUGGESTIONS)
  }

  return { forecastFor, suggest }
})()

if (typeof module !== 'undefined') module.exports = Adv
