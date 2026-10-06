// "In use now": which repo and Power BI project each recent Claude Code session is working on.
const INUSE_RECENT_MS = 30 * 60 * 1000
const INUSE_MAX_SESSIONS = 3

let inUseKey = ''

function inUseSessions(activity) {
  if (!activity || !activity.sessions.length) return []
  const now = Date.now()
  const recent = activity.sessions.filter(s => s.active || now - s.latest < INUSE_RECENT_MS)
  return (recent.length ? recent : activity.sessions.slice(0, 1)).slice(0, INUSE_MAX_SESSIONS)
}

function githubButton(ws) {
  const button = withIcon('github', el('button', 'btn', 'Open on GitHub'))
  button.insertAdjacentHTML('beforeend', icon('external'))
  const branchPath = ws.branch && ws.branch !== 'detached HEAD' ? '/tree/' + ws.branch.split('/').map(encodeURIComponent).join('/') : ''
  button.addEventListener('click', () => vscode.postMessage({ open: 'https://github.com/' + ws.githubSlug + branchPath }))
  return button
}

function repoRow(ws) {
  const row = el('div', 'chips')
  if (!ws.repoRoot) {
    row.append(chip('No Git repo', 'muted-chip', 'branch'))
    return row
  }
  row.append(chip(ws.githubSlug || ws.repoName, 'branch', 'folder'))
  if (ws.branch) row.append(chip(ws.branch, 'branch', 'branch'))
  if (!ws.githubSlug) row.append(chip('no GitHub remote', 'muted-chip'))
  return row
}

function pbiRow(ws) {
  const row = el('div', 'chips')
  if (!ws.hasPbi) {
    row.append(chip('No Power BI project', 'muted-chip', 'chart'))
    return row
  }
  for (const f of ws.pbip) row.append(chip('PBIP · ' + f, 'pbi', 'chart'))
  for (const m of ws.models) row.append(chip('Model · ' + modelName(m), 'pbi', 'model'))
  for (const r of ws.reports) row.append(chip('Report · ' + reportName(r), 'pbi', 'report'))
  return row
}

function inUseCard(session) {
  const ws = session.workspace
  const card = el('div', 'card project inuse' + (session.active ? ' live' : ''))
  const top = el('div', 'project-top')
  top.append(withIcon('sparkles', el('div', 'repo', session.title)))
  const ago = Date.now() - session.latest
  top.append(chip(session.active ? 'Active session' : 'Seen ' + span(ago) + ' ago', session.active ? 'ok' : 'muted-chip'))
  card.append(top)
  if (!ws) {
    card.append(el('div', 'path muted', 'Location unknown for this session'))
    return card
  }
  card.append(el('div', 'path', ws.pbipDir || ws.repoRoot || ws.cwd || ws.dir))
  card.append(repoRow(ws), pbiRow(ws))
  if (ws.githubSlug) card.querySelector('.project-top').append(githubButton(ws))
  return card
}

function renderInUse(activity) {
  const sessions = inUseSessions(activity)
  const key = JSON.stringify(sessions.map(s => [s.id, s.active, s.workspace]))
  if (key === inUseKey) return
  inUseKey = key
  const box = $('inUse')
  box.replaceChildren()
  if (!sessions.length) {
    box.append(el('p', 'muted', 'No recent Claude Code sessions found on this machine.'))
    return
  }
  for (const s of sessions) box.append(inUseCard(s))
}
