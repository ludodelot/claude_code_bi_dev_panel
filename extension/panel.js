const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const SCRIPT_FILES = ['icons.js', 'format.js', 'analytics.js', 'advisor.js', 'charts.js', 'agents-view.js', 'inuse-view.js', 'forecast-view.js', 'webview.js']
const STYLE_FILES = ['panel.css', 'panel-extra.css']
const TICK_COUNT = 60
const TOKEN_SLOTS = 4

const readAsset = name => fs.readFileSync(path.join(__dirname, name), 'utf8')

// icons.js is shared with the webview script, so evaluate it here to reuse the same icon() helper
const { icon } = new Function(readAsset('icons.js') + '\nreturn { icon }')()

const ringTicks = () =>
  Array.from({ length: TICK_COUNT }, (_, i) => {
    const a = (i / TICK_COUNT) * 2 * Math.PI - Math.PI / 2
    const [c, s] = [Math.cos(a), Math.sin(a)]
    const f = n => n.toFixed(2)
    return `<line class="tick" style="--d:${i * 9}ms" x1="${f(50 + 46 * c)}" y1="${f(50 + 46 * s)}" x2="${f(50 + 49.5 * c)}" y2="${f(50 + 49.5 * s)}"/>`
  }).join('')

const gauge = (id, label, ico) => `
  <div class="card gauge" id="${id}">
    <div class="g-head"><span class="g-ico">${icon(ico)}</span><span class="label">${label}</span><span class="badge"></span></div>
    <div class="ring">
      <svg viewBox="0 0 100 100">
        <g class="ticks">${ringTicks()}</g>
        <circle class="track" cx="50" cy="50" r="40"/>
        <circle class="arc" cx="50" cy="50" r="40" transform="rotate(-90 50 50)"/>
        <g class="knob"><circle cx="50" cy="10" r="4.6"/></g>
      </svg>
      <div class="pct"><span class="num">—</span><span class="sym">%</span></div>
    </div>
    <div class="note muted"></div>
  </div>`

const chartBox = id => `
  <div class="chart-wrap">
    <svg class="chart" id="${id}" viewBox="0 0 300 100" role="img" aria-label=""></svg>
    <div class="tip"></div>
  </div>`

const pace = (id, label, ico) => `
  <div class="card pace" id="${id}">
    <div class="head"><span class="g-ico">${icon(ico)}</span><span class="label">${label}</span><span class="eta">—</span></div>
    ${chartBox(id + 'Chart')}
    <div class="axis muted"><span class="l"></span><span class="r"></span></div>
    <div class="chips"><span class="chip pace-chip"></span><span class="chip legend-chip"><i class="lg solid"></i>used<i class="lg dash"></i>even pace</span></div>
  </div>`

const trend = (id, label, ico) => `
  <div class="card trend" id="${id}">
    <div class="head"><span class="g-ico">${icon(ico)}</span><span class="label">${label}</span><span class="eta">—</span></div>
    ${chartBox(id + 'Chart')}
    <div class="axis muted"><span class="l"></span><span class="r"></span></div>
  </div>`

const kpi = (id, ico, name, slot, extra) => `
  <div class="card kpi" id="${id}" style="--k:var(${slot})">
    <div class="k-top"><span class="k-ico">${icon(ico)}</span><span class="k-name">${name}</span></div>
    <div class="k-val">—</div>
    <div class="k-sub muted"></div>
    ${extra}
  </div>`

const KPI_SPARK = '<svg class="k-spark" viewBox="0 0 100 28" preserveAspectRatio="none"><path class="a"/><path class="l"/></svg>'
const KPI_METER = '<div class="k-meter"><i></i></div>'
const KPI_STACK = `<div class="k-stack">${Array.from({ length: TOKEN_SLOTS }, (_, i) => `<i style="--s:var(--s${i + 1})"></i>`).join('')}</div>`

const legendRow = i => `
  <li data-i="${i}" tabindex="0">
    <span class="sw" style="background:var(--s${i + 1})"></span>
    <span class="nm"></span><span class="vl">0</span><span class="pc">0%</span>
    <span class="bar"><i style="--s:var(--s${i + 1})"></i></span>
  </li>`

const donut = () => `
  <div class="card tokens">
    <div class="donut-wrap">
      <svg class="donut" viewBox="0 0 100 100" role="img" aria-label="Token breakdown">
        <circle class="d-track" cx="50" cy="50" r="38"/>
        ${Array.from({ length: TOKEN_SLOTS }, (_, i) => `<circle class="seg" data-i="${i}" cx="50" cy="50" r="38" transform="rotate(-90 50 50)" style="--s:var(--s${i + 1})"/>`).join('')}
      </svg>
      <div class="donut-center"><div class="big" id="dBig">0</div><div class="small muted" id="dSmall">total tokens</div></div>
    </div>
    <ul class="legend" id="tokLegend">${Array.from({ length: TOKEN_SLOTS }, (_, i) => legendRow(i)).join('')}</ul>
  </div>`

const LOGO = `
  <svg class="logo" viewBox="0 0 24 24" aria-hidden="true">
    <g stroke="#d97757" stroke-width="2.6" stroke-linecap="round">
      <line x1="12" y1="2.5" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="21.5" y2="12"/>
      <line x1="5.3" y1="5.3" x2="18.7" y2="18.7"/><line x1="18.7" y1="5.3" x2="5.3" y2="18.7"/>
    </g>
  </svg>`

