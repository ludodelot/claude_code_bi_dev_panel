# Claude Code · Business Intelligence Developer

**by DELOT (v)**

A live dashboard for [Claude Code](https://claude.com/claude-code) inside VS Code. It tells you **when your plan limits will run out**, **what Claude is doing and what it costs**, and **what to do next** (compact, switch model, start fresh), with the Git repo and Power BI project each session is working on.

![Preview](docs/preview-dark.png)

## Install in one minute

In Claude Code, type these three lines:

```
/plugin marketplace add ludodelot/claude_code_bi_dev_panel
/plugin install usage-panel-tools@claude-usage-panel
/plugin install usage-band@claude-usage-panel
```

Then tell Claude: **"install the usage panel"**. It downloads the latest release, checks its checksum and installs the VS Code extension. Reload VS Code and click the Claude item at the right of the status bar.

- `usage-panel-tools` works on any Claude Code version with plugins. It teaches Claude to install/update the panel and to report problems (see below).
- `usage-band` feeds the panel with your limits and usage. It needs a Claude Code version that supports mods (if `/plugin install` succeeds but the band never appears, update Claude Code).

**Prefer to do it by hand?** Download `claude-usage-bar-<version>.vsix` from [Releases](https://github.com/ludodelot/claude_code_bi_dev_panel/releases) and run `code --install-extension <file>`.

## Always on the latest version

| Piece | How it stays current |
|---|---|
| **VS Code panel** | Checks GitHub once a day. When a new release exists it offers **Update now** (checksum verified) or **Release notes**. Run **Claude Code: Check for panel updates** any time. The installed version is shown next to the title and in the footer. |
| **Claude Code plugins** | Marketplaces added from GitHub do **not** auto-update by default. Turn it on in `/plugin` → Marketplaces → `claude-usage-panel`, or run `/plugin marketplace update claude-usage-panel` and then `/reload-plugins`. Or just ask Claude to "update the usage panel". |

Turn the daily check off with `claudeUsageBar.checkForUpdates`.

## Report a problem or an idea

Three ways, all ending as a public GitHub issue that **you review before it is sent**:

1. **Ask Claude.** Say "report this issue" or "I have an idea for the panel". Claude checks for duplicates, collects only versions and the shape of the data (never prompts, code, paths or names), shows you the draft and files it after your yes. It will also mention this option once if it notices the panel misbehaving.
2. **From VS Code.** Use the **Report an issue or idea** link at the bottom of the panel, or the command **Claude Code: Report an issue or idea about this panel**. It opens a pre-filled draft on GitHub; nothing is sent until you press Submit.
3. **On GitHub.** [New issue](https://github.com/ludodelot/claude_code_bi_dev_panel/issues/new/choose): *Something is wrong* or *Idea or area of opportunity*.

Issues are public. Reports redact your home folder, account name, e-mail addresses and tokens, but please also keep client and company names out.

## What you get

| Section | What it shows |
|---|---|
| **Status bar** | `5h 68% · 7d 31% · ctx 47%` plus `$(organization) N` while subagents are running. Turns amber/red near the limits. |
| **Forecast & next steps** | When each limit runs out at your pace, how long before the reset, and suggested actions (/compact, /model, /clear…) with a copy button. The 5-hour limit follows your recent pace; the 7-day limit follows your **average per day**, so nights and idle days do not distort it. |
| **In use now** | The Git repo, branch, GitHub remote and Power BI project (PBIP, models, reports) each recent Claude Code session is working on, detected from its transcript. |
| **KPI tiles** | API-equivalent value and $/hour, tokens processed (stacked bar), cache hit rate, session time. |
| **Agents & tasks** | Subagents running right now (live timer, current tool call), finished and idle ones, plus **Top token burners** ranked across agents and prompts. |
| **Plan limits** | 5-hour, 7-day and context gauges with status badges. |
| **Burn rate** | Usage over each window vs. an even pace, a projection, and "hits 100% in ~X" warnings. Hover for exact values. |
| **Token analytics** | Donut breakdown (new input, cache write, cache read, generated) and automatic insights. |
| **Session trends** | Context and cost over the current session. |
| **Projects & changes** | Repos, branches, uncommitted/ahead/behind counts, Power BI models/reports and a feed of edits. |

A sticky section menu highlights where you are. Light, dark and high-contrast themes follow VS Code, and status colors come from your theme. Animations respect `prefers-reduced-motion`.

## How it works and privacy

1. **`mod/usage-band`**: a Claude Code mod that records limits, context, tokens, cost, repos and edits into `~/.claude/usage-band/state.json`.
2. **`extension/`**: the VS Code extension. It reads that file, scans your local session transcripts under `~/.claude/projects/` for subagents and per-task token usage, and renders the panel.

Your usage data stays on your machine. The panel runs under a strict Content Security Policy with no external requests from the page. The only network request the extension makes is the **daily check of this project's public release list on GitHub** (and the download of a release when you choose Update now, verified against `SHA256SUMS`). No usage data is sent. Disable it with `claudeUsageBar.checkForUpdates`.

## Settings and commands

| Setting | Default | What it does |
|---|---|---|
| `claudeUsageBar.userName` | global `git user.name` | Name shown in the dashboard. |
| `claudeUsageBar.pollIntervalMs` | `2000` | Refresh interval (min 1000). |
| `claudeUsageBar.notifications` | `true` | Warn when a plan limit crosses a threshold. |
| `claudeUsageBar.notifyAt` | `[80, 95]` | Usage percentages that trigger a warning. |
| `claudeUsageBar.checkForUpdates` | `true` | Daily check for a newer panel release. |

Commands: **Open usage dashboard**, **Export usage history (CSV)**, **Check for panel updates**, **Report an issue or idea about this panel**, **Open the panel project on GitHub**.

## Develop and release

```bash
npm test                     # unit tests + coverage (Node 20+, no dependencies)
node tools/preview.js dark   # writes tools/preview-dark.html with mock data
```

Open the generated file in a browser to iterate on the UI without VS Code.

**Release:** bump `version` in `extension/package.json` (and `mod/usage-band/.claude-plugin/plugin.json` if the mod changed), update `CHANGELOG.md`, then push a tag `vX.Y.Z`. The *Release* workflow runs the tests, builds the `.vsix`, writes `SHA256SUMS` and publishes the release that installed panels look for.

```
extension/
  extension.js      status bar item, polling, notifications, commands
  updater.js        daily update check and verified install
  update-check.js  version compare, release parsing, checksum (pure, tested)
  report.js         "report an issue" command
  diagnostics.js    redaction and pre-filled issue links (pure, tested)
  logger.js         recent log lines for reports
  meta.js           where the project lives
  format.js         formatters shared by the host and the webview
  history-csv.js    usage history to CSV
  advisor.js        forecast and suggestion rules (pure, tested)
  forecast-view.js  forecast cards and suggestion list
  activity.js       reads session + subagent transcripts (incremental, cached)
  workspace-detect.js  repo and Power BI project detection
  panel.js          HTML skeleton
  analytics.js      pace, projections, insights
  charts.js         SVG charts with hover tooltips, donut
  agents-view.js    subagents and token-burner ranking
  webview.js        rendering and live updates
mod/usage-band/     the Claude Code mod (data feed)
plugins/usage-panel-tools/  skills: report-issue, install-panel
.claude-plugin/marketplace.json  makes this repository a Claude Code marketplace
test/               node:test suites
```

## Notes and limits

- Token "burned" = new input + cache writes + generated tokens. Cache reads are reported separately because they would dwarf everything else.
- Cost is the **API-equivalent value** of your usage, not what a subscription bills you.
- Subagent status is inferred from transcripts: *running* means activity in the last 90 s.
- Power BI detection expects PBIP projects (`*.pbip`, `*.SemanticModel`, `*.Report`).

## En español

Panel en vivo para Claude Code dentro de VS Code: avisa **cuándo se acaban tus límites** (5 h y 7 d, este último según tu promedio por día), muestra qué hace Claude y cuánto cuesta, y **sugiere acciones** (/compact, /model, /clear). Instalación en Claude Code:

```
/plugin marketplace add ludodelot/claude_code_bi_dev_panel
/plugin install usage-panel-tools@claude-usage-panel
/plugin install usage-band@claude-usage-panel
```

y dile a Claude: «instala el panel». Se actualiza solo (revisa GitHub una vez al día y te pregunta). Para reportar un problema o una idea, dile a Claude «reporta este problema», o usa el enlace al pie del panel: siempre ves el borrador antes de enviarlo y no se incluyen prompts, código ni rutas.

## License

Apache-2.0 © DELOT (v). See [LICENSE](LICENSE) and [NOTICE](NOTICE).

You can use, modify and redistribute this freely, including commercially. Keep the license and the NOTICE file with your copies.
