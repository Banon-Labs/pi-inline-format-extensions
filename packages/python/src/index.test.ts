import assert from "node:assert/strict";
import test from "node:test";

import type {
  InlineFormatInspectionResult,
  InlineFormatVirtualDocument,
} from "@pi-inline-format/intel";

import {
  collectNormalizedPythonSemanticTokensBoundaryPayload,
  collectPythonSemanticTokensBoundaryPayload,
  collectPythonSemanticTokensRenderHandoffPayload,
  collectPythonSemanticTokensRenderSlicePayload,
  createPythonSemanticTokensBoundaryContext,
  createPythonSemanticTokensRenderEntrypointReference,
} from "./index.js";

const SHIPPED_PYTHON_SAMPLE_COMMAND = `cat > /tmp/delete.me.py <<'PY'
#!/usr/bin/env python3

def main() -> None:
    print("hello")
PY`;

const SHIPPED_PYTHON_SEMANTIC_TOKENS_RESULT: InlineFormatInspectionResult = {
  backendName: "stub-python-intel",
  language: "python",
  kind: "semantic-tokens",
  summary: "stubbed raw payload",
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
  },
};

test("pins the shipped Python sample semantic-token collection boundary", () => {
  const context = createPythonSemanticTokensBoundaryContext(
    SHIPPED_PYTHON_SAMPLE_COMMAND,
    "/repo",
  );

  assert.ok(context);
  assert.equal(context.match.pluginName, "python");
  assert.equal(context.match.language, "python");
  assert.equal(context.startLineIndex, 1);
  assert.equal(context.endLineIndex, 4);
  assert.equal(
    context.source,
    '#!/usr/bin/env python3\n\ndef main() -> None:\n    print("hello")',
  );
  assert.equal(context.filePath, "/tmp/delete.me.py");
  assert.equal(context.document.language, "python");
  assert.equal(context.document.filePath, "/tmp/delete.me.py");
  assert.equal(context.document.region.projectRoot, "/repo");
});

test("collects the raw semantic-token payload without normalization", async () => {
  let receivedDocument: InlineFormatVirtualDocument | undefined;
  const rawResult: InlineFormatInspectionResult = {
    backendName: "stub-python-intel",
    language: "python",
    kind: "semantic-tokens",
    summary: "stubbed raw payload",
    payload: {
      tokenCount: 1,
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
  };

  const collected = await collectPythonSemanticTokensBoundaryPayload(
    SHIPPED_PYTHON_SAMPLE_COMMAND,
    async (document, kind) => {
      receivedDocument = document;
      assert.equal(kind, "semantic-tokens");
      return rawResult;
    },
    "/repo",
  );

  assert.ok(receivedDocument);
  assert.ok(collected);
  assert.equal(collected.context.document, receivedDocument);
  assert.equal(collected.rawResult, rawResult);
  assert.deepStrictEqual(collected.rawResult?.payload, rawResult.payload);
});

test("normalizes the collected raw payload into host semantic tokens", async () => {
  const collected = await collectNormalizedPythonSemanticTokensBoundaryPayload(
    SHIPPED_PYTHON_SAMPLE_COMMAND,
    async () => SHIPPED_PYTHON_SEMANTIC_TOKENS_RESULT,
    "/repo",
  );

  assert.ok(collected);
  assert.equal(collected.rawResult, SHIPPED_PYTHON_SEMANTIC_TOKENS_RESULT);
  assert.deepStrictEqual(collected.tokens, [
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

test("assembles the exact Python source-line slice beside normalized tokens", async () => {
  const collected = await collectPythonSemanticTokensRenderSlicePayload(
    SHIPPED_PYTHON_SAMPLE_COMMAND,
    async () => SHIPPED_PYTHON_SEMANTIC_TOKENS_RESULT,
    "/repo",
  );

  assert.ok(collected);
  assert.deepStrictEqual(collected.sourceLines, [
    "#!/usr/bin/env python3",
    "",
    "def main() -> None:",
    '    print("hello")',
  ]);
  assert.deepStrictEqual(
    collected.tokens.map((token) => token.text),
    ["main", "print"],
  );
});

test("assembles the remaining non-token Python render handoff arguments", async () => {
  const collected = await collectPythonSemanticTokensRenderHandoffPayload(
    SHIPPED_PYTHON_SAMPLE_COMMAND,
    async () => SHIPPED_PYTHON_SEMANTIC_TOKENS_RESULT,
    "/repo",
  );

  assert.ok(collected);
  assert.equal(collected.language, "python");
  assert.deepStrictEqual(collected.sourceLines, [
    "#!/usr/bin/env python3",
    "",
    "def main() -> None:",
    '    print("hello")',
  ]);
  assert.deepStrictEqual(
    collected.tokens.map((token) => token.text),
    ["main", "print"],
  );
});

test("creates a bounded reference to the host caller-supplied render entrypoint", () => {
  let callCount = 0;
  const render = () => {
    callCount += 1;
    return "unused";
  };

  const reference = createPythonSemanticTokensRenderEntrypointReference(render);

  assert.equal(reference.render, render);
  assert.equal(callCount, 0);
});

test("returns null when the command does not contain a Python heredoc", async () => {
  const collected = await collectPythonSemanticTokensBoundaryPayload(
    "echo 'not python'",
    async () => {
      throw new Error("should not inspect non-python commands");
    },
  );

  assert.equal(collected, null);
});
