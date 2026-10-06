import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, Register } from 'claude-code'

import type { ChangeEntry, ModelStats, Snapshot, Totals, Workspace } from '../types'

const EMPTY_TOTALS: Totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
const EMPTY_SNAPSHOT: Snapshot = { contextPercent: null, limits: [], usd: null }
const MAX_WORKSPACES = 3
const MAX_WALK_UP = 8
const GIT_TIMEOUT_MS = 5_000
const MAX_TMDL_FILES = 300
const REFRESH_MS = 60_000
const MAX_CHANGES = 25
const DESKTOP_CACHE_MS = 10_000
const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']
const FILE_PATH_TOOLS = ['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit']
const PANE = 'usage-panel'

const COLOR_OK = '#3fb950'
const COLOR_WARN = '#d29922'
const COLOR_HOT = '#f85149'
const COLOR_TRACK = 'rgba(128,128,128,0.28)'
const WARN_AT = 60
const HOT_AT = 85
const RING_SIZE = 88
const RING_RADIUS = 34
const RING_STROKE = 9
const TERMINAL_BAR_CELLS = 12

const totals = atom({ plugin: 'usage-band', key: 'totals' } as const, EMPTY_TOTALS)
const snapshot = atom({ plugin: 'usage-band', key: 'snapshot' } as const, EMPTY_SNAPSHOT)
const isHidden = atom({ plugin: 'usage-band', key: 'isHidden' } as const, false)
const changes = atom({ plugin: 'usage-band', key: 'changes' } as const, [] as ChangeEntry[])
const workspaces = atom({ plugin: 'usage-band', key: 'projects' } as const, [] as Workspace[])

const LIMIT_LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d' }

