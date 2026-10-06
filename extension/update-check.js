const crypto = require('crypto')
const { RELEASE_DOWNLOAD_PREFIX, VSIX_NAME, SUMS_NAME } = require('./meta')

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/
const SHA256_HEX = /^[0-9a-f]{64}$/i

function parseVersion(text) {
  const match = VERSION_PATTERN.exec(String(text || '').trim())
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

// True only when both versions parse and `latest` is strictly newer than `current`.
function isNewer(latest, current) {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}

const isOfficialDownload = url => typeof url === 'string' && url.startsWith(RELEASE_DOWNLOAD_PREFIX)

// Reads GitHub's "latest release" JSON. Returns null unless it carries a trusted .vsix and its checksum file.
function describeRelease(release) {
  if (!release || release.draft || release.prerelease || !parseVersion(release.tag_name)) return null
  const assets = Array.isArray(release.assets) ? release.assets : []
  const trusted = assets.filter(a => isOfficialDownload(a.browser_download_url))
  const vsix = trusted.find(a => VSIX_NAME.test(a.name))
  const sums = trusted.find(a => a.name === SUMS_NAME)
  if (!vsix || !sums) return null
  return {
    version: release.tag_name.replace(/^v/, ''),
    notesUrl: release.html_url,
    vsix: { name: vsix.name, url: vsix.browser_download_url, size: vsix.size },
    sumsUrl: sums.browser_download_url,
  }
}

// SHA256SUMS lines look like "<64 hex>  <file name>" (a "*" before the name marks binary mode).
function expectedHash(sumsText, fileName) {
  for (const line of String(sumsText || '').split('\n')) {
    const match = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i.exec(line.trim())
    if (match && match[2] === fileName && SHA256_HEX.test(match[1])) return match[1].toLowerCase()
  }
  return null
}

function verifyDownload(buffer, sumsText, fileName) {
  const expected = expectedHash(sumsText, fileName)
  if (!expected) return { ok: false, reason: 'No checksum listed for ' + fileName }
  const actual = crypto.createHash('sha256').update(buffer).digest('hex')
  return actual === expected ? { ok: true } : { ok: false, reason: 'Checksum mismatch for ' + fileName }
}

module.exports = { parseVersion, isNewer, describeRelease, expectedHash, verifyDownload, isOfficialDownload }
