const COLUMNS = [
  ['time', h => new Date(h.t).toISOString()],
  ['five_hour_percent', h => h.f],
  ['five_hour_resets_at', h => h.fr],
  ['seven_day_percent', h => h.s],
  ['seven_day_resets_at', h => h.sr],
  ['context_percent', h => h.c],
  ['usd_equivalent', h => h.u],
]

const cell = value => {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}

function historyToCsv(history) {
  const header = COLUMNS.map(([name]) => name).join(',')
  const rows = history.map(h => COLUMNS.map(([, read]) => cell(read(h))).join(','))
  return [header, ...rows].join('\n') + '\n'
}

module.exports = { historyToCsv }
