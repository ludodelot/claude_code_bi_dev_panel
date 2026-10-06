const vscode = require('vscode')
const https = require('https')
const fs = require('fs')
const path = require('path')
const { RELEASES_LATEST_API, REPO_URL } = require('./meta')
const { isNewer, describeRelease, verifyDownload } = require('./update-check')

const CHECK_INTERVAL_MS = 24 * 3600 * 1000
const LAST_CHECK_KEY = 'claudeUsageBar.lastUpdateCheck'
const REQUEST_TIMEOUT_MS = 10000
const MAX_JSON_BYTES = 512 * 1024
const MAX_VSIX_BYTES = 20 * 1024 * 1024
const MAX_REDIRECTS = 4
const ALLOWED_HOSTS = new Set(['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'])

function download(url, maxBytes, redirects = 0) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) return reject(new Error('Blocked host: ' + target.hostname))
    const request = https.get(target, { headers: { 'User-Agent': 'claude-usage-bar', Accept: 'application/vnd.github+json' }, timeout: REQUEST_TIMEOUT_MS }, response => {
      const { statusCode, headers } = response
      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        response.resume()
        if (redirects >= MAX_REDIRECTS) return reject(new Error('Too many redirects'))
        return resolve(download(new URL(headers.location, target).toString(), maxBytes, redirects + 1))
      }
      if (statusCode !== 200) {
        response.resume()
        return reject(new Error('HTTP ' + statusCode))
      }
      const chunks = []
      let size = 0
      response.on('data', chunk => {
        size += chunk.length
        if (size > maxBytes) return request.destroy(new Error('Download too large'))
        chunks.push(chunk)
      })
      response.on('end', () => resolve(Buffer.concat(chunks)))
      response.on('error', reject)
    })
    request.on('timeout', () => request.destroy(new Error('Request timed out')))
    request.on('error', reject)
  })
}

async function fetchLatest() {
  const json = JSON.parse((await download(RELEASES_LATEST_API, MAX_JSON_BYTES)).toString('utf8'))
  return describeRelease(json)
}

async function installRelease(context, release, log) {
  const [vsix, sums] = await Promise.all([download(release.vsix.url, MAX_VSIX_BYTES), download(release.sumsUrl, MAX_JSON_BYTES)])
  const check = verifyDownload(vsix, sums.toString('utf8'), release.vsix.name)
  if (!check.ok) throw new Error(check.reason)
  fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true })
  const file = path.join(context.globalStorageUri.fsPath, release.vsix.name)
  fs.writeFileSync(file, vsix)
  await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(file))
  log.info('Installed ' + release.vsix.name + ' (checksum verified)')
}

// Update flow. `onResult` receives { status, release? } so the panel and the issue report can show it.
function createUpdater(context, log, onResult) {
  const current = context.extension.packageJSON.version
  let latest = null

  const announce = async release => {
    const choice = await vscode.window.showInformationMessage(
      'Claude Code panel ' + release.version + ' is available (you have ' + current + ').',
      'Update now', 'Release notes', 'Later',
    )
    if (choice === 'Release notes') vscode.env.openExternal(vscode.Uri.parse(release.notesUrl || REPO_URL + '/releases'))
    if (choice === 'Update now') await apply(release)
  }

  const apply = async release => {
    try {
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Updating Claude Code panel…' }, () => installRelease(context, release, log))
      const choice = await vscode.window.showInformationMessage('Updated to ' + release.version + '. Reload to use it.', 'Reload now')
      if (choice === 'Reload now') vscode.commands.executeCommand('workbench.action.reloadWindow')
    } catch (error) {
      log.error('Update failed', error)
      const choice = await vscode.window.showErrorMessage('Could not update: ' + error.message, 'Report issue', 'Open releases')
      if (choice === 'Report issue') vscode.commands.executeCommand('claudeUsageBar.reportIssue')
      if (choice === 'Open releases') vscode.env.openExternal(vscode.Uri.parse(REPO_URL + '/releases'))
    }
  }

  const check = async ({ manual = false } = {}) => {
    if (!manual) {
      const enabled = vscode.workspace.getConfiguration('claudeUsageBar').get('checkForUpdates') !== false
      const last = Number(context.globalState.get(LAST_CHECK_KEY) || 0)
      if (!enabled || Date.now() - last < CHECK_INTERVAL_MS) return
    }
    try {
      await context.globalState.update(LAST_CHECK_KEY, Date.now())
      const release = await fetchLatest()
      latest = release && isNewer(release.version, current) ? release : null
      onResult({ status: latest ? 'update ' + latest.version + ' available' : 'up to date', release: latest })
      if (latest) await announce(latest)
      else if (manual) vscode.window.showInformationMessage('Claude Code panel ' + current + ' is the latest version.')
    } catch (error) {
      log.warn('Update check failed', error)
      onResult({ status: 'check failed', release: null })
      if (manual) vscode.window.showWarningMessage('Could not check for updates: ' + error.message)
    }
  }

  return { check, apply: () => (latest ? apply(latest) : check({ manual: true })), current: () => current, latest: () => latest }
}

module.exports = { createUpdater }
