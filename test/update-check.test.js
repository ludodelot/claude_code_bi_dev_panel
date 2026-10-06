const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const U = require('../extension/update-check')
const { RELEASE_DOWNLOAD_PREFIX } = require('../extension/meta')

const asset = (name, url) => ({ name, browser_download_url: url || RELEASE_DOWNLOAD_PREFIX + 'v1.2.3/' + name, size: 10 })

const release = (overrides = {}) => ({
  tag_name: 'v1.2.3',
  html_url: 'https://github.com/x/y/releases/tag/v1.2.3',
  draft: false,
  prerelease: false,
  assets: [asset('claude-usage-bar-1.2.3.vsix'), asset('SHA256SUMS')],
  ...overrides,
})

test('isNewer compares numerically, not as text', () => {
  assert.equal(U.isNewer('0.10.0', '0.9.0'), true)
  assert.equal(U.isNewer('v1.0.0', '0.99.99'), true)
  assert.equal(U.isNewer('0.5.0', '0.5.0'), false)
  assert.equal(U.isNewer('0.4.9', '0.5.0'), false)
})

test('isNewer is false when either version is not plain semver', () => {
  assert.equal(U.isNewer('1.0.0-beta', '0.5.0'), false)
  assert.equal(U.isNewer('latest', '0.5.0'), false)
  assert.equal(U.isNewer('1.0.0', undefined), false)
})

test('describeRelease returns the vsix and checksum file of a normal release', () => {
  const d = U.describeRelease(release())
  assert.equal(d.version, '1.2.3')
  assert.equal(d.vsix.name, 'claude-usage-bar-1.2.3.vsix')
  assert.ok(d.sumsUrl.endsWith('/SHA256SUMS'))
})

test('describeRelease ignores drafts, prereleases and releases without a checksum file', () => {
  assert.equal(U.describeRelease(release({ draft: true })), null)
  assert.equal(U.describeRelease(release({ prerelease: true })), null)
  assert.equal(U.describeRelease(release({ assets: [asset('claude-usage-bar-1.2.3.vsix')] })), null)
  assert.equal(U.describeRelease(null), null)
})

test('describeRelease refuses assets hosted outside this repository', () => {
  const evil = [asset('claude-usage-bar-1.2.3.vsix', 'https://evil.example/claude-usage-bar-1.2.3.vsix'), asset('SHA256SUMS')]
  assert.equal(U.describeRelease(release({ assets: evil })), null)
})

test('describeRelease refuses unexpected file names', () => {
  const odd = [asset('totally-different.vsix'), asset('SHA256SUMS')]
  assert.equal(U.describeRelease(release({ assets: odd })), null)
})

test('verifyDownload accepts a matching checksum and rejects tampering or missing entries', () => {
  const data = Buffer.from('vsix bytes')
  const hash = crypto.createHash('sha256').update(data).digest('hex')
  const sums = hash + '  claude-usage-bar-1.2.3.vsix\n' + 'a'.repeat(64) + '  other.txt\n'
  assert.deepEqual(U.verifyDownload(data, sums, 'claude-usage-bar-1.2.3.vsix'), { ok: true })
  assert.equal(U.verifyDownload(Buffer.from('tampered'), sums, 'claude-usage-bar-1.2.3.vsix').ok, false)
  assert.equal(U.verifyDownload(data, sums, 'claude-usage-bar-9.9.9.vsix').ok, false)
  assert.equal(U.verifyDownload(data, '', 'claude-usage-bar-1.2.3.vsix').ok, false)
})

test('expectedHash understands the binary-mode marker', () => {
  const hash = 'b'.repeat(64)
  assert.equal(U.expectedHash(hash + ' *file.vsix', 'file.vsix'), hash)
})
