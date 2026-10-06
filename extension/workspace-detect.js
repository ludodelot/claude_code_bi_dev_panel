const fs = require('fs')
const path = require('path')

const MAX_SCAN_DEPTH = 3
const MAX_SCAN_ENTRIES = 2000
const MAX_PBIP_ITEMS = 12
const IGNORED_DIRS = new Set(['.git', 'node_modules', '.venv', '__pycache__', '.vscode', 'dist', 'build'])
const PBI_SUFFIXES = [
  ['.pbip', 'pbip'],
  ['.semanticmodel', 'models'],
  ['.report', 'reports'],
]
const PBI_PATH = /^(.*?)[\\/]([^\\/]+)\.(SemanticModel|Report)(?:[\\/]|$)/i

const readText = file => {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

const isDir = p => {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

// Walk up from a file or folder until a folder containing .git is found.
function findRepoRoot(start) {
  // A relative path would be resolved against the current folder and could match an unrelated repository.
  if (!start || !path.isAbsolute(start)) return null
  let dir = start
  for (let i = 0; i < 40 && dir; i += 1) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

// .git is a folder in normal clones and a "gitdir: ..." file in worktrees and submodules.
function resolveGitDir(root) {
  const dotGit = path.join(root, '.git')
  if (isDir(dotGit)) return dotGit
  const pointer = readText(dotGit)
  const match = pointer && /^gitdir:\s*(.+)$/m.exec(pointer)
  return match ? path.resolve(root, match[1].trim()) : null
}

function parseBranch(headText) {
  if (!headText) return null
  const ref = /^ref:\s*refs\/heads\/(.+)$/m.exec(headText)
  if (ref) return ref[1].trim()
  return /^[0-9a-f]{7,40}$/m.test(headText.trim()) ? 'detached HEAD' : null
}

function parseRemoteUrl(configText) {
  if (!configText) return null
  const origin = /\[remote "origin"\]([^[]*)/.exec(configText)
  const url = origin && /^\s*url\s*=\s*(.+)$/m.exec(origin[1])
  return url ? url[1].trim() : null
}

// Accepts https://github.com/o/r(.git) and git@github.com:o/r(.git); anything else is not GitHub.
function githubSlug(url) {
  if (!url) return null
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(url)
  return match ? match[1] + '/' + match[2] : null
}

function readGitInfo(root) {
  const gitDir = resolveGitDir(root)
  if (!gitDir) return { branch: null, remote: null, githubSlug: null }
  const commonRef = readText(path.join(gitDir, 'commondir'))
  const configDir = commonRef ? path.resolve(gitDir, commonRef.trim()) : gitDir
  const remote = parseRemoteUrl(readText(path.join(configDir, 'config')))
  return { branch: parseBranch(readText(path.join(gitDir, 'HEAD'))), remote, githubSlug: githubSlug(remote) }
}

const emptyPbi = () => ({ pbip: [], models: [], reports: [] })

const withItem = (pbi, key, name) =>
  pbi[key].includes(name) || pbi[key].length >= MAX_PBIP_ITEMS ? pbi : { ...pbi, [key]: [...pbi[key], name] }

// Shallow scan for Power BI project folders and files below a directory.
function scanPbi(root) {
  let pbi = emptyPbi()
  let seen = 0
  const visit = (dir, depth) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      seen += 1
      if (seen > MAX_SCAN_ENTRIES) return
      const lower = entry.name.toLowerCase()
      const hit = PBI_SUFFIXES.find(([suffix]) => lower.endsWith(suffix))
      if (hit) pbi = withItem(pbi, hit[1], entry.name)
      if (entry.isDirectory() && depth < MAX_SCAN_DEPTH && !IGNORED_DIRS.has(entry.name) && !hit) {
        visit(path.join(dir, entry.name), depth + 1)
      }
    }
  }
  visit(root, 0)
  return pbi
}

// A touched file inside X.SemanticModel or X.Report reveals the project without scanning.
function pbiFromPath(file) {
  const match = PBI_PATH.exec(file)
  if (!match) return null
  const [, dir, name, kind] = match
  return { dir, name: name + '.' + kind, key: kind.toLowerCase() === 'report' ? 'reports' : 'models' }
}

function describeWorkspace(startDir, touchedFiles = []) {
  const root = findRepoRoot(startDir)
  const git = root ? readGitInfo(root) : { branch: null, remote: null, githubSlug: null }
  const scanBase = root || startDir
  let pbi = isDir(scanBase) ? scanPbi(scanBase) : emptyPbi()
  let pbiDir = null
  for (const file of touchedFiles) {
    const hit = pbiFromPath(file)
    if (!hit) continue
    pbiDir = pbiDir || hit.dir
    pbi = withItem(pbi, hit.key, hit.name)
  }
  const hasPbi = pbi.pbip.length + pbi.models.length + pbi.reports.length > 0
  return {
    dir: startDir,
    repoRoot: root,
    repoName: root ? path.basename(root) : null,
    branch: git.branch,
    githubSlug: git.githubSlug,
    pbipDir: hasPbi ? pbiDir || scanBase : null,
    ...pbi,
    hasPbi,
  }
}

module.exports = { findRepoRoot, readGitInfo, parseBranch, parseRemoteUrl, githubSlug, scanPbi, pbiFromPath, describeWorkspace }
