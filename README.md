# terminal-pilot

A personal VS Code extension for terminal navigation and AI agent terminal management.

## Features

1. **Cycle all terminals** — `ctrl+]` / `ctrl+[` cycle through every terminal in visual sidebar order, including splits within groups. Respects drag-drop reordering.

2. **Agent terminals** — create styled terminals for Claude, Codex, and Amp with custom icons, colors, and names. Terminals are automatically renamed when an agent launches or exits.

## Development

The extension lives at `~/.vscode/extensions/local.terminal-pilot-0.0.1` as a symlink to this repo:

```sh
ln -s /path/to/this/repo ~/.vscode/extensions/local.terminal-pilot-0.0.1
```

No build step required — edit files and reload the VS Code window (`Cmd+Shift+P` → "Developer: Reload Window") to pick up changes.

## Keybindings

| Key | Action |
|-----|--------|
| `ctrl+]` | Focus next terminal |
| `ctrl+[` | Focus previous terminal |
| `cmd+\` | Split terminal (when terminal focused) |
| `cmd+shift+backspace` | Kill terminal (when terminal focused) |
| `cmd+shift+c` | New Claude terminal |
| `cmd+shift+o` | New Codex terminal |
| `cmd+shift+a` | New Amp terminal |

To avoid conflicts with editor indent/outdent, add to `keybindings.json`:

```json
{ "key": "ctrl+]", "command": "-editor.action.indentLines", "when": "editorTextFocus" },
{ "key": "ctrl+[", "command": "-editor.action.outdentLines", "when": "editorTextFocus" }
```
