import type {
  InlineFormatMatch,
  InlineFormatPlugin,
} from "@pi-inline-format/shared-contract";

export const BASH_HEREDOC_MARKERS = ["<<'SH'", '<<"SH"', "<<SH"] as const;
export const BASH_HEREDOC_TERMINATOR = "SH";

export function findBashHeredocRange(command: string): {
  startLineIndex: number;
  endLineIndex: number;
} | null {
  const lines = command.split("\n");
  const startLineIndex = lines.findIndex((line) =>
    BASH_HEREDOC_MARKERS.some((marker) => line.includes(marker)),
  );

  if (startLineIndex === -1) {
    return null;
  }

  const endLineIndex = lines.findIndex(
    (line, index) => index > startLineIndex && line === BASH_HEREDOC_TERMINATOR,
  );

  if (endLineIndex <= startLineIndex + 1) {
    return null;
  }

  return { startLineIndex, endLineIndex };
}

function detectBashHeredoc(command: string): InlineFormatMatch | null {
  const heredocRange = findBashHeredocRange(command);

  if (heredocRange === null) {
    return null;
  }

  return {
    pluginName: "bash",
    language: "bash",
    startLineIndex: heredocRange.startLineIndex + 1,
    endLineIndex: heredocRange.endLineIndex - 1,
  };
}

export const bashInlineFormatPlugin: InlineFormatPlugin = {
  name: "bash",
  language: "bash",
  detect: detectBashHeredoc,
};
