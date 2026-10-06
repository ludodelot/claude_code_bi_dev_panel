const FLOW_W = 900
const NODE_W = 214
const NODE_H = 66
const COL_X = [24, 343, 662]
const GIT_Y = 34
const PBI_Y = 176
const ROW_GAP = 16
const MAX_FLOW_ROWS = 4
const TOUCHED_MS = 10 * 60000
const NAME_CHARS = 22
const SUB_CHARS = 28
const CURVE = 70

let flowIndex = 0

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const nodeMarkup = n => {
  const cls = ['node', n.cls || '', n.dim ? 'dim' : '', n.touched ? 'touched' : ''].join(' ')
  return (
    '<g transform="translate(' + n.x + ' ' + n.y + ')"><g class="' + cls + '" style="--nc:' + n.color + '">' +
    '<title>' + esc(n.title + (n.sub ? ' — ' + n.sub : '')) + '</title>' +
    '<rect class="nb" width="' + NODE_W + '" height="' + NODE_H + '" rx="14"/>' +
    '<rect class="na" width="5" height="' + (NODE_H - 20) + '" x="0" y="10" rx="2.5"/>' +
    '<circle class="nd" cx="' + (NODE_W - 16) + '" cy="16" r="4.5"/>' +
    '<svg class="nico" x="18" y="' + (NODE_H / 2 - 12) + '" width="24" height="24" viewBox="0 0 24 24">' + (ICON_PATHS[n.icon] || '') + '</svg>' +
    '<text class="nt" x="54" y="' + (NODE_H / 2 - 4) + '">' + esc(clip(n.title, NAME_CHARS)) + '</text>' +
    '<text class="ns" x="54" y="' + (NODE_H / 2 + 14) + '">' + esc(clip(n.sub || '', SUB_CHARS)) + '</text>' +
    '</g></g>'
  )
}

const edgeMarkup = (e, n) => {
  const d = e.vertical
    ? 'M' + e.x1 + ' ' + e.y1 + ' L' + e.x2 + ' ' + e.y2
    : 'M' + e.x1 + ' ' + e.y1 + ' C' + (e.x1 + CURVE) + ' ' + e.y1 + ' ' + (e.x2 - CURVE) + ' ' + e.y2 + ' ' + e.x2 + ' ' + e.y2
  const mx = (e.x1 + e.x2) / 2
  const my = (e.y1 + e.y2) / 2
  const particle = e.state === 'idle' || reduceMotion ? '' : '<circle class="pt" r="3.4"><animateMotion dur="' + (e.vertical ? 1.8 : 2.6) + 's" begin="-' + (n % 4) * 0.6 + 's" repeatCount="indefinite" path="' + d + '"/></circle>'
  const label = e.label ? '<text class="el" x="' + mx + '" y="' + (my - 9) + '" text-anchor="middle">' + esc(e.label) + '</text>' : ''
  return '<g class="edge ' + e.state + '"><path class="ep" d="' + d + '"/>' + particle + label + '</g>'
}

const rightOf = n => ({ x: n.x + NODE_W, y: n.y + NODE_H / 2 })
const leftOf = n => ({ x: n.x, y: n.y + NODE_H / 2 })

function edgeBetween(a, b, state, label) {
  const from = rightOf(a)
  const to = leftOf(b)
  return { x1: from.x, y1: from.y, x2: to.x, y2: to.y, state, label }
}

function touchedWithin(changes, needle) {
  const cutoff = Date.now() - TOUCHED_MS
  return (changes || []).some(c => c.t >= cutoff && (!needle || String(c.area).toLowerCase().includes(needle.toLowerCase())))
}

function gitNodes(w, changes) {
  const slug = w.githubSlug
  const repoName = w.repoRoot ? w.repoRoot.split(/[\\/]/).pop() : 'No git repo'
  const local = { x: COL_X[0], y: GIT_Y, icon: 'folder', color: 'var(--fg)', title: 'Local folder', sub: (w.pbipDir || w.dir || '').split(/[\\/]/).slice(-2).join('/'), touched: touchedWithin(changes), cls: 'n-local' }
  const gitSub = w.repoRoot ? (w.branch || 'detached') + (w.dirty ? ' · ' + w.dirty + ' changed' : ' · clean') : 'Not a repository'
  const git = { x: COL_X[1], y: GIT_Y, icon: 'branch', color: 'var(--s2)', title: repoName, sub: gitSub, dim: !w.repoRoot, cls: 'n-git' }
  const hub = { x: COL_X[2], y: GIT_Y, icon: 'github', color: 'var(--s1)', title: slug || 'No GitHub remote', sub: w.lastCommit || (slug ? 'origin' : 'Push to publish'), dim: !slug, cls: 'n-hub' }
  return { local, git, hub }
}

function syncLabel(w) {
  if (!w.githubSlug) return ''
  if (!w.ahead && !w.behind) return 'in sync'
  return (w.ahead ? '↑' + w.ahead + ' push' : '') + (w.ahead && w.behind ? ' · ' : '') + (w.behind ? '↓' + w.behind + ' pull' : '')
}

