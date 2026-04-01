import {
  extractInlineFormatHeredocOpenerCommand,
  findInlineFormatHeredocRange,
  findInlineFormatHeredocRanges,
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

export function findTypeScriptHeredocRanges(command: string): {
  startLineIndex: number;
  endLineIndex: number;
}[] {
  const explicitRanges = findInlineFormatHeredocRanges(command, {
    terminator: TYPESCRIPT_HEREDOC_TERMINATOR,
  });

  if (explicitRanges.length > 0) {
    return explicitRanges;
  }

  return findInlineFormatHeredocRanges(command).filter((range) => {
    const openerCommand = extractInlineFormatHeredocOpenerCommand(
      range.openerLine,
    );

    return isTypeScriptHeredocOpener(openerCommand);
  });
}

export function findTypeScriptHeredocRange(command: string): {
  startLineIndex: number;
  endLineIndex: number;
} | null {
  return findTypeScriptHeredocRanges(command)[0] ?? null;
}

function detectTypeScriptHeredoc(command: string): InlineFormatMatch[] | null {
  const heredocRanges = findTypeScriptHeredocRanges(command);

  if (heredocRanges.length === 0) {
    return null;
  }

  return heredocRanges.map((heredocRange) => ({
    pluginName: "typescript",
    language: "typescript",
    startLineIndex: heredocRange.startLineIndex + 1,
    endLineIndex: heredocRange.endLineIndex - 1,
  }));
}

export const typescriptInlineFormatPlugin: InlineFormatPlugin = {
  name: "typescript",
  language: "typescript",
  detect: detectTypeScriptHeredoc,
};
