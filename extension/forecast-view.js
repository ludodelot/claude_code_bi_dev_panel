// Top of the panel: when each limit runs out, plus suggested Claude Code actions for the current usage.
const COPY_FEEDBACK_MS = 1600
const FULL_BAR = 100

let forecastKey = ''

const TONE_LABEL = { hot: 'Critical', warn: 'Watch it', ok: 'On track', info: 'Waiting' }

function forecastBar(f) {
  const bar = el('div', 'fc-bar')
  const used = clamp(f.pct, 0, FULL_BAR)
  const reach = f.slope > 0 ? clamp(f.projPct, used, FULL_BAR) : used
  const fill = el('i', 'fc-fill')
  fill.style.width = used + '%'
  const proj = el('i', 'fc-proj')
  proj.style.left = used + '%'
  proj.style.width = Math.max(0, reach - used) + '%'
  bar.append(fill, proj)
  return bar
}

function forecastCard(f) {
  const card = el('div', 'card fc ' + f.tone)
  card.style.setProperty('--c', TONE_COLOR[f.tone] || 'rgba(128,128,128,0.5)')
  const head = el('div', 'head')
  head.append(withIcon(f.kind === 'five' ? 'clock' : 'calendar', el('span', 'g-ico')), el('span', 'label', f.name + ' limit'))
  const badge = el('span', 'badge ' + f.tone)
  badge.insertAdjacentHTML('afterbegin', icon(TONE_ICON[f.tone] || 'info'))
  badge.append(TONE_LABEL[f.tone] || '')
  head.append(badge)
  card.append(head, el('div', 'fc-headline', f.headline), el('div', 'fc-detail muted', f.detail))
  if (!f.available) return card
  card.append(forecastBar(f))
  const axis = el('div', 'axis muted')
  axis.append(el('span', '', 'now ' + Math.round(f.pct) + '%'), el('span', '', 'resets ' + f.resetLabel))
  card.append(axis)
  return card
}

function copyCommand(button, command) {
  vscode.postMessage({ copy: command })
  const original = button.textContent
  button.textContent = 'Copied'
  setTimeout(() => {
    button.textContent = original
  }, COPY_FEEDBACK_MS)
}

function suggestionRow(s, index) {
  const row = el('li', 'insight ' + s.tone)
  row.style.setProperty('--i', String(index))
  row.insertAdjacentHTML('afterbegin', '<span class="in-ico">' + icon(s.icon) + '</span>')
  const body = el('div', 'in-body')
  body.append(el('div', 'in-title', s.title), el('div', 'in-text muted', s.why))
  row.append(body)
  if (s.command) {
    const button = el('button', 'btn cmd', s.command)
    button.title = 'Copy ' + s.command + ' to the clipboard, then paste it in Claude Code'
    button.addEventListener('click', () => copyCommand(button, s.command))
    row.append(button)
  }
  return row
}

function renderForecast(state, history, activity) {
  const now = Date.now()
  const forecasts = ['five', 'seven'].map(kind => Adv.forecastFor(kind, history, state, now))
  const suggestions = Adv.suggest({ state, history, activity, now })
  const key = JSON.stringify([forecasts, suggestions, Math.floor(now / 60000)])
  if (key === forecastKey) return
  forecastKey = key
  const cards = $('forecastCards')
  cards.replaceChildren(...forecasts.map(forecastCard))
  const list = $('advisorList')
  list.replaceChildren(...suggestions.map(suggestionRow))
}
