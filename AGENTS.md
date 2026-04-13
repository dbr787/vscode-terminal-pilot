# Agent Guidance

## Development workflow

This is a VS Code extension installed via symlink:

```
~/.vscode/extensions/local.terminal-pilot-0.0.1 -> /path/to/this/repo
```

**No build or package step is needed.** Changes to `extension.js` or `package.json` take effect after reloading the VS Code window. Do NOT run `vsce package` or `code --install-extension` during development.

## Project structure

- `extension.js` — all extension logic (single file, no bundler)
- `package.json` — extension manifest (commands, keybindings, terminal profiles)

## Key conventions

- Plain JS, no TypeScript, no bundler
- Single-file extension (`extension.js`)
- Keep it simple — this is a personal utility extension
