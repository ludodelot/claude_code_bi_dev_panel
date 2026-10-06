const vscode = acquireVsCodeApi()

const RING = 2 * Math.PI * 40
const TICK_COUNT = 60
const COUNT_MS = 700
const EVEN_PACE_BAND = 10
const KIND_ICON = { model: 'model', report: 'report', other: 'file' }
const KIND_LABEL = { model: 'semantic model', report: 'report', other: 'other file' }
const TONE_ICON = { ok: 'check', warn: 'alert', hot: 'flame', info: 'info' }
const BADGE_TEXT = { ok: 'Comfortable', warn: 'Watch it', hot: 'Critical' }

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const $ = id => document.getElementById(id)

let model = { state: null, history: [], user: '', activity: null }
let projectsKey = ''
let changesKey = ''

const el = (tag, cls, text) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text !== undefined) n.textContent = text
  return n
}

const withIcon = (name, node) => {
  node.insertAdjacentHTML('afterbegin', icon(name))
  return node
}

const chip = (text, cls, ico) => {
  const node = el('span', 'chip' + (cls ? ' ' + cls : ''), text)
  return ico ? withIcon(ico, node) : node
}

function animateNumber(node, to, format) {
  const from = node._v === undefined ? 0 : node._v
  node._v = to
  cancelAnimationFrame(node._raf)
  if (reduceMotion || from === to) {
    node.textContent = format(to)
    return
  }
  const start = performance.now()
  const step = now => {
    const k = Math.min(1, (now - start) / COUNT_MS)
    const eased = 1 - Math.pow(1 - k, 3)
    node.textContent = format(from + (to - from) * eased)
    if (k < 1) node._raf = requestAnimationFrame(step)
  }
  node._raf = requestAnimationFrame(step)
}

function setBadge(node, tone, text) {
  node.className = 'badge ' + tone
  node.innerHTML = icon(TONE_ICON[tone])
  node.append(text)
}

function setGauge(id, percentUsed, note) {
  const box = $(id)
  const hasValue = typeof percentUsed === 'number'
  const p = hasValue ? clamp(percentUsed, 0, 100) : 0
  const tone = hasValue ? toneFor(p) : 'none'
  box.style.setProperty('--c', hasValue ? colorFor(p) : 'rgba(128,128,128,0.4)')
  box.querySelector('.arc').style.strokeDasharray = ((p / 100) * RING).toFixed(1) + ' ' + RING.toFixed(1)
  box.querySelector('.knob').style.transform = 'rotate(' + (p * 3.6).toFixed(1) + 'deg)'
  const lit = Math.round((p / 100) * TICK_COUNT)
  box.querySelectorAll('.tick').forEach((t, i) => t.classList.toggle('on', i < lit))
  box.classList.toggle('hot', tone === 'hot')
  const num = box.querySelector('.num')
  if (hasValue) animateNumber(num, Math.round(p), v => String(Math.round(v)))
  else {
    num.textContent = '—'
    num._v = 0
  }
  box.querySelector('.sym').style.display = hasValue ? '' : 'none'
  box.querySelector('.note').textContent = note
  const badge = box.querySelector('.badge')
  if (hasValue) setBadge(badge, tone, BADGE_TEXT[tone])
  else badge.replaceChildren()
}

function setEta(node, tone, text) {
  node.className = 'eta ' + tone
  node.textContent = text
}

function paceChip(node, info) {
  const diff = Math.round(info.aheadOfEven)
  const tone = diff > EVEN_PACE_BAND ? 'warn' : diff < -EVEN_PACE_BAND ? 'ok' : 'info'
  const text = tone === 'info' ? 'On even pace' : Math.abs(diff) + ' pts ' + (diff > 0 ? 'ahead of' : 'under') + ' even pace'
  node.className = 'chip pace-chip ' + tone
  node.innerHTML = icon(diff > 0 ? 'trend' : 'check')
  node.append(text)
}

