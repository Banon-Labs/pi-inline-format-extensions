import type {
  InlineFormatMatch,
  InlineFormatPlugin,
} from "@pi-inline-format/shared-contract";

export const PYTHON_HEREDOC_MARKERS = ["<<'PY'", '<<"PY"', "<<PY"] as const;
export const PYTHON_HEREDOC_TERMINATOR = "PY";

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
