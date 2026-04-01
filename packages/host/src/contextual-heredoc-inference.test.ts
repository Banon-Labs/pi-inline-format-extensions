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
const UNKNOWN_GENERIC_HEREDOC_COMMAND = [
  "cat <<'EOF'",
  "opaque ${still_plain}",
  "EOF",
].join("\n");
const MARKER_TAG_PATTERN = /<\/?(?:fg(?::[^>]+)?|bold|italic|underline)>/gu;

function stripMarkerTags(line: string): string {
  return line.replaceAll(MARKER_TAG_PATTERN, "");
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
  const match = detectInlineFormatMatches(command).find(
    (candidate) => candidate.language === "typescript",
  );

  assert.ok(match, "expected a TypeScript heredoc match");
  return rendered
    .render(400)
    .map((line) => line.trimEnd())
    .slice(match.startLineIndex, match.endLineIndex + 1);
}

test("detects a generic EOF TypeScript heredoc with the same region as the explicit TS marker", () => {
  const explicitMatch = detectInlineFormatMatches(
    STANDARD_TYPESCRIPT_SAMPLE_COMMAND,
  ).find((candidate) => candidate.language === "typescript");
  const genericMatch = detectInlineFormatMatches(
    GENERIC_TYPESCRIPT_SAMPLE_COMMAND,
  ).find((candidate) => candidate.language === "typescript");

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