function paceEta(eta, info) {
  if (info.slope <= 0) return setEta(eta, '', 'Usage is steady')
  if (!info.willHit) return setEta(eta, '', 'At reset ≈ ' + Math.round(info.projP) + '%')
  const left = info.timeTo100 - Date.now()
  setEta(eta, left < HOUR_MS ? 'hot' : 'warn', 'Hits 100% in ~' + span(left))
}

function renderPace(kind, id, state) {
  const card = $(id)
  const svg = card.querySelector('svg.chart')
  const eta = card.querySelector('.eta')
  const info = paceInfo(model.history, kind, state)
  if (!info) {
    clearSeries(svg)
    setEta(eta, '', 'No reading yet')
    return
  }
  const fmt = kind === 'five' ? clock : dayClock
  card.style.setProperty('--c', colorFor(info.limit.percentUsed))
  card.querySelector('.axis .l').textContent = fmt(info.start)
  card.querySelector('.axis .r').textContent = 'resets ' + fmt(info.end)
  paceChip(card.querySelector('.pace-chip'), info)
  if (info.pts.length < 2) {
    clearSeries(svg)
    setEta(eta, '', 'Collecting data…')
    return
  }
  renderSeriesChart(svg, {
    id, label: LIMIT_NAME[kind] + ' usage', pts: info.pts,
    x0: info.start, x1: info.end, y0: 0, y1: 100, grid: [0, 50, 100],
    ideal: [{ t: info.start, v: 0 }, { t: info.end, v: 100 }],
    proj: info.slope > 0 ? [info.last, { t: info.projEnd, v: info.projP }] : null,
    fmtAxis: v => v + '%', fmtValue: percent, fmtTime: fmt,
  })
  paceEta(eta, info)
}

function renderTrend(id, samples, opts) {
  const card = $(id)
  const svg = card.querySelector('svg.chart')
  const eta = card.querySelector('.eta')
  card.style.setProperty('--c', opts.color)
  if (samples.length < 2) {
    clearSeries(svg)
    setEta(eta, '', 'Collecting data…')
    card.querySelector('.axis .l').textContent = ''
    card.querySelector('.axis .r').textContent = ''
    return
  }
  const top = opts.fixedMax || Math.max(opts.minMax, Math.max(...samples.map(p => p.v)) * 1.15)
  const first = samples[0]
  const last = samples[samples.length - 1]
  renderSeriesChart(svg, {
    id, label: opts.label, pts: samples,
    x0: first.t, x1: Math.max(last.t, first.t + 1), y0: 0, y1: top, grid: [0, top / 2, top],
    fmtAxis: opts.fmtAxis, fmtValue: opts.fmtValue, fmtTime: clock,
  })
  setEta(eta, '', opts.fmtValue(last.v) + ' now')
  card.querySelector('.axis .l').textContent = clock(first.t)
  card.querySelector('.axis .r').textContent = clock(last.t)
}

function renderTrends(state) {
  renderTrend('trendC', sessionSamples(model.history, state, 'c'), {
    color: 'var(--s1)', label: 'Context used', fixedMax: 100, minMax: 100,
    fmtAxis: v => Math.round(v) + '%', fmtValue: percent,
  })
  renderTrend('trendU', sessionSamples(model.history, state, 'u'), {
    color: 'var(--s2)', label: 'API-equivalent value', minMax: 0.05,
    fmtAxis: v => '$' + v.toFixed(2), fmtValue: money,
  })
}

function setKpi(id, text, sub) {
  const box = $(id)
  box.querySelector('.k-sub').textContent = sub
  if (text !== null) box.querySelector('.k-val').textContent = text
  return box
}

