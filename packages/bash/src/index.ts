import {
  extractInlineFormatHeredocOpenerCommand,
  findInlineFormatHeredocRange,
  findInlineFormatHeredocRanges,
  type InlineFormatMatch,
  type InlineFormatPlugin,
} from "@pi-inline-format/shared-contract";

export const BASH_HEREDOC_MARKERS = ["<<'SH'", '<<"SH"', "<<SH"] as const;
export const BASH_HEREDOC_TERMINATOR = "SH";

const BASH_HEREDOC_COMMAND_PATTERN = /^\s*(?:bash|sh)(?:\s|$)/u;

export function findBashHeredocRanges(command: string): {
  startLineIndex: number;
  endLineIndex: number;
}[] {
  const explicitRanges = findInlineFormatHeredocRanges(command, {
    terminator: BASH_HEREDOC_TERMINATOR,
  });

  if (explicitRanges.length > 0) {
    return explicitRanges;
  }

  return findInlineFormatHeredocRanges(command).filter((range) => {
    const openerCommand = extractInlineFormatHeredocOpenerCommand(
      range.openerLine,
    );

    return BASH_HEREDOC_COMMAND_PATTERN.test(openerCommand);
  });
}

export function findBashHeredocRange(command: string): {
  startLineIndex: number;
  endLineIndex: number;
} | null {
  return findBashHeredocRanges(command)[0] ?? null;
}

function detectBashHeredoc(command: string): InlineFormatMatch[] | null {
  const heredocRanges = findBashHeredocRanges(command);

  if (heredocRanges.length === 0) {
    return null;
  }

  return heredocRanges.map((heredocRange) => ({
    pluginName: "bash",
    language: "bash",
    startLineIndex: heredocRange.startLineIndex + 1,
    endLineIndex: heredocRange.endLineIndex - 1,
  }));
}

export const bashInlineFormatPlugin: InlineFormatPlugin = {
  name: "bash",
  language: "bash",
  detect: detectBashHeredoc,
};
