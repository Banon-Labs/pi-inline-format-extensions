import {
  extractInlineFormatHeredocOpenerCommand,
  findInlineFormatHeredocRange,
  type InlineFormatMatch,
  type InlineFormatPlugin,
} from "@pi-inline-format/shared-contract";

export const BASH_HEREDOC_MARKERS = ["<<'SH'", '<<"SH"', "<<SH"] as const;
export const BASH_HEREDOC_TERMINATOR = "SH";

const BASH_HEREDOC_COMMAND_PATTERN = /^\s*(?:bash|sh)(?:\s|$)/u;

export function findBashHeredocRange(command: string): {
  startLineIndex: number;
  endLineIndex: number;
} | null {
  const explicitRange = findInlineFormatHeredocRange(command, {
    terminator: BASH_HEREDOC_TERMINATOR,
  });

  if (explicitRange !== null) {
    return explicitRange;
  }

  const genericRange = findInlineFormatHeredocRange(command);
  const openerCommand =
    genericRange === null
      ? null
      : extractInlineFormatHeredocOpenerCommand(genericRange.openerLine);

  if (
    genericRange === null ||
    openerCommand === null ||
    !BASH_HEREDOC_COMMAND_PATTERN.test(openerCommand)
  ) {
    return null;
  }

  return genericRange;
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