function renderKpis(state) {
  const { parts, total } = tokenParts(state.totals)
  const rate = costPerHour(state)
  const cost = setKpi('kCost', null, rate === null ? 'Rate shows after a couple of minutes' : money(rate) + ' per hour')
  animateNumber(cost.querySelector('.k-val'), state.usd || 0, money)
  setSpark(cost.querySelector('.k-spark'), sessionSamples(model.history, state, 'u').map(p => p.v))

  const tok = setKpi('kTokens', null, tokens(parts[3].value) + ' generated · ' + tokens(parts[0].value + parts[1].value) + ' sent')
  animateNumber(tok.querySelector('.k-val'), total, tokens)
  tok.querySelectorAll('.k-stack i').forEach((bar, i) => {
    bar.style.flexGrow = String(total > 0 ? parts[i].value : 1)
  })

  const hit = cacheHitRate(state.totals)
  const cache = setKpi('kCache', null, hit === null ? 'No prompt data yet' : tokens(parts[2].value) + ' tokens reused')
  animateNumber(cache.querySelector('.k-val'), hit === null ? 0 : hit, percent)
  cache.querySelector('.k-meter i').style.width = (hit === null ? 0 : clamp(hit, 0, 100)) + '%'

  setSpark($('kSession').querySelector('.k-spark'), sessionSamples(model.history, state, 'c').map(p => p.v))
}

function renderTokens(state) {
  const { parts, total } = tokenParts(state.totals)
  const root = document.querySelector('.tokens')
  setDonut(root, parts, total)
  root.querySelectorAll('#tokLegend li').forEach((row, i) => {
    const p = parts[i]
    row.querySelector('.nm').textContent = ''
    row.querySelector('.nm').insertAdjacentHTML('afterbegin', icon(p.icon))
    row.querySelector('.nm').append(p.name)
    row.querySelector('.vl').textContent = tokens(p.value)
    row.querySelector('.pc').textContent = total > 0 ? ((p.value / total) * 100).toFixed(p.value / total < 0.1 ? 1 : 0) + '%' : '0%'
    row.querySelector('.bar i').style.width = (total > 0 ? (p.value / total) * 100 : 0) + '%'
  })
  animateNumber($('dBig'), total, tokens)
  root._parts = parts
  if (!root._wired) wireDonut(root)
}

function focusSegment(root, index) {
  const parts = root._parts || []
  root.classList.toggle('focus', index >= 0)
  root.querySelectorAll('.seg').forEach((s, i) => s.classList.toggle('on', i === index))
  root.querySelectorAll('#tokLegend li').forEach((r, i) => r.classList.toggle('on', i === index))
  const total = parts.reduce((sum, p) => sum + p.value, 0)
  if (index < 0 || !parts[index]) {
    $('dBig').textContent = tokens(total)
    $('dSmall').textContent = 'total tokens'
    return
  }
  $('dBig').textContent = tokens(parts[index].value)
  $('dSmall').textContent = parts[index].name
}

function wireDonut(root) {
  root._wired = true
  const targets = [...root.querySelectorAll('.seg'), ...root.querySelectorAll('#tokLegend li')]
  targets.forEach(node => {
    const index = Number(node.dataset.i)
    node.addEventListener('mouseenter', () => focusSegment(root, index))
    node.addEventListener('focus', () => focusSegment(root, index))
    node.addEventListener('mouseleave', () => focusSegment(root, -1))
    node.addEventListener('blur', () => focusSegment(root, -1))
  })
}

function renderInsights(state) {
  const list = $('insights')
  list.replaceChildren()
  buildInsights(model.history, state).forEach((item, i) => {
    const row = el('li', 'insight ' + item.tone)
    row.style.setProperty('--i', String(i))
    row.insertAdjacentHTML('afterbegin', '<span class="in-ico">' + icon(item.icon) + '</span>')
    const body = el('div', 'in-body')
    body.append(el('div', 'in-title', item.title), el('div', 'in-text muted', item.text))
    row.append(body)
    list.append(row)
  })
}

const modelName = m => m.replace(/\.SemanticModel$/i, '')
const reportName = r => r.replace(/\.Report$/i, '')

