# terminal-pilot

A personal VS Code extension that does two things:

1. **Cycles all terminals** — `ctrl+]` / `ctrl+[` cycle through every terminal in visual sidebar order, including splits within groups. Respects drag-drop reordering.

2. **Claude Code state indicator** — detects when Claude Code is running in a terminal and prefixes the terminal tab name with a state icon (`◦` ready, `●` working).

## Installation

The extension lives at `~/.vscode/extensions/terminal-pilot-0.0.1` as a symlink to this repo. No build step required.

## Claude state detection

Uses two layers:

- **Shell integration** — detects when `claude` is launched in a terminal via `onDidStartTerminalShellExecution` and prefixes the tab name with `◦`
- **HTTP hooks** — a local server on port 7891 receives Claude Code hook events (`UserPromptSubmit` → `●`, `Stop` → `◦`)

When Claude exits, the original terminal name is restored. On first load, VS Code will prompt you to add the hooks to `~/.claude/settings.json`. Accept to enable working/idle state detection.

## Keybindings

| Key | Action | Source |
|-----|--------|--------|
| `ctrl+]` | Focus next terminal | extension |
| `ctrl+[` | Focus previous terminal | extension |
| `cmd+\` | Split terminal (when terminal focused) | extension |
| `cmd+backspace` | Kill terminal (when terminal focused) | extension |
| `ctrl+\`` | Toggle terminal panel | VS Code default |
| `ctrl+shift+\`` | New terminal | VS Code default |

To avoid conflicts with editor indent/outdent, add to `keybindings.json`:

```json
{ "key": "ctrl+]", "command": "-editor.action.indentLines", "when": "editorTextFocus" },
{ "key": "ctrl+[", "command": "-editor.action.outdentLines", "when": "editorTextFocus" }
```
