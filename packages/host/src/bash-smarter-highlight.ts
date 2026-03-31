import type { InlineFormatSemanticToken } from "@pi-inline-format/intel";

const FUNCTION_DECLARATION_PATTERN =
  /^\s*(?:function\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(\)\s*\{/u;
const LEADING_ASSIGNMENT_PATTERN = /^\s*([A-Za-z_][A-Za-z0-9_]*)=/u;
const QUALIFIED_LEADING_ASSIGNMENT_PATTERN =
  /^\s*(?:local|export|readonly|declare|typeset)\s+([A-Za-z_][A-Za-z0-9_]*)=/u;
const LEADING_COMMAND_PATTERN =
  /^\s*(?:(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+))\s+)*(?:builtin\s+|command\s+)?([A-Za-z_][A-Za-z0-9_-]*)/u;
const VARIABLE_EXPANSION_PATTERN =
  /\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/gu;

const BASH_BUILTIN_COMMANDS = new Set([
  ".",
  ":",
  "alias",
  "builtin",
  "cd",
  "command",
  "declare",
  "echo",
  "eval",
  "exec",
  "exit",
  "export",
  "false",
  "help",
  "local",
  "printf",
  "pwd",
  "read",
  "readonly",
  "return",
  "set",
  "shift",
  "source",
  "test",
  "times",
  "trap",
  "true",
  "type",
  "typeset",
  "ulimit",
  "unalias",
  "unset",
  "wait",
]);

const BASH_CONTROL_KEYWORDS = new Set([
  "case",
  "coproc",
  "do",
  "done",
  "elif",
  "else",
  "esac",
  "fi",
  "for",
  "function",
  "if",
  "in",
  "select",
  "then",
  "time",
  "until",
  "while",
]);

function createToken(
  lineIndex: number,
  startColumn: number,
  endColumn: number,
  tokenType: InlineFormatSemanticToken["tokenType"],
  modifiers: readonly string[],
  text: string,
): InlineFormatSemanticToken {
  return {
    range: {
      start: {
        lineIndex,
        columnIndex: startColumn,
      },
      end: {
        lineIndex,
        columnIndex: endColumn,
      },
    },
    tokenType,
    modifiers: [...modifiers],
    text,
  };
}

function collectFunctionDeclarationToken(
  line: string,
  lineIndex: number,
): InlineFormatSemanticToken | null {
  const match = FUNCTION_DECLARATION_PATTERN.exec(line);
  const functionName = match?.[1];
  if (functionName === undefined) {
    return null;
  }

  const startColumn = line.indexOf(functionName);
  if (startColumn < 0) {
    return null;
  }

  return createToken(
    lineIndex,
    startColumn,
    startColumn + functionName.length,
    "function",
    ["declaration"],
    functionName,
  );
}

function collectLeadingVariableDeclarationToken(
  line: string,
  lineIndex: number,
): InlineFormatSemanticToken | null {
  const directAssignment = LEADING_ASSIGNMENT_PATTERN.exec(line)?.[1];
  const qualifiedAssignment =
    QUALIFIED_LEADING_ASSIGNMENT_PATTERN.exec(line)?.[1];
  const variableName = directAssignment ?? qualifiedAssignment;
  if (variableName === undefined) {
    return null;
  }

  const startColumn = line.indexOf(variableName);
  if (startColumn < 0) {
    return null;
  }

  return createToken(
    lineIndex,
    startColumn,
    startColumn + variableName.length,
    "variable",
    ["declaration"],
    variableName,
  );
}

function collectLeadingCommandToken(
  line: string,
  lineIndex: number,
  declaredFunctions: ReadonlySet<string>,
  declarationLineIndexes: ReadonlySet<number>,
): InlineFormatSemanticToken | null {
  if (declarationLineIndexes.has(lineIndex)) {
    return null;
  }

  const match = LEADING_COMMAND_PATTERN.exec(line);
  if (match === null) {
    return null;
  }

  const commandName = match[1];
  if (commandName === undefined || BASH_CONTROL_KEYWORDS.has(commandName)) {
    return null;
  }

  const matchText = match[0] ?? commandName;
  const startColumn = (match.index ?? 0) + matchText.lastIndexOf(commandName);
  if (startColumn < 0) {
    return null;
  }

  const modifiers = BASH_BUILTIN_COMMANDS.has(commandName)
    ? ["defaultLibrary"]
    : declaredFunctions.has(commandName)
      ? []
      : [];

  return createToken(
    lineIndex,
    startColumn,
    startColumn + commandName.length,
    "function",
    modifiers,
    commandName,
  );
}

function collectVariableExpansionTokens(
  line: string,
  lineIndex: number,
): InlineFormatSemanticToken[] {
  const tokens: InlineFormatSemanticToken[] = [];

  for (const match of line.matchAll(VARIABLE_EXPANSION_PATTERN)) {
    const startIndex = match.index;
    if (startIndex === undefined) {
      continue;
    }

    const variableName = match[1] ?? match[2];
    if (variableName === undefined) {
      continue;
    }

    const offset = match[1] !== undefined ? 2 : 1;
    const startColumn = startIndex + offset;
    tokens.push(
      createToken(
        lineIndex,
        startColumn,
        startColumn + variableName.length,
        "variable",
        [],
        variableName,
      ),
    );
  }

  return tokens;
}

export function collectHostBashSmarterHighlightTokens(
  source: string,
): InlineFormatSemanticToken[] {
  const lines = source.split("\n");
  const tokens: InlineFormatSemanticToken[] = [];
  const declaredFunctions = new Set<string>();
  const declarationLineIndexes = new Set<number>();

  lines.forEach((line, lineIndex) => {
    const declarationToken = collectFunctionDeclarationToken(line, lineIndex);
    if (declarationToken === null) {
      return;
    }

    declaredFunctions.add(declarationToken.text ?? "");
    declarationLineIndexes.add(lineIndex);
    tokens.push(declarationToken);
  });

  lines.forEach((line, lineIndex) => {
    const variableDeclarationToken = collectLeadingVariableDeclarationToken(
      line,
      lineIndex,
    );
    if (variableDeclarationToken !== null) {
      tokens.push(variableDeclarationToken);
    }

    const commandToken = collectLeadingCommandToken(
      line,
      lineIndex,
      declaredFunctions,
      declarationLineIndexes,
    );
    if (commandToken !== null) {
      tokens.push(commandToken);
    }

    tokens.push(...collectVariableExpansionTokens(line, lineIndex));
  });

  return tokens.sort(
    (left, right) =>
      left.range.start.lineIndex - right.range.start.lineIndex ||
      left.range.start.columnIndex - right.range.start.columnIndex ||
      left.range.end.columnIndex - right.range.end.columnIndex,
  );
}
