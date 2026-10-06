const test = require('node:test')
const assert = require('node:assert/strict')
const D = require('../extension/diagnostics')

const who = { home: 'C:/Users/jane', user: 'jane' }

test('redact hides the home folder in both slash styles and the account name', () => {
  const out = D.redact('failed at C:\\Users\\jane\\.claude\\x.json and C:/Users/jane/y owner jane', who)
  assert.ok(!/jane/i.test(out))
  assert.ok(out.includes('~'))
})

test('redact hides e-mail addresses and common token formats', () => {
  const out = D.redact('mail a.b@corp.com token ghp_abcdefghijklmnopqrstuvwxyz123456 key sk-abcdefghijklmnopqrstuvwxyz', who)
  assert.ok(!out.includes('a.b@corp.com'))
  assert.ok(!out.includes('ghp_abcdef'))
  assert.ok(!out.includes('sk-abcdef'))
})

test('redact keeps the word "bearer" but hides the credential after it', () => {
  const out = D.redact('Authorization: Bearer abcdefghijklmnop12345678', who)
  assert.ok(/Bearer <redacted>/i.test(out))
})

test('diagnosticsMarkdown lists versions and redacts the log lines', () => {
  const md = D.diagnosticsMarkdown({
    version: '0.6.0', vscodeVersion: '1.99.0', platform: 'win32', modData: 'fresh (3s old)', updateStatus: 'up to date',
    changedSettings: ['notifyAt'], recentErrors: ['activity scan failed at C:/Users/jane/x'], redactWith: who,
  })
  assert.match(md, /Extension version: 0\.6\.0/)
  assert.match(md, /Settings changed from default: notifyAt/)
  assert.match(md, /### Recent log lines/)
  assert.ok(md.includes('activity scan failed at ~/x'))
  assert.ok(!/jane/i.test(md))
})

test('diagnosticsMarkdown marks missing facts as unknown instead of leaving blanks', () => {
  const md = D.diagnosticsMarkdown({})
  assert.match(md, /Extension version: unknown/)
  assert.match(md, /Settings changed from default: none/)
})

test('issueUrl builds a GitHub new-issue link with the right label', () => {
  const url = new URL(D.issueUrl({ kind: 'idea', title: 'More rules', diagnostics: 'diag' }))
  assert.equal(url.hostname, 'github.com')
  assert.ok(url.pathname.endsWith('/issues/new'))
  assert.equal(url.searchParams.get('labels'), 'enhancement')
  assert.equal(url.searchParams.get('title'), 'More rules')
  assert.match(url.searchParams.get('body'), /opportunity or idea/)
})

test('issueUrl caps the body so the link stays usable', () => {
  const url = new URL(D.issueUrl({ kind: 'bug', title: 't', diagnostics: 'x'.repeat(50000) }))
  assert.ok(url.searchParams.get('body').length <= D.MAX_URL_BODY_CHARS)
})

test('issueUrl falls back to the bug template for unknown kinds', () => {
  const url = new URL(D.issueUrl({ kind: 'nope', title: 't' }))
  assert.equal(url.searchParams.get('labels'), 'bug')
})
