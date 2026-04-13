const vscode = require("vscode");

const AGENTS = {
  claude: {
    displayName: "claude",
    launchCommand: "claude",
    iconThemeId: "claude",
    color: "terminal.ansiYellow",
  },
  codex: {
    displayName: "codex",
    launchCommand: "codex",
    iconThemeId: "openai",
    color: "terminal.ansiBlue",
  },
  amp: {
    displayName: "amp",
    launchCommand: "amp",
    iconThemeId: "sparkle",
    color: "terminal.ansiGreen",
  },
};

// Map from Terminal -> { agent, originalName }
const agentTerminals = new Map();
const keepFocusOnRename = new Set();

// Rename queue: keyed by terminal so newer renames overwrite pending ones
const pendingRenames = new Map();
let isRenaming = false;

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("terminalPilot.focusNext", () => cycle(1)),
    vscode.commands.registerCommand("terminalPilot.focusPrevious", () =>
      cycle(-1),
    ),
    vscode.commands.registerCommand("terminalPilot.newClaudeTerminal", () =>
      createAgentTerminal("claude"),
    ),
    vscode.commands.registerCommand("terminalPilot.newCodexTerminal", () =>
      createAgentTerminal("codex"),
    ),
    vscode.commands.registerCommand("terminalPilot.newAmpTerminal", () =>
      createAgentTerminal("amp"),
    ),
    vscode.window.registerTerminalProfileProvider(
      "terminalPilot.claude",
      createProfileProvider("claude"),
    ),
    vscode.window.registerTerminalProfileProvider(
      "terminalPilot.codex",
      createProfileProvider("codex"),
    ),
    vscode.window.registerTerminalProfileProvider(
      "terminalPilot.amp",
      createProfileProvider("amp"),
    ),
  );

  context.subscriptions.push(
    vscode.window.onDidStartTerminalShellExecution(onExecStart),
    vscode.window.onDidEndTerminalShellExecution(onExecEnd),
    vscode.window.onDidCloseTerminal((t) => agentTerminals.delete(t)),
  );
}

// ── Terminal cycling ──────────────────────────────────────────────────────────

async function cycle(direction) {
  // Navigate the terminal tab list to cycle in visual order, including split
  // panes. VS Code's built-in focusNext/focusPrevious skip splits, so we must
  // drive the tab list directly.
  await vscode.commands.executeCommand("workbench.action.terminal.focusTabs");
  await vscode.commands.executeCommand(
    direction > 0 ? "list.focusDown" : "list.focusUp",
  );
  await vscode.commands.executeCommand("list.select");
}

// ── Shell integration: detect agent launch/exit ──────────────────────────────

function onExecStart(e) {
  const cmd = e.execution.commandLine.value.trim();
  const agent = detectAgent(cmd);
  if (agent) {
    const existing = agentTerminals.get(e.terminal);
    const originalName =
      existing?.originalName ?? stripAgentPrefix(e.terminal.name);
    agentTerminals.set(e.terminal, { agent, originalName });
    scheduleRename(e.terminal, AGENTS[agent].displayName);
  }
}

function onExecEnd(e) {
  const info = agentTerminals.get(e.terminal);
  if (info) {
    agentTerminals.delete(e.terminal);
    scheduleRename(e.terminal, info.originalName);
  }
}

// ── Terminal renaming ─────────────────────────────────────────────────────────
//
// VS Code has no API to change a terminal tab's icon after creation, but we can
// rename it. We briefly make the target terminal active, issue the rename
// command, then restore the previously active terminal. A queue ensures rapid
// renames don't pile up: newer renames for the same terminal overwrite pending
// ones.

function stripAgentPrefix(name) {
  return name.replace(/^(claude|codex|amp)\s*/i, "").trim();
}

function detectAgent(commandLine) {
  if (/^claude(\s|$)/.test(commandLine)) return "claude";
  if (/^codex(\s|$)/.test(commandLine)) return "codex";
  if (/^amp(\s|$)/.test(commandLine)) return "amp";
  return null;
}

function createProfileProvider(agent) {
  return {
    provideTerminalProfile() {
      return new vscode.TerminalProfile(getAgentTerminalOptions(agent));
    },
  };
}

function getAgentTerminalOptions(agent) {
  const meta = AGENTS[agent];
  return {
    name: meta.displayName,
    iconPath: new vscode.ThemeIcon(meta.iconThemeId),
    color: new vscode.ThemeColor(meta.color),
    titleTemplate: "${sequence}",
  };
}

async function createAgentTerminal(agent) {
  const meta = AGENTS[agent];
  const terminal = vscode.window.createTerminal(getAgentTerminalOptions(agent));
  keepFocusOnRename.add(terminal);
  terminal.show(false);
  agentTerminals.set(terminal, {
    agent,
    originalName: stripAgentPrefix(terminal.name),
  });
  scheduleRename(terminal, meta.displayName);
  await pause(50);
  terminal.sendText(meta.launchCommand, true);
  return terminal;
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
    terminal.show(true);
    await vscode.commands.executeCommand(
      "workbench.action.terminal.renameWithArg",
      { name },
    );
  } catch {}

  if (keepFocusOnRename.has(terminal)) {
    keepFocusOnRename.delete(terminal);
  } else if (prevActive && prevActive !== terminal) {
    prevActive.show(true);
  }

  isRenaming = false;
  drainRenames();
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deactivate() {}

module.exports = { activate, deactivate };