function pbiNodes(w, changes) {
  const stats = w.modelStats && w.modelStats.length ? w.modelStats : (w.models || []).map(name => ({ name }))
  const reports = w.reports || []
  const rows = clamp(Math.max(stats.length, reports.length, 1), 1, MAX_FLOW_ROWS)
  const rowY = i => PBI_Y + i * (NODE_H + ROW_GAP)
  const hasPbi = (w.pbip || []).length > 0 || stats.length > 0 || reports.length > 0
  const pbip = { x: COL_X[0], y: PBI_Y, icon: 'chart', color: 'var(--s4)', title: (w.pbip || [])[0] || 'No PBIP project', sub: hasPbi ? 'Power BI project' : 'Nothing found here', dim: !hasPbi, cls: 'n-pbip' }
  const models = stats.slice(0, MAX_FLOW_ROWS).map((m, i) => ({
    x: COL_X[1], y: rowY(i), icon: 'model', color: 'var(--s4)', title: modelName(m.name), cls: 'n-model',
    sub: m.tables ? m.tables + ' tables · ' + m.measures + ' measures' : 'Semantic model',
    touched: touchedWithin(changes, m.name),
  }))
  const reps = reports.slice(0, MAX_FLOW_ROWS).map((r, i) => ({
    x: COL_X[2], y: rowY(i), icon: 'report', color: 'var(--s3)', title: reportName(r.name), cls: 'n-report',
    sub: (r.pages ? plural(r.pages, 'page') : 'Report') + (r.model ? ' → ' + modelName(r.model) : ''),
    touched: touchedWithin(changes, r.name), model: r.model,
  }))
  return { pbip, models, reps, rows, hasPbi, hidden: Math.max(0, stats.length - MAX_FLOW_ROWS) + Math.max(0, reports.length - MAX_FLOW_ROWS) }
}

function buildFlow(w, changes) {
  const g = gitNodes(w, changes)
  const p = pbiNodes(w, changes)
  const edges = [
    edgeBetween(g.local, g.git, w.repoRoot ? (w.dirty ? 'warn' : 'ok') : 'idle', w.repoRoot ? (w.dirty ? w.dirty + ' uncommitted' : 'clean') : 'no repo'),
    edgeBetween(g.git, g.hub, w.githubSlug ? (w.ahead || w.behind ? 'warn' : 'ok') : 'idle', syncLabel(w)),
    { x1: g.local.x + NODE_W / 2, y1: g.local.y + NODE_H, x2: p.pbip.x + NODE_W / 2, y2: p.pbip.y, state: p.hasPbi ? 'ok' : 'idle', vertical: true, label: '' },
    ...p.models.map(m => edgeBetween(p.pbip, m, 'ok', '')),
    ...p.reps.map(r => {
      const source = p.models.find(m => r.model && m.title === modelName(r.model))
      return edgeBetween(source || p.pbip, r, 'ok', source ? '' : 'no model link')
    }),
  ]
  const height = PBI_Y + p.rows * (NODE_H + ROW_GAP) + (p.hidden ? 22 : 4)
  const nodes = [g.local, g.git, g.hub, p.pbip, ...p.models, ...p.reps]
  const more = p.hidden ? '<text class="el" x="' + FLOW_W / 2 + '" y="' + (height - 6) + '" text-anchor="middle">+' + p.hidden + ' more not shown</text>' : ''
  const lanes =
    '<text class="lane" x="24" y="18">SOURCE CONTROL</text><text class="lane" x="24" y="' + (PBI_Y - 12) + '">POWER BI</text>'
  const markup = lanes + edges.map(edgeMarkup).join('') + nodes.map(nodeMarkup).join('') + more
  return { markup, height }
}

function flowTabs(list) {
  const box = $('flowTabs')
  box.replaceChildren()
  list.forEach((w, i) => {
    const name = w.githubSlug || (w.repoRoot ? w.repoRoot.split(/[\\/]/).pop() : (w.dir || '').split(/[\\/]/).pop() || 'workspace')
    const btn = withIcon('folder', el('button', 'tab' + (i === flowIndex ? ' on' : ''), name))
    btn.addEventListener('click', () => {
      flowIndex = i
      renderFlow(model.state)
    })
    box.append(btn)
  })
  box.hidden = list.length < 2
}

function renderFlow(state) {
  const list = state.workspaces && state.workspaces.length ? state.workspaces : [{ key: 'cwd', dir: state.cwd || '', repoRoot: null, pbip: [], models: [], reports: [] }]
  flowIndex = clamp(flowIndex, 0, list.length - 1)
  flowTabs(list)
  const { markup, height } = buildFlow(list[flowIndex], state.changes)
  const svg = $('flowSvg')
  svg.setAttribute('viewBox', '0 0 ' + FLOW_W + ' ' + height)
  svg.innerHTML = markup
  const running = model.activity ? model.activity.agents.some(a => a.status === 'running') : false
  svg.classList.toggle('busy', running)
}
