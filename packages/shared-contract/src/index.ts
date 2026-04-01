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
  /<<-?\s*(?:'(?<single>[^'\n]+)'|"(?<double>[^"]+)"|(?<bare>[A-Za-z_][A-Za-z0-9_-]*))/u;

function isReservedInlineFormatHeredocTerminator(terminator: string): boolean {
  return RESERVED_INLINE_FORMAT_HEREDOC_TERMINATORS.includes(
    terminator as (typeof RESERVED_INLINE_FORMAT_HEREDOC_TERMINATORS)[number],
  );
}

function splitInlineFormatShellSegments(prefix: string): string[] {
  const segments: string[] = [];
  let start = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let index = 0; index < prefix.length; index += 1) {
    const char = prefix[index]!;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (inSingleQuote) {
      if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    const twoCharacterOperator = prefix.slice(index, index + 2);

    if (twoCharacterOperator === "&&" || twoCharacterOperator === "||") {
      segments.push(prefix.slice(start, index).trim());
      start = index + 2;
      index += 1;
      continue;
    }

    if (char === ";" || char === "|") {
      segments.push(prefix.slice(start, index).trim());
      start = index + 1;
    }
  }

  segments.push(prefix.slice(start).trim());
  return segments.filter((segment) => segment.length > 0);
}

function normalizeInlineFormatShellSegment(segment: string): string {
  let normalized = segment.trim();
  let previous = "";

  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized
      .replace(/^\(+\s*/u, "")
      .replace(/^\)+\s*/u, "")
      .replace(/^!\s*/u, "")
      .replace(/^time\s+/u, "")
      .replace(/^(?:then|do|elif)\s+/u, "")
      .trim();
  }

  return normalized;
}

export function extractInlineFormatHeredocOpenerCommand(
  openerLine: string,
): string {
  const match = INLINE_FORMAT_HEREDOC_PATTERN.exec(openerLine);

  if (match === null) {
    return openerLine.trim();
  }

  const prefix = openerLine.slice(0, match.index).trim();

  if (prefix.length === 0) {
    return prefix;
  }

  const segments = splitInlineFormatShellSegments(prefix);
  const lastSegment = segments.at(-1) ?? prefix;

  return normalizeInlineFormatShellSegment(lastSegment);
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
