import assert from "node:assert/strict";
import test from "node:test";

import { createInlineFormatVirtualDocument } from "@pi-inline-format/intel";

import {
  STANDARD_PYTHON_SAMPLE_COMMAND,
  VERBOSE_PYTHON_SAMPLE_COMMAND,
} from "./demo-samples.js";
import { detectInlineFormatMatches } from "./index.js";
import { collectHostPythonSmarterHighlightTokens } from "./python-smarter-highlight.js";

function createDocument(command: string) {
  const lines = command.split("\n");
  const match = detectInlineFormatMatches(command).find(
    (candidate) => candidate.language === "python",
  );
  assert.ok(match, "expected the Python sample to be detected");

  return createInlineFormatVirtualDocument({
    language: "python",
    match,
    command,
    source: lines
      .slice(match.startLineIndex, match.endLineIndex + 1)
      .join("\n"),
  });
}

test("collects bounded Python semantic tokens for the shipped standard inline sample source", () => {
  assert.deepStrictEqual(
    collectHostPythonSmarterHighlightTokens(
      createDocument(STANDARD_PYTHON_SAMPLE_COMMAND),
    ).map((token) => ({
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

test("collects bounded Python semantic tokens for the shipped verbose inline sample source", () => {
  const tokens = collectHostPythonSmarterHighlightTokens(
    createDocument(VERBOSE_PYTHON_SAMPLE_COMMAND),
  ).map((token) => ({
    text: token.text,
    tokenType: token.tokenType,
    modifiers: token.modifiers,
  }));

  assert.deepStrictEqual(tokens.slice(0, 6), [
    {
      text: "simple",
      tokenType: "function",
      modifiers: ["declaration"],
    },
    {
      text: "posonly",
      tokenType: "function",
      modifiers: ["declaration"],
    },
    {
      text: "with_annotations",
      tokenType: "function",
      modifiers: ["declaration"],
    },
    {
      text: "generator",
      tokenType: "function",
      modifiers: ["declaration"],
    },
    {
      text: "decorator",
      tokenType: "function",
      modifiers: ["declaration"],
    },
    {
      text: "deco_factory",
      tokenType: "function",
      modifiers: ["declaration"],
    },
  ]);
  assert.ok(
    tokens.some(
      (token) =>
        token.text === "main" && token.modifiers.includes("declaration"),
    ),
  );
  assert.ok(
    tokens.some(
      (token) =>
        token.text === "print" &&
        token.modifiers.includes("defaultLibrary") &&
        token.modifiers.includes("builtin"),
    ),
  );
});

test("returns no Python tokens outside the bounded shipped inline sample sources", () => {
  const command = STANDARD_PYTHON_SAMPLE_COMMAND.replace(
    "hello from py",
    "goodbye from py",
  );
  const document = createDocument(command);

  assert.deepStrictEqual(collectHostPythonSmarterHighlightTokens(document), []);
});
