import {
  extractInlineFormatHeredocOpenerCommand,
  findInlineFormatHeredocRange,
  findInlineFormatHeredocRanges,
  type InlineFormatMatch,
  type InlineFormatPlugin,
} from "@pi-inline-format/shared-contract";

export const JAVASCRIPT_HEREDOC_MARKERS = ["<<'JS'", '<<"JS"', "<<JS"] as const;
export const JAVASCRIPT_HEREDOC_TERMINATOR = "JS";

const JAVASCRIPT_HEREDOC_COMMAND_PATTERN = /^\s*node(?:\s|$)/u;
const TYPESCRIPT_NODE_RUNTIME_PATTERN =
  /^\s*node(?=.*(?:--import|--require)(?:\s+|=)tsx(?:\/(?:esm|cjs))?)(?:\s|$)/u;

export function findJavaScriptHeredocRanges(command: string): {
  startLineIndex: number;
  endLineIndex: number;
}[] {
  const explicitRanges = findInlineFormatHeredocRanges(command, {
    terminator: JAVASCRIPT_HEREDOC_TERMINATOR,
  });

  if (explicitRanges.length > 0) {
    return explicitRanges;
  }

  return findInlineFormatHeredocRanges(command).filter((range) => {
    const openerCommand = extractInlineFormatHeredocOpenerCommand(
      range.openerLine,
    );

    return (
      JAVASCRIPT_HEREDOC_COMMAND_PATTERN.test(openerCommand) &&
      !TYPESCRIPT_NODE_RUNTIME_PATTERN.test(openerCommand)
    );
  });
}

export function findJavaScriptHeredocRange(command: string): {
  startLineIndex: number;
  endLineIndex: number;
} | null {
  return findJavaScriptHeredocRanges(command)[0] ?? null;
}

function detectJavaScriptHeredoc(command: string): InlineFormatMatch[] | null {
  const heredocRanges = findJavaScriptHeredocRanges(command);

  if (heredocRanges.length === 0) {
    return null;
  }

  return heredocRanges.map((heredocRange) => ({
    pluginName: "javascript",
    language: "javascript",
    startLineIndex: heredocRange.startLineIndex + 1,
    endLineIndex: heredocRange.endLineIndex - 1,
  }));
}

export const javascriptInlineFormatPlugin: InlineFormatPlugin = {
  name: "javascript",
  language: "javascript",
  detect: detectJavaScriptHeredoc,
};
