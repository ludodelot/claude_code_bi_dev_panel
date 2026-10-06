const vscode = require('vscode')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { panelHtml } = require('./panel')
const { scanActivity } = require('./activity')
const { historyToCsv } = require('./history-csv')
const { span: formatSpan, tokens: formatTokens } = require('./format')

const DATA_DIR = path.join(os.homedir(), '.claude', 'usage-band')
const STATE_FILE = path.join(DATA_DIR, 'state.json')
const HISTORY_FILE = path.join(DATA_DIR, 'history.json')
const DEFAULT_POLL_MS = 2000
const MIN_POLL_MS = 1000
const ACTIVE_MS = 20000
const STALE_MS = 15 * 60 * 1000
const BAR_WARN_AT = 85
const BAR_HOT_AT = 95
const DEFAULT_NOTIFY_AT = [80, 95]
const MIN_SAMPLE_GAP_MS = 60 * 1000
const MAX_SAMPLES = 5000
const ACTIVITY_MS = 3000
const LIMIT_LABELS = { five_hour: '5h', seven_day: '7d' }

let panel
let lastMtime = 0
let state = null
let history = []
let activity = null
let activityKey = ''
let lastActivityScan = 0
const notified = new Set()

const settings = () => {
  const cfg = vscode.workspace.getConfiguration('claudeUsageBar')
  const poll = Number(cfg.get('pollIntervalMs'))
  const notify = cfg.get('notifyAt')
  return {
    pollMs: Number.isFinite(poll) ? Math.max(MIN_POLL_MS, poll) : DEFAULT_POLL_MS,
    notifyAt: Array.isArray(notify) ? notify.filter(n => Number.isFinite(n) && n > 0 && n <= 100) : DEFAULT_NOTIFY_AT,
    notificationsOn: cfg.get('notifications') !== false,
  }
}

const userName = () => {
  const configured = vscode.workspace.getConfiguration('claudeUsageBar').get('userName')
  if (configured) return configured
  try {
    const gitName = execFileSync('git', ['config', '--global', 'user.name'], { timeout: 3000 }).toString().trim()
    if (gitName) return gitName
  } catch {
    // no git identity configured: fall back to the OS account name
  }
  return os.userInfo().username
}

const loadHistory = () => {
  try {
    history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'))
  } catch {
    history = []
  }
}

const saveHistory = () => {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history))
  } catch (error) {
    console.error('claude-usage-bar: could not save history', error)
  }
}

const limitOf = (s, kind) => (s.limits || []).find(l => l.kind === kind)

const sampleOf = s => {
  const five = limitOf(s, 'five_hour')
  const seven = limitOf(s, 'seven_day')
  return {
    t: s.updatedAt,
    f: five ? five.percentUsed : null,
    fr: five && five.resetsAt,
    s: seven ? seven.percentUsed : null,
    sr: seven && seven.resetsAt,
    c: s.contextPercent,
    u: s.usd,
  }
}

const recordSample = s => {
  const next = sampleOf(s)
  const last = history[history.length - 1]
  if (last && next.t <= last.t) return
  const isRepeat =
    last && last.f === next.f && last.s === next.s && last.c === next.c && next.t - last.t < MIN_SAMPLE_GAP_MS
  if (isRepeat) return
  history = [...history, next].slice(-MAX_SAMPLES)
  saveHistory()
}

const historyForPanel = s => {
  const fr = limitOf(s, 'five_hour')?.resetsAt
  const sr = limitOf(s, 'seven_day')?.resetsAt
  return history.filter(h => (fr && h.fr === fr) || (sr && h.sr === sr))
}

const loadState = () => {
  try {
    const stat = fs.statSync(STATE_FILE)
    if (stat.mtimeMs === lastMtime) return false
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    lastMtime = stat.mtimeMs
    return true
  } catch {
    return false
  }
}

const runningAgents = () => (activity ? activity.agents.filter(a => a.status === 'running').length : 0)

