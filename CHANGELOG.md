# Changelog

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
