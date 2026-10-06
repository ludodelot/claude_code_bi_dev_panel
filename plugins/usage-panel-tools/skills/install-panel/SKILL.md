---
name: install-panel
description: Install or update the Claude Code usage panel (the VS Code extension) from the project's latest GitHub release, and keep the usage-band mod current. Use when the user asks to install, set up, update or upgrade the panel or dashboard, says the panel is missing in VS Code, or asks how to get the latest version.
---

# Install or update the usage panel

The panel is a VS Code extension published as a `.vsix` in the GitHub releases of `ludodelot/claude_code_bi_dev_panel`. It reads data written by this `usage-band` mod, which Claude Code installs from the same project's marketplace.

## Before you start

- Tell the user what you are about to do: download a `.vsix` from that repository's releases, verify its checksum and install it in VS Code.
- Download into a **new, empty temporary folder**. Run nothing from inside it except the checksum check and `code --install-extension`.
- Needs: the `code` command on PATH (VS Code) and either `gh` (logged in or not, public repo) or `curl`.

## Steps

1. **Find the latest release.**
   `gh release view --repo ludodelot/claude_code_bi_dev_panel --json tagName,assets`
   or `curl -s https://api.github.com/repos/ludodelot/claude_code_bi_dev_panel/releases/latest`.
   You need the asset named `claude-usage-bar-<version>.vsix` and the asset `SHA256SUMS`. If either is missing, stop and tell the user: do not install anything unverified.
2. **Check what is installed.** `code --list-extensions --show-versions` and keep the line with `claude-usage-bar`. If it is already the latest version, say so and stop.
3. **Download both assets** into the temporary folder
   (`gh release download <tag> --repo ludodelot/claude_code_bi_dev_panel --pattern "*.vsix" --pattern SHA256SUMS --dir <folder>`).
4. **Verify the checksum.** Compute the SHA-256 of the `.vsix` (`sha256sum` on macOS/Linux/Git Bash, `Get-FileHash -Algorithm SHA256` on PowerShell) and compare it with the line for that file in `SHA256SUMS`. If they differ, delete the download and stop.
5. **Install.** `code --install-extension <full path to the .vsix> --force`
6. **Tell the user** to run **Developer: Reload Window** in VS Code, then click the Claude item at the right of the status bar. The panel shows its version next to the title.
7. **The mod.** To update the Claude Code side, tell the user to run `/plugin marketplace update claude-usage-panel` and then `/reload-plugins`. If it is not installed yet: `/plugin install usage-band --marketplace ludodelot/claude_code_bi_dev_panel`.

## Keep it updated automatically

- The VS Code panel checks GitHub once a day and offers to update itself (setting `claudeUsageBar.checkForUpdates`).
- Marketplaces added from GitHub do not update on their own by default. The user can turn on auto-update in `/plugin` → Marketplaces → `claude-usage-panel`.

## If something fails

Do not retry in a loop. Explain what failed and offer the `report-issue` skill so the problem reaches the project.
