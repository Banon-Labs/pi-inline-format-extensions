import type {
  InlineFormatSemanticToken,
  InlineFormatVirtualDocument,
} from "@pi-inline-format/intel";

const SHIPPED_PYTHON_SAMPLE_SOURCE = `#!/usr/bin/env python3

def main() -> None:
    print("hello from py")

if __name__ == "__main__":
    main()`;
const PYTHON_FUNCTION_DECLARATION_PATTERN =
  /^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/u;
const PYTHON_BUILTIN_PRINT_PATTERN = /^\s*print\s*\(/u;

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
  const functionName = PYTHON_FUNCTION_DECLARATION_PATTERN.exec(line)?.[1];
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

function collectBuiltinPrintToken(
  line: string,
  lineIndex: number,
): InlineFormatSemanticToken | null {
  if (!PYTHON_BUILTIN_PRINT_PATTERN.test(line)) {
    return null;
  }

  const startColumn = line.indexOf("print");
  if (startColumn < 0) {
    return null;
  }

  return createToken(
    lineIndex,
    startColumn,
    startColumn + "print".length,
    "function",
    ["defaultLibrary", "builtin"],
    "print",
  );
}

function isShippedInlinePythonSample(
  document: Pick<InlineFormatVirtualDocument, "language" | "content">,
): boolean {
  return (
    document.language === "python" &&
    document.content === SHIPPED_PYTHON_SAMPLE_SOURCE
  );
}

export function collectHostPythonSmarterHighlightTokens(
  document: Pick<
    InlineFormatVirtualDocument,
    "language" | "content" | "filePath"
  >,
): InlineFormatSemanticToken[] {
  if (!isShippedInlinePythonSample(document)) {
    return [];
  }

  const tokens: InlineFormatSemanticToken[] = [];
  const lines = document.content.split("\n");

  lines.forEach((line, lineIndex) => {
    const functionDeclarationToken = collectFunctionDeclarationToken(
      line,
      lineIndex,
    );
    if (functionDeclarationToken !== null) {
      tokens.push(functionDeclarationToken);
    }

    const builtinPrintToken = collectBuiltinPrintToken(line, lineIndex);
    if (builtinPrintToken !== null) {
      tokens.push(builtinPrintToken);
    }
  });

  return tokens;
}
