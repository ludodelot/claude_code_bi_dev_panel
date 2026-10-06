# Changelog

## 0.6.0

### Added
- **Easy install from Claude Code**: this repository is now a Claude Code marketplace. `/plugin marketplace add ludodelot/claude_code_bi_dev_panel`, then install `usage-panel-tools` and `usage-band`.
- **Skills for Claude**: `install-panel` (download, verify and install or update the VS Code panel) and `report-issue` (draft a redacted, public GitHub issue and send it only after the user approves). Claude is told to mention it once if it sees the panel misbehave.
- **Self-update**: the panel checks the public release list once a day and offers Update now (SHA-256 verified), Release notes or Later. New setting `claudeUsageBar.checkForUpdates`; command **Check for panel updates**.
- **Report from VS Code**: command and panel footer link that open a pre-filled GitHub draft with versions and recent log lines, with home folder, account name, e-mails and tokens redacted.
- The installed **version is always visible** (title, footer, status bar tooltip) and an update button appears next to it.
- Output channel **Claude Code panel** with recent log lines.
- GitHub issue templates and a release workflow that publishes the .vsix with SHA256SUMS on every `v*` tag.

### Changed
- The **7-day forecast uses the average spend per day** of the window instead of the last hours, so nights and idle stretches do not hide or exaggerate the pace. The 5-hour forecast still follows the recent pace.
- Mod `usage-band` 0.2.0 (manifest metadata only).

## 0.5.0

### Added
- **Forecast & next steps** at the top of the panel: for the 5-hour and 7-day limits, the time each one runs out at your current pace, how long before the reset that happens, and a bar showing usage now and where it is heading.
- **Suggested next steps**: rules that read your usage and propose Claude Code actions, with one-click copy for slash commands. Covers /compact (context 70%+ and 85%+), /model when a limit will run out, /clear on long sessions, low cache reuse, exploration agents running on Opus, too many parallel agents and prompts that dominate the session.
- Test that the assembled webview script parses, to catch duplicate declarations between scripts.

## 0.4.1

### Removed
- The animated Workflow map. **In use now** shows the same repo and Power BI facts without assuming a Git-centred workflow.

## 0.4.0

### Added
- **In use now**: detects, per recent Claude Code session, the Git repo (name, branch, GitHub remote) and the Power BI project (PBIP, semantic models, reports) it is working on. It reads the session transcripts, so it works for every window on the account and does not depend on the mod. Sessions with no repo or Power BI project say so instead of showing errors.
- Status bar tooltip shows the detected repo and Power BI project.
- Worktree and submodule aware Git detection (no git process is spawned).

## 0.3.0

### Added
- Sticky section navigation with scroll-spy in the dashboard.
- `Export usage history (CSV)` command.
- Settings: `pollIntervalMs`, `notifications`, `notifyAt`.
- Unit tests (node:test) and a GitHub Actions workflow (tests on Linux/Windows, Node 20/22, plus .vsix build).
- High-contrast theme support, visible keyboard focus, live-region for the status pill.

### Changed
- Status colors now follow the VS Code theme.
- Formatting helpers live in one shared `format.js` instead of two copies.
- Fixed the repository URL in the extension manifest.

### Fixed
- Transcript readers for sessions outside the scan window are released (bounded memory).
