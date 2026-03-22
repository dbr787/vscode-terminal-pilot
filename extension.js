const vscode = require("vscode");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const HOOK_PORT = 7891;
const HOOK_URL = `http://127.0.0.1:${HOOK_PORT}/`;
const CLAUDE_SETTINGS = path.join(os.homedir(), ".claude", "settings.json");

const WORKING = "● "; // filled circle = busy
const READY = "◦ "; // white bullet = ready

// Map from Terminal -> { state: 'idle' | 'working', sessionId: string | null, originalName: string }
const claudeTerminals = new Map();

// Rename queue: keyed by terminal so newer renames overwrite pending ones
const pendingRenames = new Map();
let isRenaming = false;

let hookServer;

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("terminalPilot.focusNext", () => cycle(1)),
    vscode.commands.registerCommand("terminalPilot.focusPrevious", () =>
      cycle(-1),
    ),
  );

  context.subscriptions.push(
    vscode.window.onDidStartTerminalShellExecution(onExecStart),
    vscode.window.onDidEndTerminalShellExecution(onExecEnd),
    vscode.window.onDidCloseTerminal((t) => claudeTerminals.delete(t)),
  );

  startHookServer(context);
  ensureClaudeHooks();
}

// ── Terminal cycling ──────────────────────────────────────────────────────────

async function cycle(direction) {
  // Focus the terminal tab list widget, which is ordered by visual position
  // (respects drag-drop reordering and includes split terminals).
  await vscode.commands.executeCommand("workbench.action.terminal.focusTabs");
  await vscode.commands.executeCommand(
    direction > 0 ? "list.focusDown" : "list.focusUp",
  );
  await vscode.commands.executeCommand("list.select");
}

// ── Shell integration: detect claude launch/exit ──────────────────────────────

function onExecStart(e) {
  const cmd = e.execution.commandLine.value.trim();
  if (/^claude(\s|$)/.test(cmd)) {
    const shellName = stripIndicator(e.terminal.name);
    claudeTerminals.set(e.terminal, {
      state: "idle",
      sessionId: null,
      originalName: shellName,
    });
    scheduleRename(e.terminal, READY + "claude");
  }
}

function onExecEnd(e) {
  const info = claudeTerminals.get(e.terminal);
  if (info) {
    claudeTerminals.delete(e.terminal);
    scheduleRename(e.terminal, info.originalName);
  }
}

// ── HTTP hook server ──────────────────────────────────────────────────────────

function startHookServer(context) {
  hookServer = http.createServer((req, res) => {
    if (req.method !== "POST") {
      res.end();
      return;
    }
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      res.writeHead(200);
      res.end();
      try {
        handleHook(JSON.parse(body));
      } catch {}
    });
  });
  hookServer.on("error", () => {}); // ignore port conflicts silently
  hookServer.listen(HOOK_PORT, "127.0.0.1");
  context.subscriptions.push({ dispose: () => hookServer.close() });
}

function handleHook({ hook_event_name, session_id, cwd }) {
  const state =
    hook_event_name === "UserPromptSubmit" || hook_event_name === "PreToolUse"
      ? "working"
      : "idle";

  let targetTerminal = null;
  let targetInfo = null;

  // Match by session_id first, then by cwd
  for (const [terminal, info] of claudeTerminals) {
    const termCwd = terminal.shellIntegration?.cwd?.fsPath;
    if (info.sessionId === session_id || (cwd && termCwd === cwd)) {
      if (session_id) info.sessionId = session_id;
      info.state = state;
      targetTerminal = terminal;
      targetInfo = info;
      break;
    }
  }

  // Fall back to most recently added Claude terminal
  if (!targetTerminal && claudeTerminals.size > 0) {
    [targetTerminal, targetInfo] = [...claudeTerminals.entries()].at(-1);
    if (session_id) targetInfo.sessionId = session_id;
    targetInfo.state = state;
  }

  if (targetTerminal) {
    const indicator = state === "working" ? WORKING : READY;
    scheduleRename(targetTerminal, indicator + "claude");
  }
}

// ── Terminal renaming ─────────────────────────────────────────────────────────
//
// VS Code has no API to change a terminal tab's icon after creation, but we can
// rename it. We briefly make the target terminal active, issue the rename
// command, then restore the previously active terminal. A queue ensures rapid
// state changes don't pile up: newer renames for the same terminal overwrite
// pending ones.

function stripIndicator(name) {
  if (name.startsWith(WORKING)) return name.slice(WORKING.length);
  if (name.startsWith(READY)) return name.slice(READY.length);
  return name;
}

function scheduleRename(terminal, name) {
  pendingRenames.set(terminal, name);
  drainRenames();
}

async function drainRenames() {
  if (isRenaming || pendingRenames.size === 0) return;
  isRenaming = true;

  const [terminal, name] = pendingRenames.entries().next().value;
  pendingRenames.delete(terminal);

  const prevActive = vscode.window.activeTerminal;
  try {
    terminal.show(true); // make active without stealing editor focus
    await vscode.commands.executeCommand(
      "workbench.action.terminal.renameWithArg",
      { name },
    );
  } catch {}

  if (prevActive && prevActive !== terminal) {
    prevActive.show(true);
  }

  isRenaming = false;
  drainRenames();
}

// ── Claude hooks config ───────────────────────────────────────────────────────

function ensureClaudeHooks() {
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, "utf8"));
  } catch {}

  const curlCmd = `curl -s --max-time 2 -X POST ${HOOK_URL} -H 'Content-Type: application/json' -d @- || true`;
  const hooks = settings.hooks ?? {};

  const hasStop = JSON.stringify(hooks.Stop ?? "").includes(HOOK_URL);
  const hasSubmit = JSON.stringify(hooks.UserPromptSubmit ?? "").includes(
    HOOK_URL,
  );
  if (hasStop && hasSubmit) return;

  const entry = { matcher: "", hooks: [{ type: "command", command: curlCmd }] };
  if (!hasStop) hooks.Stop = [...(hooks.Stop ?? []), entry];
  if (!hasSubmit)
    hooks.UserPromptSubmit = [...(hooks.UserPromptSubmit ?? []), entry];
  settings.hooks = hooks;

  vscode.window
    .showInformationMessage(
      "Terminal Pilot: Add Claude Code hooks to ~/.claude/settings.json for state indicators?",
      "Add hooks",
      "Skip",
    )
    .then((choice) => {
      if (choice !== "Add hooks") return;
      try {
        fs.mkdirSync(path.dirname(CLAUDE_SETTINGS), { recursive: true });
        fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2));
        vscode.window.showInformationMessage(
          "Terminal Pilot: Claude hooks configured.",
        );
      } catch (e) {
        vscode.window.showErrorMessage(
          `Terminal Pilot: Failed to write hooks — ${e.message}`,
        );
      }
    });
}

function deactivate() {
  hookServer?.close();
}

module.exports = { activate, deactivate };