const formatTokens = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1_000)}k` : `${n}`

const formatSpan = (ms: number): string => {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  if (hours >= 48) return `${Math.floor(hours / 24)}d${hours % 24}h`
  return hours >= 1 ? `${hours}h${String(minutes % 60).padStart(2, '0')}` : `${minutes}m`
}

const formatReset = (iso: string | undefined, now: number): string =>
  iso ? ` ↻${formatSpan(Date.parse(iso) - now)}` : ''

const colorFor = (percent: number): string =>
  percent >= HOT_AT ? COLOR_HOT : percent >= WARN_AT ? COLOR_WARN : COLOR_OK

const lastSeparator = (p: string): number => Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
const dirOf = (p: string): string => (lastSeparator(p) <= 0 ? p : p.slice(0, lastSeparator(p)))
const baseName = (p: string): string => p.slice(lastSeparator(p) + 1)
const normalize = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
const stripModelSuffix = (name: string): string => name.replace(/\.SemanticModel$/i, '')
const stripReportSuffix = (name: string): string => name.replace(/\.Report$/i, '')
const isIgnoredDir = (dir: string): boolean =>
  /(^|\/)\.claude(\/|$)/.test(normalize(dir)) || /\/appdata\/local\/temp(\/|$)/.test(normalize(dir))

const git = async ($: EngineInterface, dir: string, args: string[]): Promise<string | null> => {
  const run = await $.process.run(['git', ...args], { cwd: dir, timeoutMs: GIT_TIMEOUT_MS }).catch(() => undefined)
  return run && run.exitCode === 0 && run.stdout.trim() ? run.stdout.trim() : null
}

type PbiFound = { dir: string; pbip: string[]; models: string[]; reports: string[] }

const findPbi = async ($: EngineInterface, start: string, stopAt: string | null): Promise<PbiFound | null> => {
  let dir = start
  for (let i = 0; i < MAX_WALK_UP; i++) {
    const entries = await $.fs.list(dir).catch(() => [])
    const named = (kind: 'file' | 'dir', suffix: string) =>
      entries.filter(x => x.kind === kind && x.name.toLowerCase().endsWith(suffix)).map(x => x.name)
    const found = {
      dir,
      pbip: named('file', '.pbip'),
      models: named('dir', '.semanticmodel'),
      reports: named('dir', '.report'),
    }
    if (found.pbip.length || found.models.length || found.reports.length) return found
    const parent = dirOf(dir)
    if (parent === dir || (stopAt !== null && normalize(dir) === normalize(stopAt))) return null
    dir = parent
  }
  return null
}

const linkedModel = async ($: EngineInterface, dir: string, report: string): Promise<string | null> => {
  try {
    const pbir = JSON.parse(await $.fs.read(`${dir}/${report}/definition.pbir`))
    const path: unknown = pbir?.datasetReference?.byPath?.path
    return typeof path === 'string' ? baseName(path) : null
  } catch {
    return null
  }
}

const countModel = async ($: EngineInterface, dir: string, model: string): Promise<ModelStats> => {
  const tablesDir = `${dir}/${model}/definition/tables`
  const entries = await $.fs.list(tablesDir).catch(() => [])
  const files = entries.filter(f => f.kind === 'file' && f.name.endsWith('.tmdl')).slice(0, MAX_TMDL_FILES)
  const perFile = await Promise.all(
    files.map(async f => {
      const text = await $.fs.read(`${tablesDir}/${f.name}`).catch(() => '')
      return (text.match(/^\s*measure\s/gm) ?? []).length
    }),
  )
  const relationshipsText = await $.fs.read(`${dir}/${model}/definition/relationships.tmdl`).catch(() => '')
  const relationships = (relationshipsText.match(/^relationship\s/gm) ?? []).length
  return { name: model, tables: files.length, measures: perFile.reduce((sum, n) => sum + n, 0), relationships }
}

const countPages = async ($: EngineInterface, dir: string, report: string): Promise<number> => {
  const entries = await $.fs.list(`${dir}/${report}/definition/pages`).catch(() => [])
  return entries.filter(e => e.kind === 'dir').length
}

type GitInfo = {
  repoRoot: string | null
  branch: string | null
  githubSlug: string | null
  dirty: number | null
  lastCommit: string | null
  ahead: number | null
  behind: number | null
}

const NO_GIT: GitInfo = { repoRoot: null, branch: null, githubSlug: null, dirty: null, lastCommit: null, ahead: null, behind: null }

const readGit = async ($: EngineInterface, dir: string): Promise<GitInfo> => {
  const repoRoot = await git($, dir, ['rev-parse', '--show-toplevel'])
  if (!repoRoot) return NO_GIT
  const [branch, remote, status, lastCommit, counts] = await Promise.all([
    git($, dir, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git($, dir, ['remote', 'get-url', 'origin']),
    git($, dir, ['status', '--porcelain']),
    git($, dir, ['log', '-1', '--pretty=%s']),
    git($, dir, ['rev-list', '--left-right', '--count', '@{u}...HEAD']),
  ])
  const [behind, ahead] = counts ? counts.split(/\s+/).map(Number) : [null, null]
  const slug = remote ? /github\.com[:/]+([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote)?.[1] : undefined
  const dirty = status ? status.split('\n').length : 0
  return { repoRoot, branch, githubSlug: slug ?? null, dirty, lastCommit, ahead: ahead ?? null, behind: behind ?? null }
}

const describeDir = async ($: EngineInterface, dir: string): Promise<Workspace> => {
  const info = await readGit($, dir)
  const pbi = await findPbi($, dir, info.repoRoot)
  const reports = pbi
    ? await Promise.all(
        pbi.reports.map(async name => ({
          name,
          model: await linkedModel($, pbi.dir, name),
          pages: await countPages($, pbi.dir, name),
        })),
      )
    : []
  const modelStats = pbi ? await Promise.all(pbi.models.map(name => countModel($, pbi.dir, name))) : []
  return {
    key: info.repoRoot ?? dir,
    dir,
    ...info,
    pbipDir: pbi?.dir ?? null,
    pbip: pbi?.pbip ?? [],
    models: pbi?.models ?? [],
    modelStats,
    reports,
    checkedAt: await $.clock.now(),
  }
}

const contains = (root: string, dir: string): boolean =>
  normalize(dir) === normalize(root) || normalize(dir).startsWith(`${normalize(root)}/`)

const trackDir = async ($: EngineInterface, dir: string): Promise<void> => {
  if (isIgnoredDir(dir)) return
  const known = await read($, workspaces)
  const match = known.find(w => contains(w.pbipDir ?? w.repoRoot ?? w.dir, dir))
  if (match && (await $.clock.now()) - match.checkedAt < REFRESH_MS) {
    await update($, workspaces, list => [match, ...list.filter(w => w.key !== match.key)])
    return
  }
  const described = await describeDir($, match ? (match.pbipDir ?? match.dir) : dir)
  await update($, workspaces, list =>
    [described, ...list.filter(w => w.key !== described.key)].slice(0, MAX_WORKSPACES),
  )
}

const repoLabel = (w: Workspace): string => {
  if (!w.repoRoot) return 'no repo'
  const name = w.githubSlug ?? baseName(w.repoRoot)
  return `${name}${w.branch ? `@${w.branch}` : ''}${w.dirty ? ` (${w.dirty} changed)` : ''}`
}

const modelPart = (m: ModelStats): string =>
  `model ${stripModelSuffix(m.name)}${m.tables ? ` (${m.tables} tables, ${m.measures} measures, ${m.relationships} relationships)` : ''}`

const pbiParts = (w: Workspace): string[] =>
  [
    w.pbip.length ? `pbip ${w.pbip.join(', ')}` : null,
    ...w.modelStats.map(modelPart),
    ...w.reports.map(
      r =>
        `report ${stripReportSuffix(r.name)}${r.pages ? ` (${r.pages} pages)` : ''}${r.model ? ` → ${stripModelSuffix(r.model)}` : ''}`,
    ),
  ].filter((p): p is string => p !== null)

const workspaceLine = (w: Workspace): string => {
  const parts = pbiParts(w)
  return `📁 ${repoLabel(w)} · ${w.pbipDir ?? w.dir}${parts.length ? ` · ${parts.join(' · ')}` : ''}`
}

type Gauge = { label: string; percent: number | null; note: string }

const readGauges = async ($: EngineInterface): Promise<Gauge[]> => {
  const [s, now] = await Promise.all([read($, snapshot), $.clock.now()])
  const limit = (kind: string): Gauge => {
    const found = s.limits.find(l => l.kind === kind)
    return {
      label: LIMIT_LABELS[kind] ?? kind,
      percent: found ? Math.round(found.percentUsed) : null,
      note: found?.resetsAt ? `resets in ${formatSpan(Date.parse(found.resetsAt) - now)}` : 'no reading yet',
    }
  }
  return [
    limit('five_hour'),
    limit('seven_day'),
    { label: 'context', percent: s.contextPercent, note: 'model window' },
  ]
}

const buildSummary = async ($: EngineInterface): Promise<string> => {
  const [t, s, usage, now] = await Promise.all([
    read($, totals),
    read($, snapshot),
    $.session.usage(),
    $.clock.now(),
  ])
  const limits = s.limits
    .map(l => `${LIMIT_LABELS[l.kind] ?? l.kind} ${Math.round(l.percentUsed)}%${formatReset(l.resetsAt, now)}`)
    .join(' · ')
  const parts = [
    `⏱ ${formatSpan(now - usage.startedAt)}`,
    `tok ↑${formatTokens(t.input + t.cacheWrite)} ↓${formatTokens(t.output)} cache ${formatTokens(t.cacheRead)}`,
    s.contextPercent === null ? null : `ctx ${s.contextPercent}%`,
    limits || null,
  ].filter((p): p is string => p !== null)
  return parts.join('  |  ')
}

// The VS Code extension draws nothing from mods, so the figures go to a file
// that the companion extension (claude-usage-bar) watches and displays.
const writeState = async ($: EngineInterface): Promise<void> => {
  try {
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    if (!home) return
    const [t, s, usage, list, cwd, recent] = await Promise.all([
      read($, totals),
      read($, snapshot),
      $.session.usage(),
      read($, workspaces),
      $.session.cwd(),
      read($, changes),
    ])
    const state = { updatedAt: await $.clock.now(), startedAt: usage.startedAt, cwd, totals: t, ...s, workspaces: list, changes: recent, desktopOpen }
    await $.fs.write(`${home}/.claude/usage-band/state.json`, JSON.stringify(state))
  } catch {
    // The file is a convenience for the editor; a failed write must not break the session.
  }
}

const ringSvg =(percent: number, color: string): string => {
  const circumference = 2 * Math.PI * RING_RADIUS
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * circumference
  const mid = RING_SIZE / 2
  const circle = (stroke: string, extra: string) =>
    `<circle cx="${mid}" cy="${mid}" r="${RING_RADIUS}" fill="none" stroke="${stroke}" stroke-width="${RING_STROKE}"${extra}/>`
  const arc = ` stroke-linecap="round" stroke-dasharray="${filled.toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 ${mid} ${mid})"`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${RING_SIZE} ${RING_SIZE}" width="${RING_SIZE}" height="${RING_SIZE}">${circle(COLOR_TRACK, '')}${circle(color, arc)}</svg>`
}

