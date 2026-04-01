import {
  findInlineFormatHeredocRange,
  type InlineFormatMatch,
  type InlineFormatPlugin,
} from "@pi-inline-format/shared-contract";

export const TYPESCRIPT_HEREDOC_MARKERS = ["<<'TS'", '<<"TS"', "<<TS"] as const;
export const TYPESCRIPT_HEREDOC_TERMINATOR = "TS";

const TYPESCRIPT_HEREDOC_COMMAND_PATTERN =
  /^\s*(?:npx(?:\s+-{1,2}\S+)*\s+tsx|tsx|pnpm\s+dlx\s+tsx)(?:\s|$)/u;
const TYPESCRIPT_NODE_RUNTIME_PATTERN =
  /^\s*node(?=.*(?:--import|--require)(?:\s+|=)tsx(?:\/(?:esm|cjs))?)(?:\s|$)/u;

function isTypeScriptHeredocOpener(line: string): boolean {
  return (
    TYPESCRIPT_HEREDOC_COMMAND_PATTERN.test(line) ||
    TYPESCRIPT_NODE_RUNTIME_PATTERN.test(line)
  );
}

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
    !isTypeScriptHeredocOpener(genericRange.openerLine)
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
