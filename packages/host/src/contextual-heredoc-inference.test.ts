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
const NODE_MODULE_GENERIC_HEREDOC_COMMAND = [
  "node --input-type=module <<'EOF'",
  "console.log('hello from node module')",
  "EOF",
].join("\n");
const UNKNOWN_GENERIC_HEREDOC_COMMAND = [
  "cat <<'EOF'",
  "opaque ${still_plain}",
  "EOF",
].join("\n");
const MARKER_TAG_PATTERN = /<\/?(?:fg(?::[^>]+)?|bold|italic|underline)>/gu;

function stripMarkerTags(line: string): string {
  return line.replaceAll(MARKER_TAG_PATTERN, "");
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

test("renders node --import tsx generic heredocs with TypeScript smarter highlighting", () => {
  assert.deepStrictEqual(
    renderBodyLines(NODE_IMPORT_TSX_PARITY_COMMAND),
    renderBodyLines(STANDARD_TYPESCRIPT_SAMPLE_COMMAND),
  );
});

test("keeps the plain fallback when a generic heredoc has no language context", () => {
  const { toolDefinition } = createHostBashRuntime();
  assert.ok(toolDefinition.renderCall);
  assert.deepStrictEqual(
    detectInlineFormatMatches(UNKNOWN_GENERIC_HEREDOC_COMMAND),
    [],
  );

  const rendered = toolDefinition.renderCall(
    {
      command: UNKNOWN_GENERIC_HEREDOC_COMMAND,
    },
    markerTheme as never,
    {
      executionStarted: false,
      state: {},
    } as never,
  ) as { render(width: number): string[] };

  assert.deepStrictEqual(
    rendered.render(400).map((line) => stripMarkerTags(line.trimEnd())),
    ["$ cat <<'EOF'", "opaque ${still_plain}", "EOF"],
  );
});