function gitRow(w) {
  const row = el('div', 'chips')
  if (w.branch) row.append(chip(w.branch, 'branch', 'branch'))
  if (w.ahead) row.append(chip(w.ahead + ' to push', 'ok', 'up'))
  if (w.behind) row.append(chip(w.behind + ' to pull', 'warn', 'down'))
  if (w.dirty) row.append(chip(plural(w.dirty, 'uncommitted change'), 'warn', 'alert'))
  else if (w.repoRoot) row.append(chip('clean', 'ok', 'check'))
  return row
}

function powerBiRow(w) {
  const row = el('div', 'chips')
  for (const f of w.pbip || []) row.append(chip('PBIP · ' + f, 'pbi', 'chart'))
  const stats = w.modelStats || []
  for (const m of stats) {
    const detail = m.tables ? ' · ' + plural(m.tables, 'table') + ' · ' + plural(m.measures, 'measure') + ' · ' + plural(m.relationships, 'relationship') : ''
    row.append(chip('Model · ' + modelName(m.name) + detail, 'pbi', 'model'))
  }
  if (!stats.length) for (const m of w.models || []) row.append(chip('Model · ' + modelName(m), 'pbi', 'model'))
  for (const r of w.reports || []) {
    const pages = r.pages ? ' · ' + plural(r.pages, 'page') : ''
    const target = r.model ? ' → ' + modelName(r.model) : ''
    row.append(chip('Report · ' + reportName(r.name) + pages + target, 'pbi', 'report'))
  }
  return row
}

function missingRow(w, hasPowerBi) {
  const row = el('div', 'chips')
  if (!w.repoRoot) row.append(chip('No git repo here', 'muted-chip'))
  if (!hasPowerBi) row.append(chip('No Power BI project (PBIP) found here', 'muted-chip'))
  return row
}

function workspaceCard(w) {
  const card = el('div', 'card project')
  const top = el('div', 'project-top')
  const repoName = w.githubSlug || (w.repoRoot ? w.repoRoot.split(/[\\/]/).pop() : 'no git repo')
  top.append(withIcon('folder', el('div', 'repo', repoName)))
  if (w.githubSlug) {
    const button = withIcon('github', el('button', 'btn', 'Open on GitHub'))
    button.insertAdjacentHTML('beforeend', icon('external'))
    const branchPath = w.branch ? '/tree/' + w.branch.split('/').map(encodeURIComponent).join('/') : ''
    button.addEventListener('click', () => vscode.postMessage({ open: 'https://github.com/' + w.githubSlug + branchPath }))
    top.append(button)
  }
  card.append(top, el('div', 'path', w.pbipDir || w.dir))
  if (w.repoRoot) card.append(gitRow(w))
  if (w.lastCommit) card.append(el('div', 'commit muted', 'Last commit: ' + w.lastCommit))
  const pbi = powerBiRow(w)
  if (pbi.children.length) card.append(pbi)
  if (!w.repoRoot || !pbi.children.length) card.append(missingRow(w, pbi.children.length > 0))
  return card
}

function renderProjects(list, cwd) {
  const shown = list.length ? list : [{ key: 'cwd', dir: cwd || 'unknown folder', repoRoot: null, pbip: [], models: [], reports: [] }]
  const key = JSON.stringify(shown)
  if (key === projectsKey) return
  projectsKey = key
  const box = $('projects')
  box.replaceChildren()
  if (!list.length) box.append(el('p', 'muted', 'Working folder. Repos and PBIPs show up here as soon as Claude touches one.'))
  for (const w of shown) box.append(workspaceCard(w))
}

function changeBadges(c) {
  const badges = el('div', 'chips')
  if (c.edited > 0) badges.append(chip('touched ' + plural(c.edited, 'existing measure'), 'warn', 'alert'))
  if (c.added > 0) {
    const text = c.tool === 'Write' ? 'file written · ' + plural(c.added, 'measure') : '+' + plural(c.added, 'new measure')
    badges.append(chip(text, 'ok', 'check'))
  }
  if (c.desktopOpen) badges.append(chip('Power BI Desktop is open', 'hot', 'flame'))
  return badges
}

