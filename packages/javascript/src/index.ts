import type {
  InlineFormatMatch,
  InlineFormatPlugin,
} from "@pi-inline-format/shared-contract";

export const JAVASCRIPT_HEREDOC_MARKERS = ["<<'JS'", '<<"JS"', "<<JS"] as const;
export const JAVASCRIPT_HEREDOC_TERMINATOR = "JS";

export function findJavaScriptHeredocRange(command: string): {
  startLineIndex: number;
  endLineIndex: number;
} | null {
  const lines = command.split("\n");
  const startLineIndex = lines.findIndex((line) =>
    JAVASCRIPT_HEREDOC_MARKERS.some((marker) => line.includes(marker)),
  );

  if (startLineIndex === -1) {
    return null;
  }

  const endLineIndex = lines.findIndex(
    (line, index) =>
      index > startLineIndex && line === JAVASCRIPT_HEREDOC_TERMINATOR,
  );

  if (endLineIndex <= startLineIndex + 1) {
    return null;
  }

  return { startLineIndex, endLineIndex };
}

function detectJavaScriptHeredoc(command: string): InlineFormatMatch | null {
  const heredocRange = findJavaScriptHeredocRange(command);

  if (heredocRange === null) {
    return null;
  }

  return {
    pluginName: "javascript",
    language: "javascript",
    startLineIndex: heredocRange.startLineIndex + 1,
    endLineIndex: heredocRange.endLineIndex - 1,
  };
}

export const javascriptInlineFormatPlugin: InlineFormatPlugin = {
  name: "javascript",
  language: "javascript",
  detect: detectJavaScriptHeredoc,
};
