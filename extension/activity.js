const fs = require('fs')
const os = require('os')
const path = require('path')

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects')
const RECENT_MS = 6 * 3600 * 1000
const RUNNING_MS = 90 * 1000
const MAX_SESSIONS = 6
const MAX_AGENTS = 30
const MAX_TASKS_PER_SESSION = 12
const TITLE_CHARS = 72
const TARGET_CHARS = 48
const NON_PROMPT_PREFIXES = ['<task-notification', '<command', '<system-reminder', '<local-command', '<user-prompt']

const tails = new Map()

const emptyTokens = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })

const addUsage = (tokens, usage, sign) => ({
  input: tokens.input + sign * (usage.input_tokens || 0),
  output: tokens.output + sign * (usage.output_tokens || 0),
  cacheRead: tokens.cacheRead + sign * (usage.cache_read_input_tokens || 0),
  cacheWrite: tokens.cacheWrite + sign * (usage.cache_creation_input_tokens || 0),
})

const burned = t => t.input + t.output + t.cacheWrite

const clip = (text, max) => {
  const one = String(text).replace(/\s+/g, ' ').trim()
  return one.length > max ? one.slice(0, max - 1) + '…' : one
}

const baseName = p => String(p).split(/[\\/]/).pop()

function describeTool(block) {
  const input = block.input || {}
  const target =
    (input.file_path && baseName(input.file_path)) ||
    input.command ||
    input.pattern ||
    input.description ||
    input.query ||
    input.url ||
    ''
  return target ? block.name + ' · ' + clip(target, TARGET_CHARS) : block.name
}

function readAppended(file, state) {
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    return []
  }
  if (stat.size < state.offset) Object.assign(state, { offset: 0, partial: '', acc: state.init() })
  if (stat.size === state.offset) return []
  const length = stat.size - state.offset
  const buffer = Buffer.alloc(length)
  const fd = fs.openSync(file, 'r')
  try {
    fs.readSync(fd, buffer, 0, length, state.offset)
  } finally {
    fs.closeSync(fd)
  }
  state.offset = stat.size
  const text = state.partial + buffer.toString('utf8')
  const lines = text.split('\n')
  state.partial = lines.pop()
  return lines.filter(Boolean).flatMap(line => {
    try {
      return [JSON.parse(line)]
    } catch {
      return []
    }
  })
}

function tailOf(file, init, reduce) {
  let state = tails.get(file)
  if (!state) {
    state = { offset: 0, partial: '', init, acc: init() }
    tails.set(file, state)
  }
  state.acc = readAppended(file, state).reduce(reduce, state.acc)
  return state.acc
}

function withMessageUsage(acc, entry) {
  const message = entry.message
  if (!message || !message.usage) return acc
  const previous = acc.seen[message.id || entry.uuid]
  const base = previous ? addUsage(acc.tokens, previous, -1) : acc.tokens
  return { ...acc, tokens: addUsage(base, message.usage, 1), seen: { ...acc.seen, [message.id || entry.uuid]: message.usage } }
}

const toolBlocks = entry =>
  entry.message && Array.isArray(entry.message.content) ? entry.message.content.filter(b => b.type === 'tool_use') : []

const initAgent = () => ({ start: null, last: null, tokens: emptyTokens(), seen: {}, tools: 0, lastTool: '', model: '', ended: false })

function reduceAgent(acc, entry) {
  const stamp = entry.timestamp ? Date.parse(entry.timestamp) : null
  let next = { ...acc, start: acc.start || stamp, last: stamp || acc.last }
  if (entry.type !== 'assistant') return next
  next = withMessageUsage(next, entry)
  const blocks = toolBlocks(entry)
  return {
    ...next,
    model: (entry.message && entry.message.model) || next.model,
    ended: !!entry.message && entry.message.stop_reason === 'end_turn',
    tools: next.tools + blocks.length,
    lastTool: blocks.length ? describeTool(blocks[blocks.length - 1]) : next.lastTool,
  }
}

const INJECTED_BLOCK = /<(browser_instruction|system-reminder|local-command-caveat|local-command-stdout)\b[^>]*>[\s\S]*?<\/\1>/g

function promptText(entry) {
  const content = entry.message && entry.message.content
  if (typeof content === 'string') return content.replace(INJECTED_BLOCK, '')
  if (!Array.isArray(content) || content.some(b => b.type === 'tool_result')) return null
  const text = content.filter(b => b.type === 'text').map(b => b.text).join('\n')
  return text.replace(INJECTED_BLOCK, '')
}

