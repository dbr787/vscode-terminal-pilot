# terminal-pilot

A personal VS Code extension that does two things:

1. **Cycles all terminals** — `cmd+shift+]` / `cmd+shift+[` cycle through every terminal instance in a flat linear order, including splits across all terminal groups.

2. **Claude Code state indicator** — detects when Claude Code is running in a terminal and shows its state in the status bar (`✓ Claude` when ready, `⟳ Claude` when working).

## Installation

The extension lives at `~/.vscode/extensions/terminal-pilot-0.0.1` as a symlink to this repo. No build step required.

## Claude state detection

Uses two layers:

- **Shell integration** — detects when `claude` is launched in a terminal via `onDidStartTerminalShellExecution`
- **HTTP hooks** — a local server on port 7891 receives Claude Code hook events (`UserPromptSubmit` → working, `Stop` → idle)

On first load, VS Code will prompt you to add the hooks to `~/.claude/settings.json`. Accept to enable working/idle state detection.

## Keybindings

Add to `keybindings.json`:

```json
{ "key": "cmd+shift+]", "command": "terminalPilot.focusNext" },
{ "key": "cmd+shift+[", "command": "terminalPilot.focusPrevious" },
{ "key": "cmd+shift+]", "command": "-workbench.action.nextEditorInGroup" },
{ "key": "cmd+shift+[", "command": "-workbench.action.previousEditorInGroup" }
```