function changeRow(c) {
  const row = el('div', 'change ' + c.kind)
  row.insertAdjacentHTML('afterbegin', '<div class="icon">' + icon(KIND_ICON[c.kind] || 'file') + '</div>')
  const body = el('div', 'body')
  body.append(el('div', 'area', c.area))
  const meta = el('div', 'meta muted')
  meta.append(el('span', '', c.tool + ' · ' + (KIND_LABEL[c.kind] || '') + ' · '))
  const ago = el('span', 'ago')
  ago.dataset.t = String(c.t)
  meta.append(ago)
  body.append(meta)
  const badges = changeBadges(c)
  if (badges.children.length) body.append(badges)
  row.append(body)
  return row
}

function changeSummary(list) {
  const count = kind => list.filter(c => c.kind === kind).length
  const edited = list.reduce((sum, c) => sum + c.edited, 0)
  const added = list.reduce((sum, c) => sum + c.added, 0)
  const row = el('div', 'chips summary')
  row.append(chip(plural(list.length, 'change'), ''))
  row.append(chip(count('model') + ' model', 'pbi', 'model'), chip(count('report') + ' report', 'pbi', 'report'))
  if (added) row.append(chip('+' + plural(added, 'new measure'), 'ok', 'check'))
  if (edited) row.append(chip(plural(edited, 'existing measure') + ' touched', 'warn', 'alert'))
  return row
}

function renderChanges(list) {
  const key = JSON.stringify(list)
  if (key === changesKey) return
  changesKey = key
  const box = $('changes')
  box.replaceChildren()
  if (!list.length) {
    box.append(el('p', 'muted', 'No edits yet. Changes Claude makes to your model, report or files show up here.'))
    return
  }
  box.append(changeSummary(list))
  const feed = el('div', 'card feed')
  for (const c of list) feed.append(changeRow(c))
  box.append(feed)
}

function renderLive() {
  const s = model.state
  if (!s) return
  const now = Date.now()
  const age = now - s.updatedAt
  const isActive = age < ACTIVE_MS
  $('live').classList.toggle('on', isActive)
  $('liveText').textContent = isActive ? 'Claude is working' : 'Idle · ' + span(age) + ' ago'
  $('sub').textContent = (model.user ? model.user + ' · ' : '') + 'Session ' + span(now - s.startedAt)
  tickAgents(now)
  const session = $('kSession')
  session.querySelector('.k-val').textContent = span(now - s.startedAt)
  session.querySelector('.k-sub').textContent = (typeof s.contextPercent === 'number' ? 'context ' + s.contextPercent + '% · ' : '') + (isActive ? 'active now' : 'idle ' + span(age))
  document.querySelectorAll('.ago').forEach(node => {
    node.textContent = span(now - Number(node.dataset.t)) + ' ago'
  })
}

function render() {
  const s = model.state
  $('empty').hidden = !!s
  $('main').hidden = !s
  if (!s) return
  const now = Date.now()
  const note = l => (l && l.resetsAt ? 'resets in ' + span(Date.parse(l.resetsAt) - now) : 'no reading yet')
  const five = limitOf(s, 'five')
  const seven = limitOf(s, 'seven')
  setGauge('gF', five ? five.percentUsed : null, note(five))
  setGauge('gS', seven ? seven.percentUsed : null, note(seven))
  setGauge('gC', typeof s.contextPercent === 'number' ? s.contextPercent : null, 'model window')
  renderKpis(s)
  renderFlow(s)
  renderAgents(model.activity)
  renderPace('five', 'paceF', s)
  renderPace('seven', 'paceS', s)
  renderTokens(s)
  renderInsights(s)
  renderTrends(s)
  renderProjects(s.workspaces || [], s.cwd)
  renderChanges(s.changes || [])
  renderLive()
}

window.addEventListener('message', e => {
  model = { state: e.data.state, history: e.data.history || [], user: e.data.user || '', activity: e.data.activity || null }
  render()
})
wireBurnTabs()
setInterval(renderLive, 1000)
vscode.postMessage('ready')
