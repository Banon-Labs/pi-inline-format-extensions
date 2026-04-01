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

const MULTI_PYTHON_COMMAND = [
  "python - <<'PY'",
  'print("first block")',
  "PY",
  "python - <<'PY'",
  'print("second block")',
  "PY",
].join("\n");
const ANSI_PATTERN = /\u001b\[[0-9;]*m/gu;

const matches = detectInlineFormatMatches(MULTI_PYTHON_COMMAND).filter(
  (match) => match.language === "python",
);

assert.deepStrictEqual(matches, [
  {
    pluginName: "python",
    language: "python",
    startLineIndex: 1,
    endLineIndex: 1,
  },
  {
    pluginName: "python",
    language: "python",
    startLineIndex: 4,
    endLineIndex: 4,
  },
]);

const { toolDefinition } = createHostBashRuntime();
assert.ok(toolDefinition.renderCall);

const rendered = toolDefinition.renderCall(
  {
    command: MULTI_PYTHON_COMMAND,
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
  "$ python - <<'PY'",
  'print("first block")',
  "PY",
  "python - <<'PY'",
  'print("second block")',
  "PY",
]);

console.log(
  "Multiple inline heredoc render check passed. command=python-double-heredoc matches=2",
);
