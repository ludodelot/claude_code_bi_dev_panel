const MAX_AGENT_ROWS = 8
const MAX_BURN_ROWS = 8
const BURN_FILTERS = ['all', 'agent', 'task']
const STATUS_LABEL = { running: 'Running', done: 'Finished', stale: 'Idle' }

let burnFilter = 'all'
let agentsKey = ''

const shortModel = m => (m ? m.replace(/^claude-/, '') : 'model n/a')

const clip = (text, max) => (text.length > max ? text.slice(0, max - 1) + '…' : text)

function dur(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return s + 's'
  const m = Math.floor(s / 60)
  return m < 60 ? m + 'm ' + String(s % 60).padStart(2, '0') + 's' : Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'
}

function burnItems(activity) {
  if (!activity) return []
  const agents = activity.agents.map(a => ({
    kind: 'agent', id: a.id, label: a.description, sub: a.type + ' · ' + a.sessionTitle,
    burned: a.burned, cached: a.tokens.cacheRead, tools: a.tools, running: a.status === 'running',
  }))
  const tasks = activity.sessions.flatMap(s =>
    s.tasks.map(t => ({ kind: 'task', id: t.id, label: t.title, sub: s.title, burned: t.burned, cached: t.tokens.cacheRead, tools: t.tools, running: false })),
  )
  return [...agents, ...tasks].filter(i => i.burned > 0).sort((a, b) => b.burned - a.burned)
}

function agentSummary(activity) {
  const agents = activity ? activity.agents : []
  const items = burnItems(activity)
  const active = activity ? activity.sessions.find(s => s.active) : null
  const tasks = active ? active.tasks : []
  const taskBurn = tasks.reduce((sum, t) => sum + t.burned, 0)
  return {
    running: agents.filter(a => a.status === 'running').length,
    done: agents.filter(a => a.status === 'done').length,
    idle: agents.filter(a => a.status === 'stale').length,
    agentBurn: agents.reduce((sum, a) => sum + a.burned, 0),
    agentCached: agents.reduce((sum, a) => sum + a.tokens.cacheRead, 0),
    agentCount: agents.length,
    top: items[0] || null,
    taskCount: tasks.length,
    taskAvg: tasks.length ? taskBurn / tasks.length : 0,
  }
}

function renderAgentKpis(sum) {
  const run = setKpi('kRun', null, sum.done + ' finished · ' + sum.idle + ' idle (last 6h)')
  animateNumber(run.querySelector('.k-val'), sum.running, v => String(Math.round(v)))
  run.classList.toggle('busy', sum.running > 0)
  const burn = setKpi('kAgBurn', null, 'across ' + plural(sum.agentCount, 'agent') + ' · ' + tokens(sum.agentCached) + ' cached')
  animateNumber(burn.querySelector('.k-val'), sum.agentBurn, tokens)
  const top = setKpi('kTop', null, sum.top ? clip(sum.top.label, 44) : 'Nothing measured yet')
  animateNumber(top.querySelector('.k-val'), sum.top ? sum.top.burned : 0, tokens)
  const tasks = setKpi('kTasks', null, sum.taskCount ? 'avg ' + tokens(sum.taskAvg) + ' burned per task' : 'Send a prompt to start')
  animateNumber(tasks.querySelector('.k-val'), sum.taskCount, v => String(Math.round(v)))
}

function orbFor(status) {
  const orb = el('span', 'orb')
  if (status === 'running') orb.innerHTML = '<i class="orb-ring"></i>' + icon('sparkles')
  else orb.innerHTML = icon(status === 'done' ? 'check' : 'clock')
  return orb
}

