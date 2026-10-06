const test = require('node:test')
const assert = require('node:assert/strict')
const { historyToCsv } = require('../extension/history-csv')

test('historyToCsv writes a header and one row per sample', () => {
  const csv = historyToCsv([{ t: Date.UTC(2026, 0, 1), f: 10, fr: 'r1', s: null, sr: null, c: 5, u: 1.5 }])
  const [header, row] = csv.trim().split('\n')
  assert.equal(header, 'time,five_hour_percent,five_hour_resets_at,seven_day_percent,seven_day_resets_at,context_percent,usd_equivalent')
  assert.equal(row, '2026-01-01T00:00:00.000Z,10,r1,,,5,1.5')
})

test('historyToCsv quotes cells containing commas or quotes', () => {
  const csv = historyToCsv([{ t: 0, f: 1, fr: 'a,"b"' }])
  assert.ok(csv.includes('"a,""b"""'))
})
