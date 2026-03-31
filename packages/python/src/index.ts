import {
  createInlineFormatVirtualDocument,
  normalizeInlineFormatSemanticTokens,
  type InlineFormatInspectionResult,
  type InlineFormatSemanticToken,
  type InlineFormatVirtualDocument,
} from "@pi-inline-format/intel";
import type {
  InlineFormatMatch,
  InlineFormatPlugin,
} from "@pi-inline-format/shared-contract";

export const PYTHON_HEREDOC_MARKERS = ["<<'PY'", '<<"PY"', "<<PY"] as const;
export const PYTHON_HEREDOC_TERMINATOR = "PY";

export interface PythonSemanticTokensBoundaryContext {
  command: string;
  source: string;
  startLineIndex: number;
  endLineIndex: number;
  filePath: string;
  document: InlineFormatVirtualDocument;
  match: InlineFormatMatch;
}

export interface PythonSemanticTokensBoundaryPayload {
  context: PythonSemanticTokensBoundaryContext;
  rawResult: InlineFormatInspectionResult | null;
}

export interface PythonNormalizedSemanticTokensBoundaryPayload extends PythonSemanticTokensBoundaryPayload {
  tokens: InlineFormatSemanticToken[];
}

export type PythonSemanticTokensInspector = (
  document: InlineFormatVirtualDocument,
  kind: "semantic-tokens",
) => Promise<InlineFormatInspectionResult | null>;

export function findPythonHeredocRange(command: string): {
  startLineIndex: number;
  endLineIndex: number;
} | null {
  const lines = command.split("\n");
  const startLineIndex = lines.findIndex((line) =>
    PYTHON_HEREDOC_MARKERS.some((marker) => line.includes(marker)),
  );

  if (startLineIndex === -1) {
    return null;
  }

  const endLineIndex = lines.findIndex(
    (line, index) =>
      index > startLineIndex && line === PYTHON_HEREDOC_TERMINATOR,
  );

  if (endLineIndex <= startLineIndex + 1) {
    return null;
  }

  return { startLineIndex, endLineIndex };
}

export function extractPythonHeredocSource(command: string): string | null {
  const heredocRange = findPythonHeredocRange(command);

  if (heredocRange === null) {
    return null;
  }

  const source = command
    .split("\n")
    .slice(heredocRange.startLineIndex + 1, heredocRange.endLineIndex)
    .join("\n");

  return source.length === 0 ? null : source;
}

export function describePythonHeredoc(command: string): {
  startLineIndex: number;
  endLineIndex: number;
  source: string;
} | null {
  const heredocRange = findPythonHeredocRange(command);

  if (heredocRange === null) {
    return null;
  }

  const source = extractPythonHeredocSource(command);

  if (source === null) {
    return null;
  }

  return {
    startLineIndex: heredocRange.startLineIndex,
    endLineIndex: heredocRange.endLineIndex,
    source,
  };
}

function inferPythonFilePathHint(command: string): string | undefined {
  const fileWriteMatch = /cat\s*>\s*(?<path>\S+)\s*<</u.exec(command);
  return fileWriteMatch?.groups?.path;
}

export function createPythonSemanticTokensBoundaryContext(
  command: string,
  projectRoot: string = process.cwd(),
): PythonSemanticTokensBoundaryContext | null {
  const heredoc = describePythonHeredoc(command);

  if (heredoc === null) {
    return null;
  }

  const match: InlineFormatMatch = {
    pluginName: "python",
    language: "python",
    startLineIndex: heredoc.startLineIndex + 1,
    endLineIndex: heredoc.endLineIndex - 1,
  };
  const filePathHint = inferPythonFilePathHint(command);
  const region = {
    language: "python" as const,
    match,
    command,
    source: heredoc.source,
    projectRoot,
  };
  const document = createInlineFormatVirtualDocument(
    filePathHint === undefined
      ? region
      : {
          ...region,
          filePathHint,
        },
  );

  return {
    command,
    source: heredoc.source,
    startLineIndex: match.startLineIndex,
    endLineIndex: match.endLineIndex,
    filePath: document.filePath,
    document,
    match,
  };
}

export async function collectPythonSemanticTokensBoundaryPayload(
  command: string,
  inspect: PythonSemanticTokensInspector,
  projectRoot: string = process.cwd(),
): Promise<PythonSemanticTokensBoundaryPayload | null> {
  const context = createPythonSemanticTokensBoundaryContext(
    command,
    projectRoot,
  );

  if (context === null) {
    return null;
  }

  return {
    context,
    rawResult: await inspect(context.document, "semantic-tokens"),
  };
}

export async function collectNormalizedPythonSemanticTokensBoundaryPayload(
  command: string,
  inspect: PythonSemanticTokensInspector,
  projectRoot: string = process.cwd(),
): Promise<PythonNormalizedSemanticTokensBoundaryPayload | null> {
  const collected = await collectPythonSemanticTokensBoundaryPayload(
    command,
    inspect,
    projectRoot,
  );

  if (collected === null) {
    return null;
  }

  return {
    ...collected,
    tokens:
      collected.rawResult === null
        ? []
        : normalizeInlineFormatSemanticTokens(collected.rawResult),
  };
}

function detectPythonHeredoc(command: string): InlineFormatMatch | null {
  const heredocRange = findPythonHeredocRange(command);

  if (heredocRange === null) {
    return null;
  }

  return {
    pluginName: "python",
    language: "python",
    startLineIndex: heredocRange.startLineIndex + 1,
    endLineIndex: heredocRange.endLineIndex - 1,
  };
}

export const pythonInlineFormatPlugin: InlineFormatPlugin = {
  name: "python",
  language: "python",
  detect: detectPythonHeredoc,
};
