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
