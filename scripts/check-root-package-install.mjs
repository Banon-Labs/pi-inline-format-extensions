import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const PROMPT =
  "Use bash to run python from a heredoc with python3. Keep the transcript inline and normal.";
const EXPECTED_RESULT_SNIPPET = "hello from py";
const EXPECTED_COMMAND_SNIPPETS = [
  "python3 <<'PY'",
  'print("hello from py")',
  "PY",
];

const repoRoot = process.cwd();
const tempProjectRoot = mkdtempSync(
  path.join(os.tmpdir(), "pi-inline-format-extensions-install-"),
);
const settingsDir = path.join(tempProjectRoot, ".pi");
const settingsPath = path.join(settingsDir, "settings.json");

mkdirSync(settingsDir, { recursive: true });
writeFileSync(
  settingsPath,
  `${JSON.stringify(
    {
      packages: [
        {
          source: repoRoot,
          skills: [],
          prompts: [],
          themes: [],
        },
      ],
    },
    null,
    2,
  )}
`,
  "utf8",
);

try {
  verifyPiList();
  verifyDeterministicCompare();
} finally {
  rmSync(tempProjectRoot, { recursive: true, force: true });
}

console.log(
  [
    "Root package install smoke passed.",
    `source=${repoRoot}`,
    "provider=inline-deterministic",
    `prompt=${PROMPT}`,
  ].join(" "),
);

function verifyPiList() {
  const listResult = runPi(["list"]);
  assert(
    listResult.stdout.includes(`Project packages:\n  ${repoRoot}`),
    [
      `Expected pi list to report the project package source ${repoRoot}.`,
      "--- stdout ---",
      listResult.stdout.trim(),
    ].join("\n"),
  );
}

function verifyDeterministicCompare() {
  const compareResult = runPi([
    "--no-session",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--model",
    "inline-deterministic/canonical-heredoc-compare",
    "--mode",
    "json",
    "-p",
    PROMPT,
  ]);
  const events = parseJsonLines(compareResult.stdout);
  assert(events.length > 0, "Expected JSON events from deterministic compare.");

  const agentEnd = events.find((event) => event.type === "agent_end");
  assert(agentEnd, "Expected an agent_end event from deterministic compare.");

  const messages = Array.isArray(agentEnd.messages) ? agentEnd.messages : [];
  assert.equal(messages[0]?.role, "user");
  assert.equal(messages[0]?.content?.[0]?.text, PROMPT);

  const toolCall = messages.find(
    (message) =>
      message?.role === "assistant" &&
      Array.isArray(message?.content) &&
      message.content[0]?.name === "bash",
  );
  assert(toolCall, "Expected the deterministic compare to call bash.");

  const bashCommand = toolCall.content[0]?.arguments?.command;
  assert.equal(typeof bashCommand, "string", "Expected bash command text.");
  for (const snippet of EXPECTED_COMMAND_SNIPPETS) {
    assert(
      bashCommand.includes(snippet),
      `Expected deterministic bash command to include snippet: ${snippet}`,
    );
  }

  const toolResult = messages.find(
    (message) => message?.role === "toolResult" && message?.toolName === "bash",
  );
  assert(toolResult, "Expected a bash tool result from deterministic compare.");

  const toolResultText = toolResult.content?.[0]?.text;
  assert.equal(
    typeof toolResultText,
    "string",
    "Expected bash tool result text.",
  );
  assert(
    toolResultText.includes(EXPECTED_RESULT_SNIPPET),
    `Expected bash tool result to include ${EXPECTED_RESULT_SNIPPET}.`,
  );
}

function runPi(args) {
  const command = process.platform === "win32" ? "pi.cmd" : "pi";
  const result = spawnSync(command, args, {
    cwd: tempProjectRoot,
    encoding: "utf8",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      [
        `pi ${args.join(" ")} exited with status ${String(result.status)}.`,
        "--- stdout ---",
        result.stdout.trim(),
        "--- stderr ---",
        result.stderr.trim(),
      ].join("\n"),
    );
  }

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function parseJsonLines(stdout) {
  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}
