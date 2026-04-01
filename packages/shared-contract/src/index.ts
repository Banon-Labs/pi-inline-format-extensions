export interface InlineFormatMatch {
  pluginName: string;
  language: string;
  startLineIndex: number;
  endLineIndex: number;
}

export interface InlineFormatPlugin {
  name: string;
  language: string;
  detect(command: string): InlineFormatMatch | null;
}

export interface InlineFormatHeredocRange {
  startLineIndex: number;
  endLineIndex: number;
  openerLine: string;
  terminator: string;
}

export const RESERVED_INLINE_FORMAT_HEREDOC_TERMINATORS = [
  "TS",
  "JS",
  "PY",
  "SH",
] as const;

const INLINE_FORMAT_HEREDOC_PATTERN =
  /<<-?\s*(?:'(?<single>[^'\n]+)'|"(?<double>[^"\n]+)"|(?<bare>[A-Za-z_][A-Za-z0-9_-]*))/u;

function isReservedInlineFormatHeredocTerminator(terminator: string): boolean {
  return RESERVED_INLINE_FORMAT_HEREDOC_TERMINATORS.includes(
    terminator as (typeof RESERVED_INLINE_FORMAT_HEREDOC_TERMINATORS)[number],
  );
}

export function findInlineFormatHeredocRange(
  command: string,
  options: {
    terminator?: string;
    allowReservedTerminator?: boolean;
  } = {},
): InlineFormatHeredocRange | null {
  const lines = command.split("\n");
  const startLineIndex = lines.findIndex((line) =>
    INLINE_FORMAT_HEREDOC_PATTERN.test(line),
  );

  if (startLineIndex === -1) {
    return null;
  }

  const openerLine = lines[startLineIndex]!;
  const match = INLINE_FORMAT_HEREDOC_PATTERN.exec(openerLine);
  const terminator =
    match?.groups?.single ?? match?.groups?.double ?? match?.groups?.bare;

  if (terminator === undefined) {
    return null;
  }

  if (options.terminator !== undefined && terminator !== options.terminator) {
    return null;
  }

  if (
    options.terminator === undefined &&
    !options.allowReservedTerminator &&
    isReservedInlineFormatHeredocTerminator(terminator)
  ) {
    return null;
  }

  const endLineIndex = lines.findIndex(
    (line, index) => index > startLineIndex && line === terminator,
  );

  if (endLineIndex <= startLineIndex + 1) {
    return null;
  }

  return {
    startLineIndex,
    endLineIndex,
    openerLine,
    terminator,
  };
}