const activityFingerprint = a =>
  JSON.stringify([a.agents.map(g => [g.id, g.status, g.burned, g.tools]), a.sessions.map(x => [x.id, x.tasks.length, (x.tasks[x.tasks.length - 1] || {}).burned])])

const refreshActivity = () => {
  if (Date.now() - lastActivityScan < ACTIVITY_MS) return false
  lastActivityScan = Date.now()
  try {
    const next = scanActivity()
    const key = activityFingerprint(next)
    const changed = key !== activityKey
    activity = next
    activityKey = key
    return changed
  } catch (error) {
    console.error('claude-usage-bar: activity scan failed', error)
    return false
  }
}

const barText = (s, isActive) => {
  const limits = (s.limits || []).map(l => `${LIMIT_LABELS[l.kind] || l.kind} ${Math.round(l.percentUsed)}%`)
  const ctx = typeof s.contextPercent === 'number' ? [`ctx ${s.contextPercent}%`] : []
  const agents = runningAgents() ? [`$(organization) ${runningAgents()}`] : []
  const parts = [...limits, ...ctx, ...agents]
  return `$(${isActive ? 'sync~spin' : 'pulse'}) ${parts.length ? parts.join(' · ') : 'Claude Code'}`
}

const worstPercent = s => Math.max(0, ...(s.limits || []).map(l => l.percentUsed))

const projectLine = w => {
  const repo = w.githubSlug || (w.repoRoot ? path.basename(w.repoRoot) : 'no repo')
  const branch = w.branch ? `@${w.branch}` : ''
  const dirty = w.dirty ? ` · ${w.dirty} changed` : ''
  return `\n\n📁 \`${repo}${branch}\`${dirty} — \`${w.pbipDir || w.dir}\``
}

const detectedLine = w => {
  const repo = w.githubSlug || w.repoName || 'no git repo'
  const branch = w.branch ? '@' + w.branch : ''
  const pbi = w.hasPbi ? ' · Power BI: ' + [...w.pbip, ...w.models, ...w.reports].slice(0, 2).join(', ') : ' · no Power BI project'
  return `\n\n🔎 In use: \`${repo}${branch}\`${pbi}`
}

const tooltipFor = s => {
  const md = new vscode.MarkdownString(undefined, true)
  const now = Date.now()
  md.appendMarkdown(`**Claude Code · ${userName()}**\n\n`)
  for (const l of s.limits || []) {
    const reset = l.resetsAt ? ` — resets in ${formatSpan(Date.parse(l.resetsAt) - now)}` : ''
    md.appendMarkdown(`- ${LIMIT_LABELS[l.kind] || l.kind} limit: ${Math.round(l.percentUsed)}%${reset}\n`)
  }
  const t = s.totals || {}
  md.appendMarkdown(
    `- Tokens: ↑ ${formatTokens((t.input || 0) + (t.cacheWrite || 0))} · ↓ ${formatTokens(t.output || 0)} · cache ${formatTokens(t.cacheRead || 0)}\n`,
  )
  md.appendMarkdown(`- Session: ${formatSpan(now - s.startedAt)}`)
  for (const w of s.workspaces || []) md.appendMarkdown(projectLine(w))
  const live = activity && activity.sessions.find(x => x.active && x.workspace)
  if (live) md.appendMarkdown(detectedLine(live.workspace))
  md.appendMarkdown('\n\n_Click to open the dashboard_')
  return md
}

const updateBar = item => {
  if (!state) {
    item.text = '$(pulse) Claude Code: no data'
    item.tooltip = 'No data yet. Enable the usage-band mod in Claude Code and send a message.'
    item.backgroundColor = undefined
    return
  }
  const age = Date.now() - state.updatedAt
  item.text = age > STALE_MS ? `${barText(state, false)} (stale)` : barText(state, age < ACTIVE_MS)
  item.tooltip = tooltipFor(state)
  const worst = worstPercent(state)
  item.backgroundColor =
    worst >= BAR_HOT_AT
      ? new vscode.ThemeColor('statusBarItem.errorBackground')
      : worst >= BAR_WARN_AT
        ? new vscode.ThemeColor('statusBarItem.warningBackground')
        : undefined
}

