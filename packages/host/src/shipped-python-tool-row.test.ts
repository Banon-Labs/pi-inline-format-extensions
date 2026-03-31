import assert from "node:assert/strict";
import test from "node:test";

import {
  createInlineFormatVirtualDocument,
  inspectInlineFormatDocument,
  normalizeInlineFormatSemanticTokens,
} from "@pi-inline-format/intel";

import { createHostBashRuntime, detectInlineFormatMatches } from "./index.js";

const SHIPPED_PYTHON_SAMPLE_COMMAND = `python3 <<'PY'
#!/usr/bin/env python3

def main() -> None:
    print("hello from py")

if __name__ == "__main__":
    main()
PY`;

const markerTheme = {
  fg: (color: string, text: string) => `<fg:${color}>${text}</fg>`,
  bold: (text: string) => `<bold>${text}</bold>`,
  italic: (text: string) => `<italic>${text}</italic>`,
  underline: (text: string) => `<underline>${text}</underline>`,
};

const ANSI_PATTERN = /\u001b\[[0-9;]*m/gu;

function stripAnsi(text: string): string {
  return text.replaceAll(ANSI_PATTERN, "");
}

test("keeps Python semantic-token inspection truthful and now threads shipped tokens into the normal tool row", async () => {
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
    "expected basedpyright semantic-token inspection output for the shipped inline Python sample",
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
      {
        text: "__name__",
        tokenType: "variable",
        modifiers: [],
      },
      {
        text: "main",
        tokenType: "function",
        modifiers: [],
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

  assert.equal(actualBodyLines[0], "#!/usr/bin/env python3");
  assert.equal(actualBodyLines[1], "");
  assert.match(
    actualBodyLines[2] ?? "",
    /<fg:syntaxFunction><bold>main<\/bold><\/fg>/u,
  );
  assert.match(
    actualBodyLines[3] ?? "",
    /<fg:syntaxFunction><italic>print<\/italic><\/fg>/u,
  );
  assert.notDeepStrictEqual(actualBodyLines, [
    "#!/usr/bin/env python3",
    "",
    "def main() -> None:",
    '    print("hello from py")',
    "",
    'if __name__ == "__main__":',
    "    main()",
  ]);
});
