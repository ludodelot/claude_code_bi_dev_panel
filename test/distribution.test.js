const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { REPO_URL, VSIX_NAME } = require('../extension/meta')

const root = path.join(__dirname, '..')
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))

test('the marketplace lists plugins whose folders and manifests exist', () => {
  const market = readJson('.claude-plugin/marketplace.json')
  assert.ok(market.name && market.owner && market.owner.name)
  assert.ok(market.plugins.length > 0)
  for (const plugin of market.plugins) {
    const manifest = readJson(path.join(plugin.source, '.claude-plugin/plugin.json'))
    assert.equal(manifest.name, plugin.name, 'plugin name must match its manifest')
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/)
  }
})

test('every skill has a name matching its folder and a description that says when to use it', () => {
  const skillsDir = path.join(root, 'plugins/usage-panel-tools/skills')
  const folders = fs.readdirSync(skillsDir)
  assert.ok(folders.includes('report-issue') && folders.includes('install-panel'))
  for (const folder of folders) {
    const text = fs.readFileSync(path.join(skillsDir, folder, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n')
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text)
    assert.ok(front, folder + ' needs frontmatter')
    assert.match(front[1], new RegExp('^name: ' + folder + '$', 'm'))
    const description = /^description: (.+)$/m.exec(front[1])
    assert.ok(description && description[1].length > 60, folder + ' needs a real description')
    assert.match(description[1], /Use when/)
  }
})

test('the report-issue skill keeps its privacy rules and asks before sending', () => {
  const text = fs.readFileSync(path.join(root, 'plugins/usage-panel-tools/skills/report-issue/SKILL.md'), 'utf8')
  assert.match(text, /Never include prompts/)
  assert.match(text, /explicit yes/)
})

test('the install-panel skill verifies the checksum before installing', () => {
  const text = fs.readFileSync(path.join(root, 'plugins/usage-panel-tools/skills/install-panel/SKILL.md'), 'utf8')
  assert.match(text, /SHA256SUMS/)
  assert.ok(text.indexOf('Verify the checksum') < text.indexOf('code --install-extension <full path'))
})

test('the extension manifest points to the public repository and declares every command it registers', () => {
  const pkg = readJson('extension/package.json')
  assert.equal(pkg.repository.url, REPO_URL + '.git')
  const declared = pkg.contributes.commands.map(c => c.command)
  const source = fs.readFileSync(path.join(root, 'extension/extension.js'), 'utf8')
  const registered = [...source.matchAll(/registerCommand\('([^']+)'/g)].map(m => m[1])
  for (const command of registered) assert.ok(declared.includes(command), command + ' is not declared in package.json')
})

test('the packaged file name matches what the update check accepts', () => {
  const pkg = readJson('extension/package.json')
  assert.match('claude-usage-bar-' + pkg.version + '.vsix', VSIX_NAME)
})

test('the release workflow publishes the checksum file the updater requires', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8')
  assert.match(workflow, /SHA256SUMS/)
  assert.match(workflow, /tags: \['v\*'\]/)
})
