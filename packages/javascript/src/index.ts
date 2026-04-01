import {
  extractInlineFormatHeredocOpenerCommand,
  findInlineFormatHeredocRange,
  type InlineFormatMatch,
  type InlineFormatPlugin,
} from "@pi-inline-format/shared-contract";

export const JAVASCRIPT_HEREDOC_MARKERS = ["<<'JS'", '<<"JS"', "<<JS"] as const;
export const JAVASCRIPT_HEREDOC_TERMINATOR = "JS";

const JAVASCRIPT_HEREDOC_COMMAND_PATTERN = /^\s*node(?:\s|$)/u;
const TYPESCRIPT_NODE_RUNTIME_PATTERN =
  /^\s*node(?=.*(?:--import|--require)(?:\s+|=)tsx(?:\/(?:esm|cjs))?)(?:\s|$)/u;

export function findJavaScriptHeredocRange(command: string): {
  startLineIndex: number;
  endLineIndex: number;
} | null {
  const explicitRange = findInlineFormatHeredocRange(command, {
    terminator: JAVASCRIPT_HEREDOC_TERMINATOR,
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
    !JAVASCRIPT_HEREDOC_COMMAND_PATTERN.test(openerCommand) ||
    TYPESCRIPT_NODE_RUNTIME_PATTERN.test(openerCommand)
  ) {
    return null;
  }

  return genericRange;
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
