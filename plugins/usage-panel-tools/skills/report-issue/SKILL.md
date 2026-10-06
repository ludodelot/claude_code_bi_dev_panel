---
name: report-issue
description: Report a bug, an error or an improvement idea about the Claude Code usage panel or the usage-band mod to its GitHub project. Use when the panel or band shows wrong numbers, errors, or stops updating, when the user says something is missing or could be better in it, or when they ask how to report feedback. Always ask the user before sending anything.
---

# Report an issue or idea about the usage panel

The panel (VS Code extension) and this `usage-band` mod live in one public GitHub project: `ludodelot/claude_code_bi_dev_panel`. Anyone using them can report problems and ideas there.

## When to use this skill

- The panel or the band shows an error, wrong or frozen numbers, a blank section, or a wrong repo/Power BI project.
- The user describes something missing, awkward or improvable ("it would be great if...", "this section is not useful").
- The user asks where to send feedback.

If you notice a problem with the panel while doing other work, mention **once** that it can be reported with this skill. Do not interrupt the task and do not file anything on your own.

## Privacy rules (non-negotiable)

Issues in this project are **public**.

- Never include prompts, conversation text, code, file contents, file or folder paths, repository names, company or client names, e-mail addresses, tokens or keys.
- Replace the home folder with `~` and the account name with `<user>` in anything you quote.
- Describe the situation in general words ("a Power BI project in a folder outside Git"), not with the user's real names.
- Show the user the complete draft and wait for an explicit yes before sending. They may edit or cancel.

## Steps

1. **Understand the report.** Ask at most two short questions if the problem is unclear: what happened and what they expected (a bug), or what they want and why it matters in their work (an idea).
2. **Check for duplicates.** If `gh` is available and logged in, run
   `gh issue list --repo ludodelot/claude_code_bi_dev_panel --state open --search "<2-3 keywords>"`.
   If a similar issue exists, show it and offer to add the user's details as a comment instead of opening a new one.
3. **Collect diagnostics** (versions and shape only, never values):
   - Claude Code: `claude --version`
   - VS Code panel: `code --list-extensions --show-versions` and keep only the line containing `claude-usage-bar`
   - OS: the platform name and release
   - Mod data: whether `~/.claude/usage-band/state.json` exists, how many seconds old it is, and whether it has a `limits` list. Do not print its contents.
   - Recent panel errors: if the user pasted any, redact them as above.
4. **Draft the issue** with a short title prefixed `Bug:` or `Idea:` and this body:

   For a bug:
   ```
   ### What happened
   ### What you expected
   ### Steps to reproduce
   ### Environment
   - Claude Code: <version>
   - Panel extension: <version or "not installed">
   - usage-band mod: <version from plugin.json if known>
   - OS: <platform>
   - Usage data: <fresh / stale / missing>
   ```
   For an idea:
   ```
   ### The opportunity or idea
   ### Why it matters in your day-to-day work
   ### How you imagine it working
   ### Environment
   ```
5. **Show the draft** to the user and ask: send it, edit it, or cancel.
6. **Send it** after a yes:
   - With `gh` logged in: write the body to a temporary file and run
     `gh issue create --repo ludodelot/claude_code_bi_dev_panel --title "<title>" --body-file <file> --label bug` (use `--label enhancement` for an idea).
   - Without `gh`: give the user the text to paste at https://github.com/ludodelot/claude_code_bi_dev_panel/issues/new, or tell them the VS Code command **Claude Code: Report an issue or idea about this panel** opens a pre-filled draft.
7. Tell the user the issue link, or that nothing was sent if they cancelled.

## Do not

- Do not send anything without the user's confirmation of the final text.
- Do not attach screenshots, logs or state files.
- Do not open issues about unrelated projects.
