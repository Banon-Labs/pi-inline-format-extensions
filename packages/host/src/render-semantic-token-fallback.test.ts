import assert from "node:assert/strict";
import test from "node:test";

import type { InlineFormatSemanticToken } from "@pi-inline-format/intel";

import { renderSemanticallyHighlightedScriptLinesWithSuppliedTokens } from "./index.js";

const identityTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  italic: (text: string) => text,
  underline: (text: string) => text,
};

const overlapTokens: InlineFormatSemanticToken[] = [
  {
    range: {
      start: { lineIndex: 0, columnIndex: 6 },
      end: { lineIndex: 0, columnIndex: 11 },
    },
    tokenType: "variable",
    modifiers: [],
    text: "value",
  },
  {
    range: {
      start: { lineIndex: 0, columnIndex: 8 },
      end: { lineIndex: 0, columnIndex: 13 },
    },
    tokenType: "function",
    modifiers: ["declaration"],
    text: "lue =",
  },
];

const outOfOrderTokens: InlineFormatSemanticToken[] = [
  {
    range: {
      start: { lineIndex: 0, columnIndex: 11 },
      end: { lineIndex: 0, columnIndex: 6 },
    },
    tokenType: "variable",
    modifiers: [],
    text: "value",
  },
];

const crossLineTokens: InlineFormatSemanticToken[] = [
  {
    range: {
      start: { lineIndex: 0, columnIndex: 6 },
      end: { lineIndex: 1, columnIndex: 5 },
    },
    tokenType: "variable",
    modifiers: [],
    text: "value",
  },
];

test("falls back to the observed baseline output for overlapping semantic tokens", () => {
  const rendered = renderSemanticallyHighlightedScriptLinesWithSuppliedTokens(
    "typescript",
    ["const value = 42;", "console.log(value);"],
    overlapTokens,
    identityTheme,
  );

  assert.deepStrictEqual(rendered, [
    "\u001b[38;2;86;156;214mconst\u001b[39m value = \u001b[38;2;181;206;168m42\u001b[39m;",
    "\u001b[38;2;78;201;176mconsole\u001b[39m.log(value);",
  ]);
});

test("falls back to the observed baseline output for out-of-order semantic tokens", () => {
  const rendered = renderSemanticallyHighlightedScriptLinesWithSuppliedTokens(
    "typescript",
    ["const value = 42;", "console.log(value);"],
    outOfOrderTokens,
    identityTheme,
  );

  assert.deepStrictEqual(rendered, [
    "\u001b[38;2;86;156;214mconst\u001b[39m value = \u001b[38;2;181;206;168m42\u001b[39m;",
    "\u001b[38;2;78;201;176mconsole\u001b[39m.log(value);",
  ]);
});

test("returns null for the observed cross-line semantic-token fallback", () => {
  const rendered = renderSemanticallyHighlightedScriptLinesWithSuppliedTokens(
    "typescript",
    ["const value = 42;", "console.log(value);"],
    crossLineTokens,
    identityTheme,
  );

  assert.strictEqual(rendered, null);
});
