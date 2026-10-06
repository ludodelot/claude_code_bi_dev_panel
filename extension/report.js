const vscode = require('vscode')
const os = require('os')
const { diagnosticsMarkdown, issueUrl } = require('./diagnostics')

const SETTING_KEYS = ['userName', 'pollIntervalMs', 'notifications', 'notifyAt', 'checkForUpdates']

const KINDS = [
  { label: '$(bug) Something is wrong', description: 'An error, wrong numbers or a broken panel', kind: 'bug', prefix: 'Bug: ' },
  { label: '$(lightbulb) Idea or area of opportunity', description: 'A missing feature, a better suggestion or a rough edge', kind: 'idea', prefix: 'Idea: ' },
]

// Names only: values such as the user name are never included.
function changedSettings() {
  const config = vscode.workspace.getConfiguration('claudeUsageBar')
  return SETTING_KEYS.filter(key => {
    const info = config.inspect(key)
    return info && (info.globalValue !== undefined || info.workspaceValue !== undefined)
  })
}

function collect({ context, log, getModData, getUpdateStatus }) {
  return {
    version: context.extension.packageJSON.version,
    vscodeVersion: vscode.version,
    platform: process.platform + ' ' + os.release(),
    modData: getModData(),
    updateStatus: getUpdateStatus(),
    changedSettings: changedSettings(),
    recentErrors: log.recentProblems(),
  }
}

async function reportIssue(deps) {
  const picked = await vscode.window.showQuickPick(KINDS, { title: 'Report to the Claude Code panel project', placeHolder: 'What do you want to share?' })
  if (!picked) return
  const summary = await vscode.window.showInputBox({ title: 'Short summary', prompt: 'One line. You can add details on GitHub.', ignoreFocusOut: true })
  if (!summary) return
  const url = issueUrl({ kind: picked.kind, title: picked.prefix + summary, diagnostics: diagnosticsMarkdown(collect(deps)) })
  await vscode.env.openExternal(vscode.Uri.parse(url))
  vscode.window.showInformationMessage('A draft opened on GitHub. Review it first: nothing is sent until you press Submit.')
}

module.exports = { reportIssue }
