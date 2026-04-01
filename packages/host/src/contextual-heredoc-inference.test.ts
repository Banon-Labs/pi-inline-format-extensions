import assert from "node:assert/strict";
import test from "node:test";

import { STANDARD_TYPESCRIPT_SAMPLE_COMMAND } from "./demo-samples.js";
import { createHostBashRuntime, detectInlineFormatMatches } from "./index.js";

const markerTheme = {
  fg: (color: string, text: string) => `<fg:${color}>${text}</fg>`,
  bold: (text: string) => `<bold>${text}</bold>`,
  italic: (text: string) => `<italic>${text}</italic>`,
  underline: (text: string) => `<underline>${text}</underline>`,
};

const GENERIC_TYPESCRIPT_SAMPLE_COMMAND =
  STANDARD_TYPESCRIPT_SAMPLE_COMMAND.replace("<<'TS'", "<<'EOF'").replace(
    /\nTS$/u,
    "\nEOF",
  );
const NODE_IMPORT_TSX_SAMPLE_COMMAND = [
  "node --import tsx <<'EOF'",
  "type Answer = {",
  "  value: number;",
  "};",
  "",
  "const answer: Answer = { value: 42 };",
  "console.log(answer.value);",
  "EOF",
].join("\n");
const NODE_IMPORT_TSX_PARITY_COMMAND =
  STANDARD_TYPESCRIPT_SAMPLE_COMMAND.replace(
    "npx tsx <<'TS'",
    "node --import tsx <<'EOF'",
  ).replace(/\nTS$/u, "\nEOF");
const CONTROL_FLOW_TYPESCRIPT_GENERIC_HEREDOC_COMMAND = [
  "echo ready && node --import tsx <<'EOF'",
  "const wrapped: number = 42;",
  "console.log(wrapped);",
  "EOF",
].join("\n");
const CONTROL_FLOW_TYPESCRIPT_PARITY_COMMAND =
  NODE_IMPORT_TSX_PARITY_COMMAND.replace(
    "node --import tsx <<'EOF'",
    "echo ready && node --import tsx <<'EOF'",
  );
