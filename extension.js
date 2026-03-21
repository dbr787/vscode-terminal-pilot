const vscode = require('vscode');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOOK_PORT = 7891;
const HOOK_URL = `http://127.0.0.1:${HOOK_PORT}/`;
const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');

// Map from Terminal -> { state: 'idle' | 'working', sessionId: string | null }
const claudeTerminals = new Map();

let statusBar;
let hookServer;

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('terminalPilot.focusNext', () => cycle(1)),
    vscode.commands.registerCommand('terminalPilot.focusPrevious', () => cycle(-1)),
  );

  statusBar = vscode.window.createStatusBarItem(
    'terminalPilot.claude',
    vscode.StatusBarAlignment.Right,
    100
  );
  context.subscriptions.push(statusBar);

  context.subscriptions.push(
    vscode.window.onDidStartTerminalShellExecution(onExecStart),
    vscode.window.onDidEndTerminalShellExecution(onExecEnd),
    vscode.window.onDidChangeActiveTerminal(() => updateStatusBar()),
    vscode.window.onDidCloseTerminal(t => {
      claudeTerminals.delete(t);
      updateStatusBar();
    }),
  );

  startHookServer(context);
  ensureClaudeHooks();
  updateStatusBar();
}

// ── Terminal cycling ──────────────────────────────────────────────────────────

function cycle(direction) {
  const terminals = [...vscode.window.terminals];
  if (!terminals.length) return;
  const idx = terminals.indexOf(vscode.window.activeTerminal);
  terminals[(idx + direction + terminals.length) % terminals.length].show();
}

// ── Shell integration: detect claude launch/exit ──────────────────────────────

function onExecStart(e) {
  const cmd = e.execution.commandLine.value.trim();
  if (/^claude(\s|$)/.test(cmd)) {
    claudeTerminals.set(e.terminal, { state: 'idle', sessionId: null });
    updateStatusBar();
  }
}

function onExecEnd(e) {
  if (claudeTerminals.has(e.terminal)) {
    claudeTerminals.delete(e.terminal);
    updateStatusBar();
  }
}

// ── HTTP hook server ──────────────────────────────────────────────────────────

function startHookServer(context) {
  hookServer = http.createServer((req, res) => {
    if (req.method !== 'POST') { res.end(); return; }
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      res.writeHead(200); res.end();
      try { handleHook(JSON.parse(body)); } catch {}
    });
  });
  hookServer.on('error', () => {}); // ignore port conflicts silently
  hookServer.listen(HOOK_PORT, '127.0.0.1');
  context.subscriptions.push({ dispose: () => hookServer.close() });
}

function handleHook({ hook_event_name, session_id, cwd }) {
  const state = (hook_event_name === 'UserPromptSubmit' || hook_event_name === 'PreToolUse')
    ? 'working' : 'idle';

  // Match by session_id first, then by cwd
  let matched = false;
  for (const [terminal, info] of claudeTerminals) {
    const termCwd = terminal.shellIntegration?.cwd?.fsPath;
    if (info.sessionId === session_id || (cwd && termCwd === cwd)) {
      if (session_id) info.sessionId = session_id;
      info.state = state;
      matched = true;
      break;
    }
  }

  // Fall back to most recently added Claude terminal
  if (!matched && claudeTerminals.size > 0) {
    const last = [...claudeTerminals.values()].at(-1);
    if (session_id) last.sessionId = session_id;
    last.state = state;
  }

  updateStatusBar();
}

// ── Status bar ────────────────────────────────────────────────────────────────

function updateStatusBar() {
  if (claudeTerminals.size === 0) {
    statusBar.hide();
    return;
  }

  const activeInfo = claudeTerminals.get(vscode.window.activeTerminal);

  if (activeInfo) {
    const working = activeInfo.state === 'working';
    statusBar.text = working ? '$(loading~spin) Claude' : '$(check) Claude';
    statusBar.tooltip = working ? 'Claude is working…' : 'Claude is ready';
  } else {
    const working = [...claudeTerminals.values()].filter(v => v.state === 'working').length;
    statusBar.text = working > 0
      ? `$(loading~spin) Claude (${working}/${claudeTerminals.size})`
      : `$(check) Claude (${claudeTerminals.size})`;
    statusBar.tooltip = `${claudeTerminals.size} Claude session(s), ${working} working`;
  }

  statusBar.show();
}

// ── Claude hooks config ───────────────────────────────────────────────────────

function ensureClaudeHooks() {
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8')); } catch {}

  const curlCmd = `curl -s -X POST ${HOOK_URL} -H 'Content-Type: application/json' -d @-`;
  const hooks = settings.hooks ?? {};

  const hasStop = JSON.stringify(hooks.Stop ?? '').includes(HOOK_URL);
  const hasSubmit = JSON.stringify(hooks.UserPromptSubmit ?? '').includes(HOOK_URL);
  if (hasStop && hasSubmit) return;

  const entry = { matcher: '', hooks: [{ type: 'command', command: curlCmd }] };
  if (!hasStop) hooks.Stop = [...(hooks.Stop ?? []), entry];
  if (!hasSubmit) hooks.UserPromptSubmit = [...(hooks.UserPromptSubmit ?? []), entry];
  settings.hooks = hooks;

  vscode.window.showInformationMessage(
    'Terminal Pilot: Add Claude Code hooks to ~/.claude/settings.json for state indicators?',
    'Add hooks', 'Skip'
  ).then(choice => {
    if (choice !== 'Add hooks') return;
    try {
      fs.mkdirSync(path.dirname(CLAUDE_SETTINGS), { recursive: true });
      fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2));
      vscode.window.showInformationMessage('Terminal Pilot: Claude hooks configured.');
    } catch (e) {
      vscode.window.showErrorMessage(`Terminal Pilot: Failed to write hooks — ${e.message}`);
    }
  });
}

function deactivate() {
  hookServer?.close();
}

module.exports = { activate, deactivate };
