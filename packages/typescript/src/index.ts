import type {
  InlineFormatMatch,
  InlineFormatPlugin,
} from "@pi-inline-format/shared-contract";

export const TYPESCRIPT_HEREDOC_MARKERS = ["<<'TS'", '<<"TS"', "<<TS"] as const;
export const TYPESCRIPT_HEREDOC_TERMINATOR = "TS";

export function findTypeScriptHeredocRange(command: string): {
  startLineIndex: number;
  endLineIndex: number;
} | null {
  const lines = command.split("\n");
  const startLineIndex = lines.findIndex((line) =>
    TYPESCRIPT_HEREDOC_MARKERS.some((marker) => line.includes(marker)),
  );

  if (startLineIndex === -1) {
    return null;
  }

  const endLineIndex = lines.findIndex(
    (line, index) =>
      index > startLineIndex && line === TYPESCRIPT_HEREDOC_TERMINATOR,
  );

  if (endLineIndex <= startLineIndex + 1) {
    return null;
  }

  return { startLineIndex, endLineIndex };
}

function detectTypeScriptHeredoc(command: string): InlineFormatMatch | null {
  const heredocRange = findTypeScriptHeredocRange(command);

  if (heredocRange === null) {
    return null;
  }

  return {
    pluginName: "typescript",
    language: "typescript",
    startLineIndex: heredocRange.startLineIndex + 1,
    endLineIndex: heredocRange.endLineIndex - 1,
  };
}

export const typescriptInlineFormatPlugin: InlineFormatPlugin = {
  name: "typescript",
  language: "typescript",
  detect: detectTypeScriptHeredoc,
};
