import {
  findInlineFormatHeredocRange,
  type InlineFormatMatch,
  type InlineFormatPlugin,
} from "@pi-inline-format/shared-contract";

export const TYPESCRIPT_HEREDOC_MARKERS = ["<<'TS'", '<<"TS"', "<<TS"] as const;
export const TYPESCRIPT_HEREDOC_TERMINATOR = "TS";

const TYPESCRIPT_HEREDOC_COMMAND_PATTERN = /^\s*(?:npx\s+tsx|tsx)(?:\s|$)/u;

export function findTypeScriptHeredocRange(command: string): {
  startLineIndex: number;
  endLineIndex: number;
} | null {
  const explicitRange = findInlineFormatHeredocRange(command, {
    terminator: TYPESCRIPT_HEREDOC_TERMINATOR,
  });

  if (explicitRange !== null) {
    return explicitRange;
  }

  const genericRange = findInlineFormatHeredocRange(command);

  if (
    genericRange === null ||
    !TYPESCRIPT_HEREDOC_COMMAND_PATTERN.test(genericRange.openerLine)
  ) {
    return null;
  }

  return genericRange;
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
