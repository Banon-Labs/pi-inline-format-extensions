import assert from "node:assert/strict";
import test from "node:test";

import { createInlineFormatVirtualDocument } from "@pi-inline-format/intel";

import { detectInlineFormatMatches } from "./index.js";
import { collectHostPythonSmarterHighlightTokens } from "./python-smarter-highlight.js";

const SHIPPED_PYTHON_SAMPLE_COMMAND = `python3 <<'PY'
#!/usr/bin/env python3

def main() -> None:
    print("hello from py")

if __name__ == "__main__":
    main()
PY`;

test("collects bounded Python semantic tokens for the shipped inline sample source", () => {
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

  assert.deepStrictEqual(
    collectHostPythonSmarterHighlightTokens(document).map((token) => ({
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
});

test("returns no Python tokens outside the bounded shipped inline sample source", () => {
  const lines = SHIPPED_PYTHON_SAMPLE_COMMAND.split("\n");
  const match = detectInlineFormatMatches(SHIPPED_PYTHON_SAMPLE_COMMAND).find(
    (candidate) => candidate.language === "python",
  );
  assert.ok(match, "expected the shipped Python sample to be detected");

  const document = createInlineFormatVirtualDocument({
    language: "python",
    match,
    command: SHIPPED_PYTHON_SAMPLE_COMMAND.replace(
      "hello from py",
      "goodbye from py",
    ),
    source: lines
      .slice(match.startLineIndex, match.endLineIndex + 1)
      .join("\n")
      .replace("hello from py", "goodbye from py"),
  });

  assert.deepStrictEqual(collectHostPythonSmarterHighlightTokens(document), []);
});