const NODE_IMPORT_TSX_ESM_SAMPLE_COMMAND = [
  "node --import tsx/esm <<'EOF'",
  "const message: string = 'hello from tsx';",
  "console.log(message);",
  "EOF",
].join("\n");
const NPX_YES_TSX_SAMPLE_COMMAND = [
  "npx --yes tsx <<'EOF'",
  "const message: string = 'hello from npx';",
  "console.log(message);",
  "EOF",
].join("\n");
const PNPM_DLX_TSX_SAMPLE_COMMAND = [
  "pnpm dlx tsx <<'EOF'",
  "const message: string = 'hello from pnpm';",
  "console.log(message);",
  "EOF",
].join("\n");
const PYTHON3_GENERIC_HEREDOC_COMMAND = [
  "python3 <<'EOF'",
  "print('hello from python3')",
  "EOF",
].join("\n");
const PYTHON_DASH_GENERIC_HEREDOC_COMMAND = [
  "python - <<'EOF'",
  "print('hello from python dash')",
  "EOF",
].join("\n");
const CONTROL_FLOW_PYTHON_GENERIC_HEREDOC_COMMAND = [
  "false || python3 <<'EOF'",
  "print('hello from wrapped python3')",
  "EOF",
].join("\n");
const NODE_MODULE_GENERIC_HEREDOC_COMMAND = [
  "node --input-type=module <<'EOF'",
  "console.log('hello from node module')",
  "EOF",
].join("\n");
const CONTROL_FLOW_BASH_GENERIC_HEREDOC_COMMAND = [
  "if true; then bash <<'EOF'",
  "echo 'wrapped bash'",
  "EOF",
].join("\n");
const UNKNOWN_GENERIC_HEREDOC_COMMAND = [
  "cat <<'EOF'",
  "opaque ${still_plain}",
  "EOF",
].join("\n");
const CONTROL_FLOW_UNKNOWN_GENERIC_HEREDOC_COMMAND = [
  "false || cat <<'EOF'",
  "opaque ${still_plain}",
  "EOF",
].join("\n");
const RAW_MULTILINE_BASH_COMMAND = [
  "set -euo pipefail",
  'printf "%s\\n" "$HOME"',
  "if [[ -d src ]]; then",
  '  echo "src exists"',
  "fi",
].join("\n");
const ANSI_PATTERN = /\u001b\[[0-9;]*m/gu;
const HAS_ANSI_PATTERN = /\u001b\[[0-9;]*m/u;
const MARKER_TAG_PATTERN = /<\/?(?:fg(?::[^>]+)?|bold|italic|underline)>/gu;

function stripMarkerTags(line: string): string {
  return line.replaceAll(MARKER_TAG_PATTERN, "");
}

function stripDecorations(line: string): string {
  return stripMarkerTags(line).replaceAll(ANSI_PATTERN, "");
}

function hasAnsi(line: string): boolean {
  return HAS_ANSI_PATTERN.test(line);
}

function findLanguageMatch(command: string, language: string) {
  return detectInlineFormatMatches(command).find(
    (candidate) => candidate.language === language,
  );
}

function renderBodyLines(command: string): string[] {
  const { toolDefinition } = createHostBashRuntime();
  assert.ok(toolDefinition.renderCall);

  const rendered = toolDefinition.renderCall(
    {
      command,
    },
    markerTheme as never,
    {
      executionStarted: false,
      state: {},
    } as never,
  ) as { render(width: number): string[] };
  const match = findLanguageMatch(command, "typescript");

  assert.ok(match, "expected a TypeScript heredoc match");
  return rendered
    .render(400)
    .map((line) => line.trimEnd())
    .slice(match.startLineIndex, match.endLineIndex + 1);
}

test("detects a generic EOF TypeScript heredoc with the same region as the explicit TS marker", () => {
  const explicitMatch = findLanguageMatch(
    STANDARD_TYPESCRIPT_SAMPLE_COMMAND,
    "typescript",
  );
  const genericMatch = findLanguageMatch(
    GENERIC_TYPESCRIPT_SAMPLE_COMMAND,
    "typescript",
  );

  assert.ok(explicitMatch, "expected the explicit TS sample to match");
  assert.ok(genericMatch, "expected the generic EOF sample to match");
  assert.deepStrictEqual(genericMatch, explicitMatch);
});

test("renders the generic EOF TypeScript heredoc with the same smarter highlight output as the explicit TS sample", () => {
  assert.deepStrictEqual(
    renderBodyLines(GENERIC_TYPESCRIPT_SAMPLE_COMMAND),
    renderBodyLines(STANDARD_TYPESCRIPT_SAMPLE_COMMAND),
  );
});

test("detects GitHub-style generic Python EOF cues", () => {
  assert.deepStrictEqual(
    findLanguageMatch(PYTHON3_GENERIC_HEREDOC_COMMAND, "python"),
    {
      pluginName: "python",
      language: "python",
      startLineIndex: 1,
      endLineIndex: 1,
    },
  );
  assert.deepStrictEqual(
    findLanguageMatch(PYTHON_DASH_GENERIC_HEREDOC_COMMAND, "python"),
    {
      pluginName: "python",
      language: "python",
      startLineIndex: 1,
      endLineIndex: 1,
    },
  );
});

test("detects control-flow wrapped Python generic EOF cues", () => {
  assert.deepStrictEqual(
    findLanguageMatch(CONTROL_FLOW_PYTHON_GENERIC_HEREDOC_COMMAND, "python"),
    {
      pluginName: "python",
      language: "python",
      startLineIndex: 1,
      endLineIndex: 1,
    },
  );
});

test("detects Node stdin module heredocs as JavaScript", () => {
  assert.deepStrictEqual(
    findLanguageMatch(NODE_MODULE_GENERIC_HEREDOC_COMMAND, "javascript"),
    {
      pluginName: "javascript",
      language: "javascript",
      startLineIndex: 1,
      endLineIndex: 1,
    },
  );
});

test("detects node --import tsx generic heredocs as TypeScript instead of JavaScript", () => {
  assert.deepStrictEqual(
    findLanguageMatch(NODE_IMPORT_TSX_SAMPLE_COMMAND, "typescript"),
    {
      pluginName: "typescript",
      language: "typescript",
      startLineIndex: 1,
      endLineIndex: 6,
    },
  );
  assert.deepStrictEqual(
    findLanguageMatch(NODE_IMPORT_TSX_SAMPLE_COMMAND, "javascript"),
    undefined,
  );
});

test("detects control-flow wrapped node --import tsx heredocs as TypeScript", () => {
  assert.deepStrictEqual(
    findLanguageMatch(
      CONTROL_FLOW_TYPESCRIPT_GENERIC_HEREDOC_COMMAND,
      "typescript",
    ),
    {
      pluginName: "typescript",
      language: "typescript",
      startLineIndex: 1,
      endLineIndex: 2,
    },
  );
  assert.deepStrictEqual(
    findLanguageMatch(
      CONTROL_FLOW_TYPESCRIPT_GENERIC_HEREDOC_COMMAND,
      "javascript",
    ),
    undefined,
  );
});

test("detects node --import tsx/esm generic heredocs as TypeScript instead of JavaScript", () => {
  assert.deepStrictEqual(
    findLanguageMatch(NODE_IMPORT_TSX_ESM_SAMPLE_COMMAND, "typescript"),
    {
      pluginName: "typescript",
      language: "typescript",
      startLineIndex: 1,
      endLineIndex: 2,
    },
  );
  assert.deepStrictEqual(
    findLanguageMatch(NODE_IMPORT_TSX_ESM_SAMPLE_COMMAND, "javascript"),
    undefined,
  );
});

test("detects additional tsx launcher variants with generic EOF heredocs", () => {
  assert.deepStrictEqual(
    findLanguageMatch(NPX_YES_TSX_SAMPLE_COMMAND, "typescript"),
    {
      pluginName: "typescript",
      language: "typescript",
      startLineIndex: 1,
      endLineIndex: 2,
    },
  );
  assert.deepStrictEqual(
    findLanguageMatch(PNPM_DLX_TSX_SAMPLE_COMMAND, "typescript"),
    {
      pluginName: "typescript",
      language: "typescript",
      startLineIndex: 1,
      endLineIndex: 2,
    },
  );
});

test("detects control-flow wrapped bash generic EOF cues", () => {
  assert.deepStrictEqual(
    findLanguageMatch(CONTROL_FLOW_BASH_GENERIC_HEREDOC_COMMAND, "bash"),
    {
      pluginName: "bash",
      language: "bash",
      startLineIndex: 1,
      endLineIndex: 1,
    },
  );
});

test("renders node --import tsx generic heredocs with TypeScript smarter highlighting", () => {
  assert.deepStrictEqual(
    renderBodyLines(NODE_IMPORT_TSX_PARITY_COMMAND),
    renderBodyLines(STANDARD_TYPESCRIPT_SAMPLE_COMMAND),
  );
});

test("renders control-flow wrapped node --import tsx generic heredocs with TypeScript smarter highlighting", () => {
  assert.deepStrictEqual(
    renderBodyLines(CONTROL_FLOW_TYPESCRIPT_PARITY_COMMAND),
    renderBodyLines(STANDARD_TYPESCRIPT_SAMPLE_COMMAND),
  );
});

test("renders raw multiline Bash toolcalls as Bash even without a heredoc opener", () => {
  const { toolDefinition } = createHostBashRuntime();
  assert.ok(toolDefinition.renderCall);

  const rendered = toolDefinition.renderCall(
    {
      command: RAW_MULTILINE_BASH_COMMAND,
    },
    markerTheme as never,
    {
      executionStarted: false,
      state: {},
    } as never,
  ) as { render(width: number): string[] };
  const renderedLines = rendered.render(400).map((line) => line.trimEnd());

  assert.deepStrictEqual(
    detectInlineFormatMatches(RAW_MULTILINE_BASH_COMMAND),
    [],
  );
  assert.ok(
    renderedLines.some((line) => hasAnsi(line)),
    "expected bash syntax highlighting for a raw multiline bash toolcall",
  );
  assert.ok(
    renderedLines.every((line) => !line.includes("<fg:toolTitle>")),
    "expected bash syntax highlighting instead of the plain tool-title fallback",
  );
  assert.deepStrictEqual(renderedLines.map(stripDecorations), [
    "$ set -euo pipefail",
    'printf "%s\\n" "$HOME"',
    "if [[ -d src ]]; then",
    '  echo "src exists"',
    "fi",
  ]);
});

test("renders Bash by default when a generic heredoc has no language context", () => {
  const { toolDefinition } = createHostBashRuntime();
  assert.ok(toolDefinition.renderCall);
  assert.deepStrictEqual(
    detectInlineFormatMatches(UNKNOWN_GENERIC_HEREDOC_COMMAND),
    [],
  );
  assert.deepStrictEqual(
    detectInlineFormatMatches(CONTROL_FLOW_UNKNOWN_GENERIC_HEREDOC_COMMAND),
    [],
  );

  const rendered = toolDefinition.renderCall(
    {
      command: CONTROL_FLOW_UNKNOWN_GENERIC_HEREDOC_COMMAND,
    },
    markerTheme as never,
    {
      executionStarted: false,
      state: {},
    } as never,
  ) as { render(width: number): string[] };
  const renderedLines = rendered.render(400).map((line) => line.trimEnd());

  assert.ok(
    renderedLines.some((line) => hasAnsi(line)),
    "expected bash syntax highlighting for the generic heredoc wrapper",
  );
  assert.ok(
    renderedLines.every((line) => !line.includes("<fg:toolTitle>")),
    "expected bash syntax highlighting instead of the plain tool-title fallback",
  );
  assert.deepStrictEqual(renderedLines.map(stripDecorations), [
    "$ false || cat <<'EOF'",
    "opaque ${still_plain}",
    "EOF",
  ]);
});