function agentRow(a, maxBurn, now) {
  const row = el('li', 'agent ' + a.status)
  row.style.setProperty('--w', String(maxBurn ? a.burned / maxBurn : 0))
  const body = el('div', 'a-body')
  body.append(el('div', 'a-title', a.description))
  const chips = el('div', 'chips')
  chips.append(chip(STATUS_LABEL[a.status], 'st-' + a.status), chip(a.type, '', 'sparkles'), chip(shortModel(a.model), 'muted-chip'))
  if (a.tools) chips.append(chip(plural(a.tools, 'tool call'), 'muted-chip'))
  body.append(chips)
  const doing = el('div', 'a-doing muted')
  if (a.status === 'running') doing.append(el('span', 'typing', a.lastTool || 'Thinking'), el('i', 'dots'))
  else {
    doing.append(el('span', '', (a.status === 'done' ? 'Finished ' : 'Last activity ')))
    const ago = el('span', 'ago')
    ago.dataset.t = String(a.last || now)
    doing.append(ago)
  }
  body.append(doing)
  const right = el('div', 'a-right')
  right.append(el('div', 'a-tok', tokens(a.burned)), el('div', 'a-unit muted', 'tokens burned'))
  const elapsed = el('div', 'elapsed', dur((a.status === 'running' ? now : a.last || now) - (a.start || now)))
  if (a.status === 'running') elapsed.dataset.start = String(a.start || now)
  right.append(elapsed)
  const bar = el('span', 'a-bar')
  bar.append(el('i'))
  row.append(orbFor(a.status), body, right, bar)
  return row
}

function renderAgentList(activity) {
  const list = $('agentList')
  const agents = activity ? activity.agents : []
  const order = { running: 0, done: 1, stale: 2 }
  const sorted = [...agents].sort((a, b) => order[a.status] - order[b.status] || (b.last || 0) - (a.last || 0))
  const key = JSON.stringify(sorted.map(a => [a.id, a.status, a.burned, a.tools, a.lastTool]))
  if (key === agentsKey) return
  agentsKey = key
  list.replaceChildren()
  $('agentCount').textContent = String(agents.length)
  if (!sorted.length) {
    list.append(el('li', 'empty-row muted', 'No subagents in the last 6 hours. When Claude launches one it shows up here live.'))
    return
  }
  const maxBurn = Math.max(...sorted.map(a => a.burned))
  const now = Date.now()
  sorted.slice(0, MAX_AGENT_ROWS).forEach((a, i) => {
    const row = agentRow(a, maxBurn, now)
    row.style.setProperty('--i', String(i))
    list.append(row)
  })
  if (sorted.length > MAX_AGENT_ROWS) list.append(el('li', 'empty-row muted', '+' + (sorted.length - MAX_AGENT_ROWS) + ' older agents'))
}

function burnRow(item, rank, maxBurn, total) {
  const row = el('li', 'burn k-' + item.kind)
  row.style.setProperty('--i', String(rank))
  row.style.setProperty('--w', String(maxBurn ? item.burned / maxBurn : 0))
  row.append(el('span', 'rank', String(rank + 1)))
  const body = el('div', 'b-body')
  body.append(withIcon(item.kind === 'agent' ? 'sparkles' : 'zap', el('div', 'b-title', clip(item.label, 70))))
  body.append(el('div', 'b-sub muted', clip(item.sub, 64) + (item.tools ? ' · ' + plural(item.tools, 'tool call') : '')))
  const right = el('div', 'b-right')
  right.append(el('div', 'b-tok', tokens(item.burned)), el('div', 'b-pc muted', (total ? Math.round((item.burned / total) * 100) : 0) + '% of top ' + MAX_BURN_ROWS))
  const bar = el('span', 'b-bar')
  bar.append(el('i'))
  row.append(body, right, bar)
  return row
}

function renderBurners(activity) {
  const all = burnItems(activity).filter(i => burnFilter === 'all' || i.kind === burnFilter)
  const shown = all.slice(0, MAX_BURN_ROWS)
  const list = $('burnList')
  list.replaceChildren()
  if (!shown.length) {
    list.append(el('li', 'empty-row muted', 'No token usage measured yet for this filter.'))
    return
  }
  const total = shown.reduce((sum, i) => sum + i.burned, 0)
  shown.forEach((item, i) => list.append(burnRow(item, i, shown[0].burned, total)))
}

function wireBurnTabs() {
  document.querySelectorAll('.tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      burnFilter = btn.dataset.f
      document.querySelectorAll('.tabs .tab').forEach(b => b.classList.toggle('on', b === btn))
      renderBurners(model.activity)
    })
  })
}

function renderAgents(activity) {
  renderAgentKpis(agentSummary(activity))
  renderAgentList(activity)
  renderBurners(activity)
}

function tickAgents(now) {
  document.querySelectorAll('.elapsed[data-start]').forEach(node => {
    node.textContent = dur(now - Number(node.dataset.start))
  })
}
