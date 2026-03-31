import assert from "node:assert/strict";
import test from "node:test";

import {
  createInlineFormatVirtualDocument,
  inspectInlineFormatDocument,
  normalizeInlineFormatSemanticTokens,
} from "@pi-inline-format/intel";

import { createHostBashRuntime, detectInlineFormatMatches } from "./index.js";

const SHIPPED_PYTHON_SAMPLE_COMMAND = `cat > /tmp/delete.me.py <<'PY'
#!/usr/bin/env python3

def main() -> None:
    print("hello")
PY`;

const markerTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  italic: (text: string) => text,
  underline: (text: string) => text,
};

const ANSI_PATTERN = /\u001b\[[0-9;]*m/gu;

function stripAnsi(text: string): string {
  return text.replaceAll(ANSI_PATTERN, "");
}

test("keeps Python semantic-token inspection truthful while the normal tool row still falls back to basic highlighting", async () => {
  const lines = SHIPPED_PYTHON_SAMPLE_COMMAND.split("\n");
  const match = detectInlineFormatMatches(SHIPPED_PYTHON_SAMPLE_COMMAND).find(
    (candidate) => candidate.language === "python",
  );
  assert.ok(match, "expected the shipped Python sample to be detected");

  const document = createInlineFormatVirtualDocument({
    language: "python",
    match,
    command: SHIPPED_PYTHON_SAMPLE_COMMAND,
    source: lines
      .slice(match.startLineIndex, match.endLineIndex + 1)
      .join("\n"),
  });
  const semanticTokensResult = await inspectInlineFormatDocument(
    document,
    "semantic-tokens",
  );

  assert.ok(
    semanticTokensResult?.kind === "semantic-tokens",
    "expected basedpyright semantic-token inspection output for the shipped Python sample",
  );
  assert.deepStrictEqual(
    normalizeInlineFormatSemanticTokens(semanticTokensResult).map((token) => ({
      text: token.text,
      tokenType: token.tokenType,
      modifiers: token.modifiers,
    })),
    [
      {
        text: "main",
        tokenType: "function",
        modifiers: ["declaration"],
      },
      {
        text: "print",
        tokenType: "function",
        modifiers: ["defaultLibrary", "builtin"],
      },
    ],
  );

  const { toolDefinition } = createHostBashRuntime();
  assert.ok(toolDefinition.renderCall);

  const rendered = toolDefinition.renderCall(
    {
      command: SHIPPED_PYTHON_SAMPLE_COMMAND,
    },
    markerTheme as never,
    {
      executionStarted: false,
      state: {},
    } as never,
  ) as { render(width: number): string[] };

  const actualBodyLines = rendered
    .render(400)
    .map((line) => stripAnsi(line).trimEnd())
    .slice(match.startLineIndex, match.endLineIndex + 1);

  assert.deepStrictEqual(actualBodyLines, [
    "#!/usr/bin/env python3",
    "",
    "def main() -> None:",
    '    print("hello")',
  ]);
});
