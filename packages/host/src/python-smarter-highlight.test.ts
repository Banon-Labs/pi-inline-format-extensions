import assert from "node:assert/strict";
import test from "node:test";

import { createInlineFormatVirtualDocument } from "@pi-inline-format/intel";

import { detectInlineFormatMatches } from "./index.js";
import { collectHostPythonSmarterHighlightTokens } from "./python-smarter-highlight.js";

const SHIPPED_PYTHON_SAMPLE_COMMAND = `cat > /tmp/delete.me.py <<'PY'
#!/usr/bin/env python3

def main() -> None:
    print("hello")
PY`;

test("collects bounded Python semantic tokens for the shipped sample path", () => {
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
    filePathHint: "/tmp/delete.me.py",
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

test("returns no Python tokens outside the bounded shipped sample path", () => {
  const lines = SHIPPED_PYTHON_SAMPLE_COMMAND.split("\n");
  const match = detectInlineFormatMatches(SHIPPED_PYTHON_SAMPLE_COMMAND).find(
    (candidate) => candidate.language === "python",
  );
  assert.ok(match, "expected the shipped Python sample to be detected");

  const document = createInlineFormatVirtualDocument({
    language: "python",
    match,
    command: SHIPPED_PYTHON_SAMPLE_COMMAND.replaceAll(
      "/tmp/delete.me.py",
      "/tmp/not-shipped.py",
    ),
    source: lines
      .slice(match.startLineIndex, match.endLineIndex + 1)
      .join("\n"),
    filePathHint: "/tmp/not-shipped.py",
  });

  assert.deepStrictEqual(collectHostPythonSmarterHighlightTokens(document), []);
});