const textBar = (percent: number): string => {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * TERMINAL_BAR_CELLS)
  return '█'.repeat(filled) + '░'.repeat(TERMINAL_BAR_CELLS - filled)
}

const drawGauge = (ui: ElementTable, g: Gauge) => {
  const { Box, Text } = ui
  const percent = g.percent ?? 0
  const color = g.percent === null ? COLOR_TRACK : colorFor(percent)
  const dial =
    'Svg' in ui ? (
      <ui.Svg source={ringSvg(percent, color)} alt={`${g.label} ${g.percent ?? 'sin dato'}%`} width={RING_SIZE} height={RING_SIZE} />
    ) : (
      <Text color={color}>{textBar(percent)}</Text>
    )
  return (
    <Box key={g.label} flexDirection="column" alignItems="center" paddingX={2}>
      {dial}
      <Text bold color={g.percent === null ? undefined : color}>
        {g.percent === null ? '—' : `${g.percent}%`}
      </Text>
      <Text bold>{g.label}</Text>
      <Text dimColor>{g.note}</Text>
    </Box>
  )
}

const drawWorkspace = (ui: ElementTable, w: Workspace) => {
  const { Box, Text } = ui
  const parts = pbiParts(w)
  return (
    <Box key={w.key} flexDirection="column" borderStyle="round" borderDimColor paddingX={1} marginBottom={1}>
      <Text bold>📁 {repoLabel(w)}</Text>
      <Text dimColor>{w.pbipDir ?? w.dir}</Text>
      {parts.map(part => (
        <Text>  {part}</Text>
      ))}
    </Box>
  )
}

