const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const W = require('../extension/workspace-detect')

const withTempDir = run => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-test-'))
  try {
    return run(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

const touch = (file, text = '') => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

const makeRepo = (root, { branch = 'main', url = 'https://github.com/acme/sales.git' } = {}) => {
  touch(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/' + branch + '\n')
  touch(path.join(root, '.git', 'config'), '[core]\n\tbare = false\n[remote "origin"]\n\turl = ' + url + '\n')
}

test('githubSlug understands https and ssh remotes and rejects other hosts', () => {
  assert.equal(W.githubSlug('https://github.com/acme/sales.git'), 'acme/sales')
  assert.equal(W.githubSlug('git@github.com:acme/sales.git'), 'acme/sales')
  assert.equal(W.githubSlug('https://github.com/acme/sales'), 'acme/sales')
  assert.equal(W.githubSlug('https://gitlab.com/acme/sales.git'), null)
  assert.equal(W.githubSlug(null), null)
})

test('parseBranch reads a branch, a detached HEAD, or nothing', () => {
  assert.equal(W.parseBranch('ref: refs/heads/feature/x\n'), 'feature/x')
  assert.equal(W.parseBranch('1f2e3d4c5b6a79881f2e3d4c5b6a79881f2e3d4c\n'), 'detached HEAD')
  assert.equal(W.parseBranch(''), null)
  assert.equal(W.parseBranch(null), null)
})

test('findRepoRoot walks up from a nested file and returns null outside a repo', () =>
  withTempDir(dir => {
    makeRepo(path.join(dir, 'repo'))
    fs.mkdirSync(path.join(dir, 'repo', 'a', 'b'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'loose'), { recursive: true })
    assert.equal(W.findRepoRoot(path.join(dir, 'repo', 'a', 'b')), path.join(dir, 'repo'))
    assert.equal(W.findRepoRoot(path.join(dir, 'loose')), null)
  }))

test('readGitInfo returns branch and GitHub slug', () =>
  withTempDir(dir => {
    makeRepo(dir, { branch: 'dev' })
    assert.deepEqual(W.readGitInfo(dir), { branch: 'dev', remote: 'https://github.com/acme/sales.git', githubSlug: 'acme/sales' })
  }))

test('readGitInfo follows a worktree pointer file', () =>
  withTempDir(dir => {
    const main = path.join(dir, 'main')
    makeRepo(main)
    const gitDir = path.join(main, '.git', 'worktrees', 'wt')
    touch(path.join(gitDir, 'HEAD'), 'ref: refs/heads/wt-branch\n')
    touch(path.join(gitDir, 'commondir'), '../..\n')
    const wt = path.join(dir, 'wt')
    touch(path.join(wt, '.git'), 'gitdir: ' + gitDir + '\n')
    const info = W.readGitInfo(wt)
    assert.equal(info.branch, 'wt-branch')
    assert.equal(info.githubSlug, 'acme/sales')
  }))

test('scanPbi finds project files and folders but skips node_modules', () =>
  withTempDir(dir => {
    touch(path.join(dir, 'Sales.pbip'))
    touch(path.join(dir, 'Sales.SemanticModel', 'definition.pbism'))
    touch(path.join(dir, 'Sales.Report', 'definition.pbir'))
    touch(path.join(dir, 'node_modules', 'Hidden.Report', 'x'))
    const pbi = W.scanPbi(dir)
    assert.deepEqual(pbi.pbip, ['Sales.pbip'])
    assert.deepEqual(pbi.models, ['Sales.SemanticModel'])
    assert.deepEqual(pbi.reports, ['Sales.Report'])
  }))

test('pbiFromPath derives the project from a touched TMDL file', () => {
  const hit = W.pbiFromPath('C:\\work\\bi\\Sales.SemanticModel\\definition\\tables\\Fact.tmdl')
  assert.deepEqual(hit, { dir: 'C:\\work\\bi', name: 'Sales.SemanticModel', key: 'models' })
  assert.equal(W.pbiFromPath('C:\\work\\notes.md'), null)
})

test('describeWorkspace combines repo, GitHub and Power BI detection', () =>
  withTempDir(dir => {
    makeRepo(dir)
    touch(path.join(dir, 'Sales.pbip'))
    touch(path.join(dir, 'Sales.SemanticModel', 'definition', 'tables', 'Fact.tmdl'))
    const ws = W.describeWorkspace(dir, [path.join(dir, 'Sales.SemanticModel', 'definition', 'tables', 'Fact.tmdl')])
    assert.equal(ws.repoName, path.basename(dir))
    assert.equal(ws.githubSlug, 'acme/sales')
    assert.equal(ws.branch, 'main')
    assert.equal(ws.hasPbi, true)
    assert.deepEqual(ws.pbip, ['Sales.pbip'])
  }))

test('describeWorkspace reports nothing for a plain folder', () =>
  withTempDir(dir => {
    const ws = W.describeWorkspace(dir, [])
    assert.equal(ws.repoRoot, null)
    assert.equal(ws.githubSlug, null)
    assert.equal(ws.hasPbi, false)
  }))

test('findRepoRoot ignores relative paths instead of matching the current folder', () => {
  assert.equal(W.findRepoRoot('.'), null)
  assert.equal(W.findRepoRoot('some/relative/dir'), null)
  assert.equal(W.findRepoRoot(''), null)
})