const ECG = `
  <svg class="ecg" viewBox="0 0 120 24" aria-hidden="true"><path d="M0 12 H34 l4-9 6 18 5-14 3 5 H120"/></svg>`

const NAV_ITEMS = []

const slug = title => title.toLowerCase().replace(/&amp;/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const section = (ico, title, body) => {
  const id = 'sec-' + slug(title)
  NAV_ITEMS.push({ id, title, ico })
  return `<h2 id="${id}"><span class="h-ico">${icon(ico)}</span>${title}<span class="rule"></span></h2>${body}`
}

const navHtml = () =>
  '<nav class="toc" aria-label="Dashboard sections">' +
  NAV_ITEMS.map(n => `<a href="#${n.id}" data-sec="${n.id}">${icon(n.ico)}<span>${n.title}</span></a>`).join('') +
  '</nav>'


const AGENT_CARD = `<div class="card agents"><div class="head"><span class="g-ico">${icon('sparkles')}</span><span class="label">Subagents</span><span class="count" id="agentCount">0</span></div><ul id="agentList" class="a-list"></ul></div>`

const BURN_CARD = `<div class="card burners"><div class="head"><span class="g-ico">${icon('flame')}</span><span class="label">Top token burners</span><div class="tabs mini-tabs"><button class="tab on" data-f="all">All</button><button class="tab" data-f="agent">Agents</button><button class="tab" data-f="task">Tasks</button></div></div><ol id="burnList" class="b-list"></ol></div>`

const FORECAST = `<section id="forecastCards" class="grid2"></section>
    <div class="card insights advisor"><div class="head"><span class="g-ico">${icon('bulb')}</span><span class="label">Suggested next steps</span></div><ul id="advisorList"></ul></div>`

const BODY = `
  <div id="empty" class="muted" hidden>
    <h1>${LOGO}Claude Code</h1>
    <p>No data yet. Enable the usage-band mod and send a message in Claude Code.</p>
  </div>
  <main id="main" hidden>
    <header class="hero">
      <div class="brand">
        ${LOGO}
        <div class="brand-text">
          <h1>Claude Code</h1>
          <div class="role">${icon('chart')}Business Intelligence Developer</div>
          <div class="by">by <b>DELOT</b> <span class="v">(v)</span> <span id="ver" class="ver-chip" title="Installed version">v…</span><button id="updateBtn" class="btn update-btn" hidden></button></div>
        </div>
      </div>
      <div class="hero-side">
        <div id="live" class="live" role="status" aria-live="polite">${ECG}<span class="dot"></span><span id="liveText"></span></div>
        <div id="sub" class="muted"></div>
      </div>
    </header>

    <!--NAV-->

    ${section('flame', 'Forecast &amp; next steps', FORECAST)}

    ${section('sparkles', 'In use now', '<section id="inUse" class="inuse-grid"></section>')}

    <section class="grid4 kpis">
      ${kpi('kCost', 'dollar', 'API-equivalent value', '--s1', KPI_SPARK)}
      ${kpi('kTokens', 'zap', 'Tokens processed', '--s2', KPI_STACK)}
      ${kpi('kCache', 'database', 'Cache hit rate', '--s3', KPI_METER)}
      ${kpi('kSession', 'timer', 'Session', '--s4', KPI_SPARK)}
    </section>

    ${section('sparkles', 'Agents &amp; tasks', `<section class="grid4 agent-kpis">${kpi('kRun', 'sparkles', 'Agents running', '--s3', '')}${kpi('kAgBurn', 'flame', 'Burned by agents', '--s2', '')}${kpi('kTop', 'trend', 'Heaviest task', '--s1', '')}${kpi('kTasks', 'file', 'Tasks this session', '--s4', '')}</section><section class="grid2 split2">${AGENT_CARD}${BURN_CARD}</section>`)}
    ${section('activity', 'Plan limits', `<section class="grid3">${gauge('gF', '5-hour limit', 'clock')}${gauge('gS', '7-day limit', 'calendar')}${gauge('gC', 'Context window', 'layers')}</section>`)}
    ${section('flame', 'Burn rate', `<section class="grid2">${pace('paceF', '5-hour window', 'clock')}${pace('paceS', '7-day window', 'calendar')}</section>`)}
    ${section('chart', 'Token analytics', `<section class="grid2 split">${donut()}<div class="card insights"><div class="head"><span class="g-ico">${icon('bulb')}</span><span class="label">Insights</span></div><ul id="insights"></ul></div></section>`)}
    ${section('trend', 'This session over time', `<section class="grid2">${trend('trendC', 'Context window used', 'layers')}${trend('trendU', 'API-equivalent value', 'dollar')}</section>`)}
    ${section('folder', 'Power BI projects &amp; GitHub repos', '<section id="projects"></section>')}
    ${section('file', 'Changes this session', '<section id="changes"></section>')}
    <footer class="foot muted">
      <span id="footVer">Claude Code panel</span>
      <button class="link" data-act="report">Report an issue or idea</button>
      <button class="link" data-act="check">Check for updates</button>
      <button class="link" data-act="repo">GitHub</button>
    </footer>
  </main>`

function panelHtml() {
  const nonce = crypto.randomBytes(16).toString('hex')
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`
  const script = SCRIPT_FILES.map(readAsset).join('\n')
  const styles = STYLE_FILES.map(readAsset).join('\n')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${styles}</style></head>
<body>${BODY.replace('<!--NAV-->', navHtml())}<script nonce="${nonce}">${script}</script></body></html>`
}

module.exports = { panelHtml }