const drawPane = async ($: EngineInterface, ui: ElementTable) => {
  const { Box, Text, Button } = ui
  const [gauges, t, usage, now, list] = await Promise.all([
    readGauges($),
    read($, totals),
    $.session.usage(),
    $.clock.now(),
    read($, workspaces),
  ])
  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text bold>Claude Code · session ⏱ {formatSpan(now - usage.startedAt)}</Text>
      <Box flexDirection="row" flexWrap="wrap">
        {gauges.map(g => drawGauge(ui, g))}
      </Box>
      <Text>
        Tokens ↑ {formatTokens(t.input + t.cacheWrite)} sent · ↓ {formatTokens(t.output)} generated · {formatTokens(t.cacheRead)} cached
      </Text>
      <Text bold>Power BI projects & GitHub repos</Text>
      {list.length === 0 && <Text dimColor>No files touched yet.</Text>}
      {list.map(w => drawWorkspace(ui, w))}
      <Button key="toggle" label="Show / hide band" onPress={() => update($, isHidden, hidden => !hidden)} />
    </Box>
  )
}

type EditInput = {
  tool?: string
  old_string?: string
  new_string?: string
  content?: string
  edits?: { old_string?: string; new_string?: string }[]
}

const countMeasures = (text: string | undefined): number => (text?.match(/^\s*measure\s/gm) ?? []).length

const classifyPath = (file: string): { kind: ChangeEntry['kind']; area: string } => {
  const p = file.replace(/\\/g, '/')
  const model = /\/([^/]+)\.SemanticModel\/(.+)$/i.exec(p)
  if (model) {
    const rest = model[2] ?? ''
    const table = /^definition\/tables\/(.+)\.tmdl$/i.exec(rest)
    return { kind: 'model', area: `${model[1]} › ${table ? `table ${table[1]}` : rest}` }
  }
  const report = /\/([^/]+)\.Report\/(.+)$/i.exec(p)
  if (report) {
    const rest = report[2] ?? ''
    const page = /pages\/([^/]+)\//i.exec(rest)
    return { kind: 'report', area: `${report[1]} › ${page ? `page ${page[1]}` : rest}` }
  }
  return { kind: 'other', area: baseName(p) }
}

