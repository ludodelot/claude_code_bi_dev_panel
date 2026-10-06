const test = require('node:test')
const assert = require('node:assert/strict')
const { panelHtml } = require('../extension/panel')

test('panelHtml ships a strict CSP and a nav entry per section', () => {
  const html = panelHtml()
  assert.match(html, /default-src 'none'/)
  assert.match(html, /script-src 'nonce-[0-9a-f]{32}'/)
  const navLinks = html.match(/data-sec="sec-[a-z0-9-]+"/g) || []
  const sectionIds = html.match(/<h2 id="sec-[a-z0-9-]+"/g) || []
  assert.ok(sectionIds.length > 0)
  assert.equal(navLinks.length, sectionIds.length)
})

test('panelHtml uses a fresh nonce per call', () => {
  const nonce = h => h.match(/nonce-([0-9a-f]+)/)[1]
  assert.notEqual(nonce(panelHtml()), nonce(panelHtml()))
})

test('the concatenated webview script parses (no duplicate top-level declarations)', () => {
  const html = panelHtml()
  const script = html.slice(html.indexOf('<script nonce='), html.lastIndexOf('</script>')).replace(/^<script nonce="[^"]+">/, '')
  assert.doesNotThrow(() => new Function(script))
})