function isRealPrompt(entry, text) {
  return (
    !entry.isMeta &&
    !entry.isSidechain &&
    typeof text === 'string' &&
    text.trim() &&
    !NON_PROMPT_PREFIXES.some(prefix => text.trimStart().startsWith(prefix))
  )
}

const initSession = () => ({ title: '', tasks: [], seen: {}, tokens: emptyTokens() })

function reduceSession(acc, entry) {
  if (entry.type === 'ai-title' && entry.aiTitle) return { ...acc, title: entry.aiTitle }
  if (entry.type === 'user') {
    const text = promptText(entry)
    if (!isRealPrompt(entry, text)) return acc
    const task = { id: entry.uuid, t: Date.parse(entry.timestamp), title: clip(text, TITLE_CHARS), tokens: emptyTokens(), tools: 0 }
    return { ...acc, tasks: [...acc.tasks, task] }
  }
  if (entry.type !== 'assistant' || !acc.tasks.length) return acc
  const withUsage = withMessageUsage({ ...acc, tokens: acc.tasks[acc.tasks.length - 1].tokens }, entry)
  const current = acc.tasks[acc.tasks.length - 1]
  const updated = { ...current, tokens: withUsage.tokens, tools: current.tools + toolBlocks(entry).length }
  return { ...acc, seen: { ...acc.seen, ...withUsage.seen }, tasks: [...acc.tasks.slice(0, -1), updated] }
}

function readMeta(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

function agentStatus(acc, now) {
  if (acc.ended) return 'done'
  return acc.last && now - acc.last < RUNNING_MS ? 'running' : 'stale'
}

function collectAgents(sessionId, dir, title, now) {
  const subDir = path.join(dir, sessionId, 'subagents')
  let files
  try {
    files = fs.readdirSync(subDir).filter(f => f.endsWith('.jsonl'))
  } catch {
    return []
  }
  return files.map(file => {
    const id = file.replace(/^agent-/, '').replace(/\.jsonl$/, '')
    const acc = tailOf(path.join(subDir, file), initAgent, reduceAgent)
    const meta = readMeta(path.join(subDir, file.replace(/\.jsonl$/, '.meta.json')))
    return {
      id, sessionId, sessionTitle: title,
      description: meta.description || 'Subagent',
      type: meta.agentType || 'agent',
      depth: meta.spawnDepth || 1,
      model: acc.model, status: agentStatus(acc, now),
      start: acc.start, last: acc.last, tokens: acc.tokens, tools: acc.tools, lastTool: acc.lastTool,
    }
  })
}

function recentSessions(now) {
  let projects
  try {
    projects = fs.readdirSync(PROJECTS_DIR)
  } catch {
    return []
  }
  return projects.flatMap(project => {
    const dir = path.join(PROJECTS_DIR, project)
    let names
    try {
      names = fs.readdirSync(dir).filter(n => n.endsWith('.jsonl'))
    } catch {
      return []
    }
    return names.flatMap(name => {
      const sessionId = name.replace(/\.jsonl$/, '')
      try {
        const mtime = fs.statSync(path.join(dir, name)).mtimeMs
        let subMtime = 0
        try {
          subMtime = fs.statSync(path.join(dir, sessionId, 'subagents')).mtimeMs
        } catch {
          // session never spawned subagents
        }
        const latest = Math.max(mtime, subMtime)
        return now - latest < RECENT_MS ? [{ sessionId, dir, file: path.join(dir, name), latest }] : []
      } catch {
        return []
      }
    })
  })
}

function scanActivity() {
  const now = Date.now()
  const found = recentSessions(now).sort((a, b) => b.latest - a.latest).slice(0, MAX_SESSIONS)
  const sessions = []
  const agents = []
  found.forEach((s, index) => {
    const acc = tailOf(s.file, initSession, reduceSession)
    const title = acc.title || 'Untitled session'
    const tasks = acc.tasks.slice(-MAX_TASKS_PER_SESSION).map(t => ({ ...t, burned: burned(t.tokens) }))
    sessions.push({ id: s.sessionId, title, active: index === 0, latest: s.latest, tasks })
    agents.push(...collectAgents(s.sessionId, s.dir, title, now))
  })
  agents.sort((a, b) => (b.last || 0) - (a.last || 0))
  return { scannedAt: now, sessions, agents: agents.slice(0, MAX_AGENTS).map(a => ({ ...a, burned: burned(a.tokens) })) }
}

module.exports = { scanActivity }
