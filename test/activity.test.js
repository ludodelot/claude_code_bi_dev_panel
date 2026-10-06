const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const X = require('../extension/activity')

const assistant = (id, usage, extra = {}) => ({
  type: 'assistant',
  timestamp: '2026-01-01T10:00:00Z',
  uuid: id,
  message: { id, usage, content: [], ...extra },
})

test('burned excludes cache reads', () => {
  assert.equal(X.burned({ input: 1, output: 2, cacheWrite: 3, cacheRead: 999 }), 6)
})

test('clip collapses whitespace and truncates with an ellipsis', () => {
  assert.equal(X.clip('a   b\n c', 20), 'a b c')
  assert.equal(X.clip('abcdefghij', 5), 'abcd…')
})

test('describeTool prefers file name, then command', () => {
  assert.equal(X.describeTool({ name: 'Read', input: { file_path: 'C:\\x\\Measures.tmdl' } }), 'Read · Measures.tmdl')
  assert.equal(X.describeTool({ name: 'Bash', input: { command: 'ls' } }), 'Bash · ls')
  assert.equal(X.describeTool({ name: 'Task' }), 'Task')
})

test('reduceAgent counts a streamed message once even when usage is repeated', () => {
  const first = assistant('m1', { input_tokens: 10, output_tokens: 5 })
  const again = assistant('m1', { input_tokens: 10, output_tokens: 20 })
  const acc = [first, again].reduce(X.reduceAgent, X.initAgent())
  assert.equal(acc.tokens.input, 10)
  assert.equal(acc.tokens.output, 20)
})

test('reduceAgent marks the agent ended on end_turn and counts tool calls', () => {
  const entry = assistant('m2', { input_tokens: 1 }, {
    stop_reason: 'end_turn',
    content: [{ type: 'tool_use', name: 'Grep', input: { pattern: 'x' } }],
  })
  const acc = X.reduceAgent(X.initAgent(), entry)
  assert.equal(acc.ended, true)
  assert.equal(acc.tools, 1)
  assert.equal(acc.lastTool, 'Grep · x')
})

test('agentStatus distinguishes done, running and stale', () => {
  const now = Date.now()
  assert.equal(X.agentStatus({ ended: true }, now), 'done')
  assert.equal(X.agentStatus({ ended: false, last: now - 1000 }, now), 'running')
  assert.equal(X.agentStatus({ ended: false, last: now - 10 * 60000 }, now), 'stale')
})

test('promptText strips injected blocks and isRealPrompt rejects non-prompts', () => {
  const entry = { type: 'user', uuid: 'u1', message: { content: '<system-reminder>ignore</system-reminder>Fix the model' } }
  assert.equal(X.promptText(entry), 'Fix the model')
  assert.equal(X.isRealPrompt(entry, 'Fix the model'), true)
  assert.equal(X.isRealPrompt({ isMeta: true }, 'hi'), false)
  assert.equal(X.isRealPrompt({}, '<command-name>x</command-name>'), false)
})

test('reduceSession attributes assistant usage to the latest prompt', () => {
  const prompt = { type: 'user', uuid: 'u1', timestamp: '2026-01-01T10:00:00Z', message: { content: 'Add a KPI' } }
  const acc = [prompt, assistant('m1', { input_tokens: 4, output_tokens: 6 })].reduce(X.reduceSession, X.initSession())
  assert.equal(acc.tasks.length, 1)
  assert.equal(acc.tasks[0].title, 'Add a KPI')
  assert.equal(X.burned(acc.tasks[0].tokens), 10)
})

test('readAppended returns only new complete lines and resets on truncation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-test-'))
  const file = path.join(dir, 't.jsonl')
  try {
    fs.writeFileSync(file, '{"a":1}\n{"b":')
    const state = { offset: 0, partial: '', init: () => ({}), acc: {} }
    assert.deepEqual(X.readAppended(file, state), [{ a: 1 }])
    fs.appendFileSync(file, '2}\nnot json\n')
    assert.deepEqual(X.readAppended(file, state), [{ b: 2 }])
    fs.writeFileSync(file, '{"c":3}\n')
    assert.deepEqual(X.readAppended(file, state), [{ c: 3 }])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
