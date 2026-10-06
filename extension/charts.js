const CHART_W = 300
const CHART_H = 100
const CHART_PAD_X = 3
const CHART_PAD_TOP = 8
const CHART_PAD_BOTTOM = 6
const SPARK_W = 100
const SPARK_H = 28
const SPARK_PAD = 3
const DONUT_R = 38
const DONUT_C = 2 * Math.PI * DONUT_R
const DONUT_GAP = 2.5
const DONUT_MIN_SEG = 1.5
const TIP_EDGE_PX = 64

const fixed = n => n.toFixed(1)

function pathOf(points) {
  return points.map((p, i) => (i ? 'L' : 'M') + fixed(p[0]) + ' ' + fixed(p[1])).join(' ')
}

function sparkPaths(values) {
  if (values.length < 2) return { line: '', area: '' }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const range = hi - lo || 1
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * SPARK_W,
    SPARK_H - SPARK_PAD - ((v - lo) / range) * (SPARK_H - 2 * SPARK_PAD),
  ])
  const line = pathOf(pts)
  return { line, area: line + ' L' + SPARK_W + ' ' + SPARK_H + ' L0 ' + SPARK_H + ' Z' }
}

function setSpark(svg, values) {
  const { line, area } = sparkPaths(values)
  svg.querySelector('.a').setAttribute('d', area)
  const l = svg.querySelector('.l')
  l.setAttribute('pathLength', '1')
  l.setAttribute('d', line)
  svg.classList.toggle('empty', !line)
}

function seriesGeometry(cfg) {
  const innerW = CHART_W - 2 * CHART_PAD_X
  const innerH = CHART_H - CHART_PAD_TOP - CHART_PAD_BOTTOM
  const x = t => CHART_PAD_X + clamp((t - cfg.x0) / (cfg.x1 - cfg.x0 || 1), 0, 1) * innerW
  const y = v => CHART_H - CHART_PAD_BOTTOM - clamp((v - cfg.y0) / (cfg.y1 - cfg.y0 || 1), 0, 1) * innerH
  return { x, y }
}

function seriesMarkup(cfg, geo) {
  const { x, y } = geo
  const toPath = list => pathOf(list.map(p => [x(p.t), y(p.v)]))
  const first = cfg.pts[0]
  const last = cfg.pts[cfg.pts.length - 1]
  const line = toPath(cfg.pts)
  const area = line + ' L' + fixed(x(last.t)) + ' ' + CHART_H + ' L' + fixed(x(first.t)) + ' ' + CHART_H + ' Z'
  const grid = cfg.grid
    .map(v => {
      const gy = fixed(y(v))
      return '<line class="gl" x1="0" x2="' + CHART_W + '" y1="' + gy + '" y2="' + gy + '"/><text class="gt" x="2" y="' + (Number(gy) - 2) + '">' + cfg.fmtAxis(v) + '</text>'
    })
    .join('')
  const ideal = cfg.ideal ? '<path class="ideal" d="' + toPath(cfg.ideal) + '"/>' : ''
  const proj = cfg.proj ? '<path class="proj" d="' + toPath(cfg.proj) + '"/>' : ''
  const nowX = fixed(x(last.t))
  const nowY = fixed(y(last.v))
  return (
    '<defs><linearGradient id="grad-' + cfg.id + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="var(--c)" stop-opacity=".38"/><stop offset="1" stop-color="var(--c)" stop-opacity="0"/></linearGradient></defs>' +
    grid + ideal +
    '<path class="area" fill="url(#grad-' + cfg.id + ')" d="' + area + '"/>' +
    '<path class="line" pathLength="1" d="' + line + '"/>' + proj +
    '<line class="xh" y1="' + CHART_PAD_TOP + '" y2="' + (CHART_H - CHART_PAD_BOTTOM) + '"/><circle class="hd" r="3.6"/>' +
    '<circle class="now-ring" cx="' + nowX + '" cy="' + nowY + '" r="3"/><circle class="now" cx="' + nowX + '" cy="' + nowY + '" r="3"/>'
  )
}

function clearSeries(svg) {
  svg.replaceChildren()
  svg._cfg = null
}

function renderSeriesChart(svg, cfg) {
  if (cfg.pts.length < 2) return clearSeries(svg)
  const geo = seriesGeometry(cfg)
  svg.innerHTML = seriesMarkup(cfg, geo)
  svg._cfg = { ...cfg, ...geo }
  svg.setAttribute('aria-label', cfg.label + ': ' + cfg.fmtValue(cfg.pts[cfg.pts.length - 1].v) + ' now')
  wireHover(svg)
}

function nearestPoint(cfg, px) {
  return cfg.pts.reduce((best, p) => (Math.abs(cfg.x(p.t) - px) < Math.abs(cfg.x(best.t) - px) ? p : best), cfg.pts[0])
}

function showTip(svg, point) {
  const cfg = svg._cfg
  const rect = svg.getBoundingClientRect()
  const cx = cfg.x(point.t)
  const cy = cfg.y(point.v)
  svg.querySelector('.xh').setAttribute('x1', fixed(cx))
  svg.querySelector('.xh').setAttribute('x2', fixed(cx))
  const dot = svg.querySelector('.hd')
  dot.setAttribute('cx', fixed(cx))
  dot.setAttribute('cy', fixed(cy))
  svg.classList.add('hovering')
  const tip = svg.parentNode.querySelector('.tip')
  tip.replaceChildren(el('b', '', cfg.fmtValue(point.v)), el('span', '', cfg.fmtTime(point.t)))
  const left = clamp((cx / CHART_W) * rect.width, TIP_EDGE_PX, rect.width - TIP_EDGE_PX)
  tip.style.left = left + 'px'
  tip.style.top = (cy / CHART_H) * rect.height + 'px'
  tip.classList.add('on')
}

function hideTip(svg) {
  svg.classList.remove('hovering')
  svg.parentNode.querySelector('.tip').classList.remove('on')
}

function wireHover(svg) {
  if (svg._wired) return
  svg._wired = true
  svg.addEventListener('mousemove', ev => {
    const cfg = svg._cfg
    if (!cfg) return
    const rect = svg.getBoundingClientRect()
    showTip(svg, nearestPoint(cfg, ((ev.clientX - rect.left) / rect.width) * CHART_W))
  })
  svg.addEventListener('mouseleave', () => hideTip(svg))
}

function setDonut(root, parts, total) {
  const circles = root.querySelectorAll('.seg')
  let offset = 0
  parts.forEach((p, i) => {
    const share = total > 0 ? p.value / total : 0
    const raw = share * DONUT_C
    const length = p.value > 0 ? Math.max(DONUT_MIN_SEG, raw - DONUT_GAP) : 0
    circles[i].style.strokeDasharray = fixed(length) + ' ' + fixed(DONUT_C)
    circles[i].style.strokeDashoffset = fixed(-offset)
    offset += raw
  })
}