const notifyThresholds = s => {
  const { notifyAt, notificationsOn } = settings()
  if (!notificationsOn) return
  for (const l of s.limits || []) {
    for (const threshold of notifyAt) {
      const key = `${l.kind}|${l.resetsAt}|${threshold}`
      if (l.percentUsed < threshold || notified.has(key)) continue
      notified.add(key)
      const label = LIMIT_LABELS[l.kind] || l.kind
      const reset = l.resetsAt ? ` Resets in ${formatSpan(Date.parse(l.resetsAt) - Date.now())}.` : ''
      vscode.window
        .showWarningMessage(`Claude Code: ${label} limit at ${Math.round(l.percentUsed)}%.${reset}`, 'Open dashboard')
        .then(choice => choice && vscode.commands.executeCommand('claudeUsageBar.open'))
    }
  }
}

const postToPanel = () => {
  if (panel) panel.webview.postMessage({ state, history: state ? historyForPanel(state) : [], user: userName(), activity })
}

// Only slash commands (e.g. /compact) may be copied from the webview.
const SAFE_COMMAND = /^\/[a-z][a-z-]{0,30}( [\w .-]{1,80})?$/
const isSafeCommand = value => typeof value === 'string' && SAFE_COMMAND.test(value)

const copyCommand = async command => {
  await vscode.env.clipboard.writeText(command)
  vscode.window.setStatusBarMessage('Copied ' + command + '. Paste it in Claude Code.', 4000)
}

const openPanel = () => {
  if (panel) {
    panel.reveal()
    return
  }
  panel = vscode.window.createWebviewPanel('claudeUsageBar', 'Claude Code', vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true,
  })
  panel.webview.html = panelHtml()
  panel.webview.onDidReceiveMessage(message => {
    if (message === 'ready') postToPanel()
    else if (message && isSafeCommand(message.copy)) copyCommand(message.copy)
    else if (message && message.open && /^https:\/\/github\.com\//.test(message.open)) {
      vscode.env.openExternal(vscode.Uri.parse(message.open))
    }
  })
  panel.onDidDispose(() => {
    panel = undefined
  })
}

const exportHistory = async () => {
  if (!history.length) {
    vscode.window.showInformationMessage('Claude Code: no usage history recorded yet.')
    return
  }
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(os.homedir(), 'claude-usage-history.csv')),
    filters: { CSV: ['csv'] },
  })
  if (!target) return
  try {
    await vscode.workspace.fs.writeFile(target, Buffer.from(historyToCsv(history), 'utf8'))
    vscode.window.showInformationMessage('Claude Code: exported ' + history.length + ' samples.')
  } catch (error) {
    vscode.window.showErrorMessage('Claude Code: could not export history. ' + error.message)
  }
}

const tick = item => () => {
  const stateChanged = loadState()
  const activityChanged = refreshActivity()
  if (stateChanged) {
    recordSample(state)
    notifyThresholds(state)
  }
  if (stateChanged || activityChanged) postToPanel()
  updateBar(item)
}

function activate(context) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  item.command = 'claudeUsageBar.open'
  loadHistory()
  if (loadState()) recordSample(state)
  updateBar(item)
  item.show()
  refreshActivity()

  let timer
  const startTimer = () => {
    clearInterval(timer)
    timer = setInterval(tick(item), settings().pollMs)
  }
  startTimer()

  context.subscriptions.push(
    item,
    { dispose: () => clearInterval(timer) },
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('claudeUsageBar')) {
        startTimer()
        postToPanel()
      }
    }),
    vscode.commands.registerCommand('claudeUsageBar.open', openPanel),
    vscode.commands.registerCommand('claudeUsageBar.exportHistory', exportHistory),
  )
}

function deactivate() {}

module.exports = { activate, deactivate }
