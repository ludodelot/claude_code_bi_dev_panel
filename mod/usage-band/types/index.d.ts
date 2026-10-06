export type Totals = { input: number; output: number; cacheRead: number; cacheWrite: number }
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Snapshot = { contextPercent: number | null; limits: Limit[]; usd: number | null }
export type ModelStats = { name: string; tables: number; measures: number; relationships: number }
export type ReportInfo = { name: string; model: string | null; pages: number }
export type Workspace = {
  key: string
  dir: string
  repoRoot: string | null
  branch: string | null
  githubSlug: string | null
  dirty: number | null
  lastCommit: string | null
  ahead: number | null
  behind: number | null
  pbipDir: string | null
  pbip: string[]
  models: string[]
  modelStats: ModelStats[]
  reports: ReportInfo[]
  checkedAt: number
}
export type ChangeEntry = {
  t: number
  file: string
  tool: string
  kind: 'model' | 'report' | 'other'
  area: string
  added: number
  edited: number
  desktopOpen: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      totals: Totals
      snapshot: Snapshot
      isHidden: boolean
      projects: Workspace[]
      changes: ChangeEntry[]
    }
  }
}
