// Formatting helpers shared by the extension host (require) and the webview (concatenated script).
const Format = (() => {
  const MS_PER_MINUTE = 60000
  const MINUTES_PER_HOUR = 60
  const HOURS_BEFORE_DAYS = 48
  const MILLION = 1e6
  const THOUSAND = 1e3

  const span = ms => {
    const m = Math.max(0, Math.round(ms / MS_PER_MINUTE))
    const h = Math.floor(m / MINUTES_PER_HOUR)
    if (h >= HOURS_BEFORE_DAYS) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h'
    return h >= 1 ? h + 'h ' + String(m % MINUTES_PER_HOUR).padStart(2, '0') + 'm' : m + 'm'
  }

  const tokens = n => {
    if (n >= MILLION) return (n / MILLION).toFixed(1) + 'M'
    if (n >= THOUSAND) return Math.round(n / THOUSAND) + 'k'
    return String(Math.round(n))
  }

  const money = n => '$' + n.toFixed(2)
  const percent = n => Math.round(n) + '%'
  const clock = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const dayClock = ms => new Date(ms).toLocaleDateString([], { weekday: 'short' }) + ' ' + clock(ms)
  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's')

  return { span, tokens, money, percent, clock, dayClock, plural }
})()

const { span, tokens, money, percent, clock, dayClock, plural } = Format

if (typeof module !== 'undefined') module.exports = Format