const measureImpact = (input: EditInput): { added: number; edited: number } => {
  if (input.tool === 'Write') return { added: countMeasures(input.content), edited: 0 }
  const edits = input.tool === 'MultiEdit' ? (input.edits ?? []) : [input]
  return edits.reduce(
    (sum, edit) => {
      const before = countMeasures(edit.old_string)
      const after = countMeasures(edit.new_string)
      return before === 0
        ? { added: sum.added + after, edited: sum.edited }
        : { added: sum.added + Math.max(0, after - before), edited: sum.edited + before }
    },
    { added: 0, edited: 0 },
  )
}

let desktopOpen = false
let desktopCheckedAt = 0

const isDesktopOpen = async ($: EngineInterface): Promise<boolean> => {
  const now = await $.clock.now()
  if (now - desktopCheckedAt < DESKTOP_CACHE_MS) return desktopOpen
  const run = await $.process
    .run(['tasklist', '/FI', 'IMAGENAME eq PBIDesktop.exe', '/NH'], { timeoutMs: GIT_TIMEOUT_MS })
    .catch(() => undefined)
  desktopOpen = !!run && /PBIDesktop\.exe/i.test(run.stdout)
  desktopCheckedAt = now
  return desktopOpen
}

const recordChange = async ($: EngineInterface, input: unknown, file: string): Promise<void> => {
  const edit = input as EditInput
  if (!edit.tool || !EDIT_TOOLS.includes(edit.tool) || isIgnoredDir(dirOf(file))) return
  const where = classifyPath(file)
  const entry: ChangeEntry = {
    t: await $.clock.now(),
    file,
    tool: edit.tool,
    ...where,
    ...measureImpact(edit),
    desktopOpen: where.kind === 'other' ? false : await isDesktopOpen($),
  }
  await update($, changes, list => [entry, ...list].slice(0, MAX_CHANGES))
}

const filePathOf = (input: unknown): string | null => {
  const e = input as { tool?: string; file_path?: unknown; notebook_path?: unknown }
  if (!e.tool || !FILE_PATH_TOOLS.includes(e.tool)) return null
  const path = e.file_path ?? e.notebook_path
  return typeof path === 'string' && path ? path : null
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-band',
      description: 'Open the usage panel (tokens, plan limits, GitHub repos and Power BI projects); `hide`/`show` toggles the band',
    })
    await trackDir($, await $.session.cwd()).catch(() => undefined)
    await writeState($)
    return next(e)
  })

  on('command.run', { command: 'usage-band' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'hide' || arg === 'show') {
      await update($, isHidden, () => arg === 'hide')
      return { text: arg === 'hide' ? 'Usage band hidden.' : 'Usage band shown.' }
    }
    const opened = await $.ui.open({ id: PANE, title: 'Claude Code usage' })
    const lines = (await read($, workspaces)).map(workspaceLine)
    const note = opened.isPlaced ? [] : [`(panel unavailable: ${opened.reason})`]
    return { text: [await buildSummary($), ...lines, ...note].join('\n') }
  })

  on('session.measure', async ($, e, next) => {
    const latest: Snapshot = {
      contextPercent: e.context.percent ?? null,
      limits: e.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
      usd: e.cost?.usd ?? null,
    }
    await update($, snapshot, () => latest)
    $.ui.status(await buildSummary($))
    await writeState($)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const path = filePathOf(e)
    if (path) {
      await trackDir($, dirOf(path)).catch(() => undefined)
      await recordChange($, e, path).catch(() => undefined)
    }
    await writeState($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const u = e.usage
    if (u) {
      await update($, totals, t => ({
        input: t.input + u.input_tokens,
        output: t.output + u.output_tokens,
        cacheRead: t.cacheRead + u.cache_read_input_tokens,
        cacheWrite: t.cacheWrite + u.cache_creation_input_tokens,
      }))
    }
    $.ui.status(await buildSummary($))
    await writeState($)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => drawPane($, $.ui.resolve(e)))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const lines = [await buildSummary($), ...(await read($, workspaces)).map(workspaceLine)]

    return (
      <Box flexDirection="column">
        {lines.map(line => (
          <Text dimColor>{line}</Text>
        ))}
      </Box>
    )
  })
}
