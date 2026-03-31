import assert from "node:assert/strict";
import test from "node:test";

import { normalizeInlineFormatSemanticTokens } from "./index.js";

const shippedPythonSemanticTokensResult = {
  kind: "semantic-tokens" as const,
  payload: {
    tokenCount: 2,
    tokens: [
      {
        range: {
          start: { lineIndex: 2, columnIndex: 4 },
          end: { lineIndex: 2, columnIndex: 8 },
        },
        tokenType: "function",
        modifiers: ["declaration"],
        text: "main",
      },
      {
        range: {
          start: { lineIndex: 3, columnIndex: 4 },
          end: { lineIndex: 3, columnIndex: 9 },
        },
        tokenType: "function",
        modifiers: ["defaultLibrary", "builtin"],
        text: "print",
      },
    ],
    legend: {
      tokenTypes: [
        "namespace",
        "type",
        "class",
        "enum",
        "typeParameter",
        "parameter",
        "variable",
        "property",
        "enumMember",
        "function",
        "method",
        "keyword",
        "decorator",
        "selfParameter",
        "clsParameter",
      ],
      tokenModifiers: [
        "declaration",
        "definition",
        "readonly",
        "static",
        "async",
        "defaultLibrary",
        "builtin",
        "classMember",
        "parameter",
      ],
    },
  },
};

test("normalizes Python semantic-token range coordinates", () => {
  const tokens = normalizeInlineFormatSemanticTokens(
    shippedPythonSemanticTokensResult,
  );

  assert.deepStrictEqual(
    tokens.map((token) => token.range),
    [
      {
        start: { lineIndex: 2, columnIndex: 4 },
        end: { lineIndex: 2, columnIndex: 8 },
      },
      {
        start: { lineIndex: 3, columnIndex: 4 },
        end: { lineIndex: 3, columnIndex: 9 },
      },
    ],
  );
});

test("normalizes Python semantic-token type and modifier fields", () => {
  const tokens = normalizeInlineFormatSemanticTokens(
    shippedPythonSemanticTokensResult,
  );

  assert.deepStrictEqual(tokens, [
    {
      range: {
        start: { lineIndex: 2, columnIndex: 4 },
        end: { lineIndex: 2, columnIndex: 8 },
      },
      tokenType: "function",
      modifiers: ["declaration"],
      text: "main",
    },
    {
      range: {
        start: { lineIndex: 3, columnIndex: 4 },
        end: { lineIndex: 3, columnIndex: 9 },
      },
      tokenType: "function",
      modifiers: ["defaultLibrary", "builtin"],
      text: "print",
    },
  ]);
});

test("drops invalid semantic-token payloads instead of guessing", () => {
  assert.deepStrictEqual(
    normalizeInlineFormatSemanticTokens({
      kind: "semantic-tokens",
      payload: {
        tokens: [
          {
            range: {
              start: { lineIndex: 2, columnIndex: 4 },
              end: { lineIndex: "bad", columnIndex: 8 },
            },
            tokenType: "function",
            modifiers: ["declaration"],
          },
        ],
      },
    }),
    [],
  );
});
