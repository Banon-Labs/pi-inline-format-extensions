import assert from "node:assert/strict";
import test from "node:test";

import {
  createHostBashRuntime,
  detectInlineFormatMatches,
  SHIPPED_BASH_SMARTER_HIGHLIGHT_SEGMENTS,
  SHIPPED_BASH_SMARTER_HIGHLIGHT_STYLE_BUCKETS,
} from "./index.js";

const SHIPPED_BASH_SAMPLE_COMMAND = `bash <<'SH'
set -euo pipefail
echo "hello from sh"
SH`;

const markerTheme = {
  fg: (color: string, text: string) => `<fg:${color}>${text}</fg>`,
  bold: (text: string) => `<bold>${text}</bold>`,
  italic: (text: string) => `<italic>${text}</italic>`,
  underline: (text: string) => `<underline>${text}</underline>`,
};

const ANSI_PATTERN = /\u001b\[[0-9;]*m/gu;

type StyleBucket =
  (typeof SHIPPED_BASH_SMARTER_HIGHLIGHT_STYLE_BUCKETS)[number][number];
type StyleBucketRow = readonly StyleBucket[];

function stripAnsi(text: string): string {
  return text.replaceAll(ANSI_PATTERN, "");
}

function renderExpectedSegment(segment: string, bucket: StyleBucket): string {
  if (bucket === null) {
    return segment;
  }

  let styled = segment;
  const [color, ...modifiers] = bucket.split("+") as [string, ...string[]];

  if (modifiers.includes("bold")) {
    styled = markerTheme.bold(styled);
  }
  if (modifiers.includes("underline")) {
    styled = markerTheme.underline(styled);
  }
  if (modifiers.includes("italic")) {
    styled = markerTheme.italic(styled);
  }

  return markerTheme.fg(color, styled);
}

function renderExpectedLine(
  segments: readonly string[],
  buckets: StyleBucketRow,
): string {
  return segments
    .map((segment, index) => renderExpectedSegment(segment, buckets[index]!))
    .join("");
}

test("pins the shipped Bash smarter-highlighted tool-row output", () => {
  const { toolDefinition } = createHostBashRuntime();
  assert.ok(toolDefinition.renderCall);

  const rendered = toolDefinition.renderCall(
    {
      command: SHIPPED_BASH_SAMPLE_COMMAND,
    },
    markerTheme as never,
    {
      executionStarted: false,
      state: {},
    } as never,
  ) as { render(width: number): string[] };

  const match = detectInlineFormatMatches(SHIPPED_BASH_SAMPLE_COMMAND).find(
    (candidate) => candidate.language === "bash",
  );
  assert.ok(match, "expected the shipped Bash sample to be detected");

  const actualBodyLines = rendered
    .render(400)
    .map((line) => stripAnsi(line).trimEnd())
    .slice(match.startLineIndex, match.endLineIndex + 1);
  const expectedBodyLines = SHIPPED_BASH_SMARTER_HIGHLIGHT_SEGMENTS.map(
    (segments, index) =>
      renderExpectedLine(
        segments,
        SHIPPED_BASH_SMARTER_HIGHLIGHT_STYLE_BUCKETS[index]!,
      ),
  );

  assert.deepStrictEqual(actualBodyLines, expectedBodyLines);
});
