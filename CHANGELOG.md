# Changelog

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
