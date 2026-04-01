import {
  createInlineFormatVirtualDocument,
  normalizeInlineFormatSemanticTokens,
  type InlineFormatInspectionResult,
  type InlineFormatSemanticToken,
  type InlineFormatVirtualDocument,
} from "@pi-inline-format/intel";
import {
  extractInlineFormatHeredocOpenerCommand,
  findInlineFormatHeredocRange,
  findInlineFormatHeredocRanges,
  type InlineFormatMatch,
  type InlineFormatPlugin,
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

export interface PythonSemanticTokensRenderSlicePayload extends PythonNormalizedSemanticTokensBoundaryPayload {
  sourceLines: string[];
}

export interface PythonSemanticTokensRenderHandoffPayload extends PythonSemanticTokensRenderSlicePayload {
  language: "python";
}

export type PythonSemanticTokensInspector = (
  document: InlineFormatVirtualDocument,
  kind: "semantic-tokens",
) => Promise<InlineFormatInspectionResult | null>;

export type PythonSemanticTokensRenderEntrypoint<TResult> = (
  payload: PythonSemanticTokensRenderHandoffPayload,
) => TResult | Promise<TResult>;

export interface PythonSemanticTokensRenderEntrypointReference<TResult> {
  render: PythonSemanticTokensRenderEntrypoint<TResult>;
}

export function createPythonSemanticTokensRenderEntrypointReference<TResult>(
  render: PythonSemanticTokensRenderEntrypoint<TResult>,
): PythonSemanticTokensRenderEntrypointReference<TResult> {
  return { render };
}

const PYTHON_HEREDOC_COMMAND_PATTERN = /^\s*python(?:3)?(?:\s|$)/u;

export function findPythonHeredocRanges(command: string): {
  startLineIndex: number;
  endLineIndex: number;
}[] {
  const explicitRanges = findInlineFormatHeredocRanges(command, {
    terminator: PYTHON_HEREDOC_TERMINATOR,
  });

  if (explicitRanges.length > 0) {
    return explicitRanges;
  }

  return findInlineFormatHeredocRanges(command).filter((range) => {
    const openerCommand = extractInlineFormatHeredocOpenerCommand(
      range.openerLine,
    );

    return PYTHON_HEREDOC_COMMAND_PATTERN.test(openerCommand);
  });
}

export function findPythonHeredocRange(command: string): {
  startLineIndex: number;
  endLineIndex: number;
} | null {
  return findPythonHeredocRanges(command)[0] ?? null;
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

export async function collectPythonSemanticTokensRenderSlicePayload(
  command: string,
  inspect: PythonSemanticTokensInspector,
  projectRoot: string = process.cwd(),
): Promise<PythonSemanticTokensRenderSlicePayload | null> {
  const collected = await collectNormalizedPythonSemanticTokensBoundaryPayload(
    command,
    inspect,
    projectRoot,
  );

  if (collected === null) {
    return null;
  }

  return {
    ...collected,
    sourceLines: collected.context.source.split("\n"),
  };
}

export async function collectPythonSemanticTokensRenderHandoffPayload(
  command: string,
  inspect: PythonSemanticTokensInspector,
  projectRoot: string = process.cwd(),
): Promise<PythonSemanticTokensRenderHandoffPayload | null> {
  const collected = await collectPythonSemanticTokensRenderSlicePayload(
    command,
    inspect,
    projectRoot,
  );

  if (collected === null) {
    return null;
  }

  return {
    ...collected,
    language: "python",
  };
}

export async function renderPythonSemanticTokensAtBoundary<TResult>(
  command: string,
  inspect: PythonSemanticTokensInspector,
  entrypoint: PythonSemanticTokensRenderEntrypointReference<TResult>,
  projectRoot: string = process.cwd(),
): Promise<TResult | null> {
  const payload = await collectPythonSemanticTokensRenderHandoffPayload(
    command,
    inspect,
    projectRoot,
  );

  if (payload === null) {
    return null;
  }

  return await entrypoint.render(payload);
}

function detectPythonHeredoc(command: string): InlineFormatMatch[] | null {
  const heredocRanges = findPythonHeredocRanges(command);

  if (heredocRanges.length === 0) {
    return null;
  }

  return heredocRanges.map((heredocRange) => ({
    pluginName: "python",
    language: "python",
    startLineIndex: heredocRange.startLineIndex + 1,
    endLineIndex: heredocRange.endLineIndex - 1,
  }));
}

export const pythonInlineFormatPlugin: InlineFormatPlugin = {
  name: "python",
  language: "python",
  detect: detectPythonHeredoc,
};
