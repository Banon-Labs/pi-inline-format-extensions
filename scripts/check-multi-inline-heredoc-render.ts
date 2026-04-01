import assert from "node:assert/strict";

import {
  createHostBashRuntime,
  detectInlineFormatMatches,
} from "../packages/host/src/index.ts";

const markerTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  italic: (text: string) => text,
  underline: (text: string) => text,
};

const NESTED_BASH_PYTHON_COMMAND = [
  "bash <<'SH'",
  "python3 <<'PY'",
  'print("nested")',
  "PY",
  "echo done",
  "SH",
].join("\n");
const ANSI_PATTERN = /\u001b\[[0-9;]*m/gu;

const matches = detectInlineFormatMatches(NESTED_BASH_PYTHON_COMMAND).filter(
  (match) => match.language === "bash" || match.language === "python",
);

assert.deepStrictEqual(matches, [
  {
    pluginName: "bash",
    language: "bash",
    startLineIndex: 1,
    endLineIndex: 4,
  },
  {
    pluginName: "python",
    language: "python",
    startLineIndex: 2,
    endLineIndex: 2,
  },
]);

const { toolDefinition } = createHostBashRuntime();
assert.ok(toolDefinition.renderCall);

const rendered = toolDefinition.renderCall(
  {
    command: NESTED_BASH_PYTHON_COMMAND,
  },
  markerTheme as never,
  {
    executionStarted: false,
    state: {},
  } as never,
) as { render(width: number): string[] };

const renderedLines = rendered
  .render(400)
  .map((line) => line.trimEnd().replaceAll(ANSI_PATTERN, ""));

assert.deepStrictEqual(renderedLines, [
  "$ bash <<'SH'",
  "python3 <<'PY'",
  'print("nested")',
  "PY",
  "echo done",
  "SH",
]);

console.log(
  "Nested bash-to-python heredoc render check passed. command=bash-python-nested matches=2",
);
