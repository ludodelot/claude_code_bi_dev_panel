const os = require('os')
const { ISSUES_NEW_URL } = require('./meta')

const MAX_URL_BODY_CHARS = 6000
const MAX_LOG_LINES = 15
const REDACTED = '<redacted>'

const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /(bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi,
]
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Reports are public: strip secrets, e-mail addresses, the home folder and the account name.
function redact(text, { home = os.homedir(), user = os.userInfo().username } = {}) {
  let out = String(text)
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, (m, prefix) => (prefix ? prefix + REDACTED : REDACTED))
  out = out.replace(EMAIL, '<email>')
  if (home) {
    const variants = [home, home.replace(/\\/g, '/'), home.replace(/\//g, '\\')]
    for (const v of new Set(variants)) out = out.replace(new RegExp(escapeRegExp(v), 'gi'), '~')
  }
  if (user && user.length > 2) out = out.replace(new RegExp('\\b' + escapeRegExp(user) + '\\b', 'gi'), '<user>')
  return out
}

const bullet = (label, value) => '- ' + label + ': ' + (value === undefined || value === null || value === '' ? 'unknown' : value)

function diagnosticsMarkdown(info) {
  const lines = [
    '### Environment',
    bullet('Extension version', info.version),
    bullet('VS Code', info.vscodeVersion),
    bullet('OS', info.platform),
    bullet('Usage data (usage-band mod)', info.modData),
    bullet('Update check', info.updateStatus),
    bullet('Settings changed from default', info.changedSettings && info.changedSettings.length ? info.changedSettings.join(', ') : 'none'),
  ]
  const errors = (info.recentErrors || []).slice(-MAX_LOG_LINES)
  if (errors.length) lines.push('', '### Recent log lines', '```', ...errors.map(e => redact(e, info.redactWith)), '```')
  return lines.join('\n')
}

const TEMPLATES = {
  bug: { label: 'bug', heading: '### What happened\n\n### What you expected\n\n### Steps to reproduce\n1. \n' },
  idea: { label: 'enhancement', heading: '### The opportunity or idea\n\n### Why it matters in your day-to-day work\n\n### How you imagine it working\n' },
}

// Pre-filled "new issue" link. The reporter reviews everything on GitHub before submitting.
function issueUrl({ kind = 'bug', title = '', diagnostics = '' }) {
  const template = TEMPLATES[kind] || TEMPLATES.bug
  const body = (template.heading + '\n\n' + diagnostics).slice(0, MAX_URL_BODY_CHARS)
  const params = new URLSearchParams({ title, body, labels: template.label })
  return ISSUES_NEW_URL + '?' + params.toString()
}

module.exports = { redact, diagnosticsMarkdown, issueUrl, MAX_URL_BODY_CHARS }
