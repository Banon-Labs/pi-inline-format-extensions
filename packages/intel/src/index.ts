import ts from "typescript";

import { bashLanguageServerInspectionBackend } from "./bash-language-server.js";
import { basedPyrightInspectionBackend } from "./basedpyright.js";

import type { InlineFormatMatch } from "@pi-inline-format/shared-contract";

export type InlineFormatInspectionKind =
  | "hover"
  | "explain-symbol"
  | "definition"
  | "document-highlights"
  | "diagnostics"
  | "semantic-tokens";

export interface InlineFormatRegionReference {
  language: string;
  match: InlineFormatMatch;
  command: string;
  source: string;
  filePathHint?: string;
  projectRoot?: string;
}

export interface InlineFormatVirtualDocument {
  id: string;
  language: string;
  content: string;
  filePath: string;
  region: InlineFormatRegionReference;
}

export interface InlineFormatInspectionPosition {
  lineIndex: number;
  columnIndex: number;
}

export interface InlineFormatInspectionRequest {
  kind: InlineFormatInspectionKind;
  document: InlineFormatVirtualDocument;
  position?: InlineFormatInspectionPosition;
  symbolName?: string;
}

export interface InlineFormatInspectionRange {
  start: InlineFormatInspectionPosition;
  end: InlineFormatInspectionPosition;
}

export interface InlineFormatInspectionDiagnostic {
  severity: "info" | "warning" | "error";
  message: string;
  range: InlineFormatInspectionRange;
  source?: string;
  code?: string;
}

export interface InlineFormatSemanticToken {
  range: InlineFormatInspectionRange;
  tokenType: string;
  modifiers: string[];
  text?: string;
}

export interface InlineFormatInspectionResult {
  backendName: string;
  language: string;
  kind: InlineFormatInspectionKind;
  summary: string;
  ranges?: InlineFormatInspectionRange[];
  diagnostics?: InlineFormatInspectionDiagnostic[];
  payload?: Record<string, unknown>;
}

export interface InlineFormatInspectionBackend {
  name: string;
  languages: readonly string[];
  inspect(
    request: InlineFormatInspectionRequest,
  ): Promise<InlineFormatInspectionResult | null>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeInspectionPosition(
  value: unknown,
): InlineFormatInspectionPosition | null {
  if (!isRecord(value)) {
    return null;
  }

  const { lineIndex, columnIndex } = value;
  if (
    typeof lineIndex !== "number" ||
    !Number.isInteger(lineIndex) ||
    typeof columnIndex !== "number" ||
    !Number.isInteger(columnIndex)
  ) {
    return null;
  }

  return {
    lineIndex,
    columnIndex,
  };
}

function normalizeInspectionRange(
  value: unknown,
): InlineFormatInspectionRange | null {
  if (!isRecord(value)) {
    return null;
  }

  const start = normalizeInspectionPosition(value.start);
  const end = normalizeInspectionPosition(value.end);
  if (start === null || end === null) {
    return null;
  }

  return {
    start,
    end,
  };
}

function normalizeInspectionSemanticToken(
  value: unknown,
): InlineFormatSemanticToken | null {
  if (!isRecord(value)) {
    return null;
  }

  const range = normalizeInspectionRange(value.range);
  const { tokenType, modifiers, text } = value;
  if (
    range === null ||
    typeof tokenType !== "string" ||
    !Array.isArray(modifiers) ||
    !modifiers.every((modifier) => typeof modifier === "string")
  ) {
    return null;
  }

  return {
    range,
    tokenType,
    modifiers: [...modifiers],
    ...(typeof text === "string" ? { text } : {}),
  };
}

export function normalizeInlineFormatSemanticTokens(
  result: Pick<InlineFormatInspectionResult, "kind" | "payload">,
): InlineFormatSemanticToken[] {
  if (result.kind !== "semantic-tokens" || !isRecord(result.payload)) {
    return [];
  }

  const { tokens } = result.payload;
  if (!Array.isArray(tokens)) {
    return [];
  }

  const normalizedTokens: InlineFormatSemanticToken[] = [];
  for (const token of tokens) {
    const normalizedToken = normalizeInspectionSemanticToken(token);
    if (normalizedToken === null) {
      return [];
    }

    normalizedTokens.push(normalizedToken);
  }

  return normalizedTokens;
}

export function createInlineFormatVirtualDocument(
  region: InlineFormatRegionReference,
): InlineFormatVirtualDocument {
  return {
    id: `${region.match.pluginName}:${region.match.startLineIndex}-${region.match.endLineIndex}`,
    language: region.language,
    content: region.source,
    filePath:
      region.filePathHint ??
      `/virtual/${region.match.pluginName}.${defaultExtensionForLanguage(region.language)}`,
    region,
  };
}

export function defaultExtensionForLanguage(language: string): string {
  switch (language) {
    case "python":
      return "py";
    case "javascript":
      return "js";
    case "typescript":
      return "ts";
    case "bash":
      return "sh";
    default:
      return "txt";
  }
}

const SCAFFOLD_LANGUAGES = [
  "python",
  "javascript",
  "typescript",
  "bash",
] as const;
const TYPESCRIPT_BACKED_LANGUAGES = ["javascript", "typescript"] as const;

type TypeScriptBackedLanguage = (typeof TYPESCRIPT_BACKED_LANGUAGES)[number];

type TypeScriptInspectionSession = {
  languageService: ts.LanguageService;
  sourceFile: ts.SourceFile;
  fileName: string;
  dispose(): void;
};

function isTypeScriptBackedLanguage(
  language: string,
): language is TypeScriptBackedLanguage {
  return TYPESCRIPT_BACKED_LANGUAGES.includes(
    language as TypeScriptBackedLanguage,
  );
}

function createScaffoldSummary(
  request: InlineFormatInspectionRequest,
  extra: string,
): string {
  return `Prepared virtual ${request.document.language} document ${request.document.filePath} for ${request.kind} inspection. ${extra}`;
}

function escapeSymbolNameForRegex(symbolName: string): string {
  return symbolName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function findTextualSymbolRanges(
  source: string,
  symbolName: string,
): InlineFormatInspectionRange[] {
  const pattern = new RegExp(
    `\\b${escapeSymbolNameForRegex(symbolName)}\\b`,
    "gu",
  );

  return source.split("\n").flatMap((line, lineIndex) =>
    Array.from(line.matchAll(pattern), (match) => {
      const startColumn = match.index ?? 0;
      return {
        start: {
          lineIndex,
          columnIndex: startColumn,
        },
        end: {
          lineIndex,
          columnIndex: startColumn + symbolName.length,
        },
      };
    }),
  );
}

function createCompilerOptions(
  language: TypeScriptBackedLanguage,
): ts.CompilerOptions {
  return {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    allowJs: language === "javascript",
    checkJs: language === "javascript",
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  };
}

function createScriptKind(language: TypeScriptBackedLanguage): ts.ScriptKind {
  return language === "javascript" ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

function createTypeScriptInspectionSession(
  document: InlineFormatVirtualDocument,
): TypeScriptInspectionSession {
  const language = document.language;
  if (!isTypeScriptBackedLanguage(language)) {
    throw new Error(`Unsupported TypeScript-backed language: ${language}`);
  }

  const fileName = document.filePath;
  const scriptVersion = "0";
  const compilerOptions = createCompilerOptions(language);
  const defaultLibFileName = ts.getDefaultLibFilePath(compilerOptions);
  const snapshots = new Map<string, ts.IScriptSnapshot>([
    [fileName, ts.ScriptSnapshot.fromString(document.content)],
  ]);

  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => compilerOptions,
    getCurrentDirectory: () => document.region.projectRoot ?? process.cwd(),
    getDefaultLibFileName: () => defaultLibFileName,
    getScriptFileNames: () => [fileName],
    getScriptKind: (requestedFileName) =>
      requestedFileName === fileName
        ? createScriptKind(language)
        : ts.ScriptKind.Unknown,
    getScriptVersion: (requestedFileName) =>
      requestedFileName === fileName ? scriptVersion : "0",
    getScriptSnapshot: (requestedFileName) => {
      const existingSnapshot = snapshots.get(requestedFileName);
      if (existingSnapshot !== undefined) {
        return existingSnapshot;
      }

      const fileContents = ts.sys.readFile(requestedFileName);
      if (fileContents === undefined) {
        return undefined;
      }

      const snapshot = ts.ScriptSnapshot.fromString(fileContents);
      snapshots.set(requestedFileName, snapshot);
      return snapshot;
    },
    fileExists: (requestedFileName) =>
      requestedFileName === fileName || ts.sys.fileExists(requestedFileName),
    readFile: (requestedFileName) =>
      requestedFileName === fileName
        ? document.content
        : ts.sys.readFile(requestedFileName),
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };

  const languageService = ts.createLanguageService(host);
  const sourceFile =
    languageService.getProgram()?.getSourceFile(fileName) ??
    ts.createSourceFile(
      fileName,
      document.content,
      ts.ScriptTarget.Latest,
      true,
      createScriptKind(language),
    );

  return {
    languageService,
    sourceFile,
    fileName,
    dispose() {
      languageService.dispose();
    },
  };
}

function createRangeFromTextSpan(
  sourceFile: ts.SourceFile,
  textSpan: ts.TextSpan,
): InlineFormatInspectionRange {
  const start = sourceFile.getLineAndCharacterOfPosition(textSpan.start);
  const end = sourceFile.getLineAndCharacterOfPosition(
    textSpan.start + textSpan.length,
  );

  return {
    start: {
      lineIndex: start.line,
      columnIndex: start.character,
    },
    end: {
      lineIndex: end.line,
      columnIndex: end.character,
    },
  };
}

function findIdentifierOffsets(
  sourceFile: ts.SourceFile,
  symbolName: string,
): number[] {
  const offsets: number[] = [];

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && node.text === symbolName) {
      offsets.push(node.getStart(sourceFile));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return offsets;
}

function findFirstIdentifierOffset(sourceFile: ts.SourceFile): number | null {
  let offset: number | null = null;

  function visit(node: ts.Node): void {
    if (offset !== null) {
      return;
    }

    if (ts.isIdentifier(node)) {
      offset = node.getStart(sourceFile);
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return offset;
}

function clampInspectionPosition(
  sourceFile: ts.SourceFile,
  position: InlineFormatInspectionPosition,
): number {
  const lineStarts = sourceFile.getLineStarts();
  if (lineStarts.length === 0) {
    return 0;
  }

  const safeLineIndex = Math.max(
    0,
    Math.min(position.lineIndex, lineStarts.length - 1),
  );
  const lineStart = lineStarts[safeLineIndex] ?? 0;
  const lineEnd =
    safeLineIndex + 1 < lineStarts.length
      ? (lineStarts[safeLineIndex + 1] ?? sourceFile.end) - 1
      : sourceFile.end;
  const safeColumnIndex = Math.max(
    0,
    Math.min(position.columnIndex, Math.max(0, lineEnd - lineStart)),
  );

  return lineStart + safeColumnIndex;
}

function diagnosticCategoryToSeverity(
  category: ts.DiagnosticCategory,
): InlineFormatInspectionDiagnostic["severity"] {
  switch (category) {
    case ts.DiagnosticCategory.Error:
      return "error";
    case ts.DiagnosticCategory.Warning:
      return "warning";
    default:
      return "info";
  }
}

function formatQuickInfoText(
  quickInfo: ts.QuickInfo | undefined,
): string | null {
  if (quickInfo === undefined) {
    return null;
  }

  const displayText = ts.displayPartsToString(quickInfo.displayParts).trim();
  const documentation = ts.displayPartsToString(quickInfo.documentation).trim();

  if (displayText.length > 0 && documentation.length > 0) {
    return `${displayText} — ${documentation}`;
  }

  if (displayText.length > 0) {
    return displayText;
  }

  if (documentation.length > 0) {
    return documentation;
  }

  return null;
}

function countReferenceEntries(
  entries: readonly ts.ReferencedSymbol[] | undefined,
): number {
  if (entries === undefined) {
    return 0;
  }

  return entries.reduce((total, entry) => total + entry.references.length, 0);
}

function createExplainSymbolSummary(
  symbolName: string,
  quickInfoText: string | null,
  referenceCount: number,
): string {
  const referenceSuffix =
    referenceCount > 0
      ? ` Found ${String(referenceCount)} reference(s) via the TypeScript language service.`
      : " No references were reported by the TypeScript language service.";

  if (quickInfoText !== null) {
    return `Explained symbol ${symbolName} via the TypeScript language service. ${quickInfoText}.${referenceSuffix}`;
  }

  return `Explained symbol ${symbolName} via the TypeScript language service.${referenceSuffix}`;
}

function createHoverSummary(quickInfoText: string | null): string {
  if (quickInfoText !== null) {
    return `Resolved hover information via the TypeScript language service. ${quickInfoText}.`;
  }

  return "Resolved hover request via the TypeScript language service, but quick info text was empty.";
}

function createDefinitionSummary(
  symbolName: string | undefined,
  definitionCount: number,
  sameFileDefinitionCount: number,
): string {
  const label = symbolName ?? "the selected symbol";
  if (definitionCount === 0) {
    return `TypeScript language service could not resolve a definition for ${label}.`;
  }

  if (sameFileDefinitionCount === definitionCount) {
    return `Resolved ${String(definitionCount)} definition(s) for ${label} via the TypeScript language service.`;
  }

  return `Resolved ${String(definitionCount)} definition(s) for ${label} via the TypeScript language service; ${String(sameFileDefinitionCount)} map directly into the current virtual document.`;
}

function createDocumentHighlightsSummary(highlightCount: number): string {
  return highlightCount === 0
    ? "TypeScript language service reported no document highlights for the selected symbol."
    : `TypeScript language service reported ${String(highlightCount)} document highlight(s) for the selected symbol.`;
}

const TYPE_SCRIPT_SEMANTIC_TOKEN_TYPE_NAMES = [
  "class",
  "enum",
  "interface",
  "namespace",
  "typeParameter",
  "type",
  "parameter",
  "variable",
  "enumMember",
  "property",
  "function",
  "member",
] as const;
const TYPE_SCRIPT_SEMANTIC_TOKEN_MODIFIER_NAMES = [
  "declaration",
  "static",
  "async",
  "readonly",
  "defaultLibrary",
  "local",
] as const;
const TYPE_SCRIPT_SEMANTIC_TOKEN_TYPE_OFFSET = 8;
const TYPE_SCRIPT_SEMANTIC_TOKEN_MODIFIER_MASK = 0xff;

function decodeTypeScriptSemanticTokenType(
  encodedClassification: number,
): string {
  const tokenTypeIndex =
    (encodedClassification >> TYPE_SCRIPT_SEMANTIC_TOKEN_TYPE_OFFSET) - 1;
  return (
    TYPE_SCRIPT_SEMANTIC_TOKEN_TYPE_NAMES[tokenTypeIndex] ??
    `unknown(${String(tokenTypeIndex)})`
  );
}

function decodeTypeScriptSemanticTokenModifiers(
  encodedClassification: number,
): string[] {
  const modifierMask =
    encodedClassification & TYPE_SCRIPT_SEMANTIC_TOKEN_MODIFIER_MASK;

  return TYPE_SCRIPT_SEMANTIC_TOKEN_MODIFIER_NAMES.flatMap(
    (modifierName, index) =>
      (modifierMask & (1 << index)) !== 0 ? [modifierName] : [],
  );
}

function getSourceTextForRange(
  sourceFile: ts.SourceFile,
  range: InlineFormatInspectionRange,
): string | undefined {
  const start = sourceFile.getPositionOfLineAndCharacter(
    range.start.lineIndex,
    range.start.columnIndex,
  );
  const end = sourceFile.getPositionOfLineAndCharacter(
    range.end.lineIndex,
    range.end.columnIndex,
  );

  if (end <= start) {
    return undefined;
  }

  return sourceFile.text.slice(start, end);
}

function mapEncodedTypeScriptSemanticTokens(
  sourceFile: ts.SourceFile,
  classifications: ts.Classifications,
): InlineFormatSemanticToken[] {
  const result: InlineFormatSemanticToken[] = [];
  const dense = classifications.spans;

  for (let index = 0; index < dense.length; index += 3) {
    const start = dense[index] ?? 0;
    const length = dense[index + 1] ?? 0;
    const encodedClassification = dense[index + 2] ?? 0;

    const range = createRangeFromTextSpan(sourceFile, { start, length });
    const tokenText = getSourceTextForRange(sourceFile, range)?.trim();

    result.push({
      range,
      tokenType: decodeTypeScriptSemanticTokenType(encodedClassification),
      modifiers: decodeTypeScriptSemanticTokenModifiers(encodedClassification),
      ...(tokenText !== undefined && tokenText.length > 0
        ? { text: tokenText }
        : {}),
    });
  }

  return result;
}

function createSemanticTokensSummary(tokenCount: number): string {
  return tokenCount === 0
    ? "TypeScript language service reported no semantic tokens for the current virtual document."
    : `TypeScript language service reported ${String(tokenCount)} semantic token(s) for the current virtual document.`;
}

export function collectInlineFormatSemanticTokens(
  document: InlineFormatVirtualDocument,
): InlineFormatSemanticToken[] {
  if (!isTypeScriptBackedLanguage(document.language)) {
    return [];
  }

  const session = createTypeScriptInspectionSession(document);
  try {
    return mapEncodedTypeScriptSemanticTokens(
      session.sourceFile,
      session.languageService.getEncodedSemanticClassifications(
        session.fileName,
        {
          start: 0,
          length: session.sourceFile.end,
        },
        ts.SemanticClassificationFormat.TwentyTwenty,
      ),
    );
  } finally {
    session.dispose();
  }
}

function collectDiagnostics(
  session: TypeScriptInspectionSession,
): readonly ts.Diagnostic[] {
  return [
    ...session.languageService.getSyntacticDiagnostics(session.fileName),
    ...session.languageService.getSemanticDiagnostics(session.fileName),
  ];
}

function mapDiagnostics(
  diagnostics: readonly ts.Diagnostic[],
  sourceFile: ts.SourceFile,
): InlineFormatInspectionDiagnostic[] {
  return diagnostics.map((diagnostic) => {
    const start = diagnostic.start ?? 0;
    const length = diagnostic.length ?? 0;

    return {
      severity: diagnosticCategoryToSeverity(diagnostic.category),
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      range: createRangeFromTextSpan(sourceFile, {
        start,
        length,
      }),
      ...(diagnostic.source !== undefined ? { source: diagnostic.source } : {}),
      code: String(diagnostic.code),
    };
  });
}

function resolveInspectionOffset(
  request: InlineFormatInspectionRequest,
  session: TypeScriptInspectionSession,
): number | null {
  if (request.position !== undefined) {
    return clampInspectionPosition(session.sourceFile, request.position);
  }

  if (
    request.symbolName !== undefined &&
    request.symbolName.trim().length > 0
  ) {
    const symbolOffsets = findIdentifierOffsets(
      session.sourceFile,
      request.symbolName.trim(),
    );
    return symbolOffsets[0] ?? null;
  }

  return findFirstIdentifierOffset(session.sourceFile);
}

export const inlineFormatInspectionScaffoldBackend: InlineFormatInspectionBackend =
  {
    name: "inline-format-intel-scaffold",
    languages: [...SCAFFOLD_LANGUAGES],
    async inspect(request) {
      if (request.kind === "explain-symbol") {
        const symbolName = request.symbolName?.trim();
        if (symbolName === undefined || symbolName.length === 0) {
          return {
            backendName: this.name,
            language: request.document.language,
            kind: request.kind,
            summary: createScaffoldSummary(
              request,
              "No symbol name was provided.",
            ),
          };
        }

        const textualRanges = findTextualSymbolRanges(
          request.document.content,
          symbolName,
        );

        return {
          backendName: this.name,
          language: request.document.language,
          kind: request.kind,
          summary:
            textualRanges.length === 0
              ? createScaffoldSummary(
                  request,
                  `Symbol ${symbolName} does not appear textually in the current virtual document.`,
                )
              : createScaffoldSummary(
                  request,
                  `Symbol ${symbolName} appears ${String(textualRanges.length)} time(s) textually. A real compiler/LSP backend is not wired for this language yet, so this remains a scaffolding-level explanation only.`,
                ),
          ranges: textualRanges,
          payload: {
            symbolName,
            textualOccurrenceCount: textualRanges.length,
          },
        };
      }

      if (request.kind === "diagnostics") {
        return {
          backendName: this.name,
          language: request.document.language,
          kind: request.kind,
          summary: createScaffoldSummary(
            request,
            "No compiler/LSP backend is configured for this language yet, so diagnostics are unavailable in the scaffold backend.",
          ),
          diagnostics: [],
        };
      }

      if (request.kind === "definition") {
        const symbolName = request.symbolName?.trim();
        const textualRanges =
          symbolName === undefined || symbolName.length === 0
            ? []
            : findTextualSymbolRanges(request.document.content, symbolName);

        return {
          backendName: this.name,
          language: request.document.language,
          kind: request.kind,
          summary: createScaffoldSummary(
            request,
            symbolName === undefined || symbolName.length === 0
              ? "Definition lookup needs a symbol name or position, but no real backend is configured for this language yet."
              : `Definition lookup for ${symbolName} remains scaffold-only for this language. Textual occurrences: ${String(textualRanges.length)}.`,
          ),
          ...(textualRanges.length > 0 ? { ranges: textualRanges } : {}),
          ...(symbolName !== undefined && symbolName.length > 0
            ? {
                payload: {
                  symbolName,
                  textualOccurrenceCount: textualRanges.length,
                },
              }
            : {}),
        };
      }

      if (request.kind === "document-highlights") {
        const symbolName = request.symbolName?.trim();
        const textualRanges =
          symbolName === undefined || symbolName.length === 0
            ? []
            : findTextualSymbolRanges(request.document.content, symbolName);

        return {
          backendName: this.name,
          language: request.document.language,
          kind: request.kind,
          summary: createScaffoldSummary(
            request,
            symbolName === undefined || symbolName.length === 0
              ? "Document highlights need a symbol name or position, but no real backend is configured for this language yet."
              : `Document highlights for ${symbolName} remain scaffold-only for this language. Textual occurrences: ${String(textualRanges.length)}.`,
          ),
          ...(textualRanges.length > 0 ? { ranges: textualRanges } : {}),
          ...(symbolName !== undefined && symbolName.length > 0
            ? {
                payload: {
                  symbolName,
                  highlightCount: textualRanges.length,
                },
              }
            : {}),
        };
      }

      if (request.kind === "semantic-tokens") {
        return {
          backendName: this.name,
          language: request.document.language,
          kind: request.kind,
          summary: createScaffoldSummary(
            request,
            "Semantic tokens will require a real backend; this scaffold only proves the request/document plumbing.",
          ),
        };
      }

      return {
        backendName: this.name,
        language: request.document.language,
        kind: request.kind,
        summary: createScaffoldSummary(
          request,
          "No semantic backend is configured for this language yet, but the host can materialize a virtual document and route an inspection request through the intel contract.",
        ),
        payload: {
          filePath: request.document.filePath,
          sourceLineCount: request.document.content.split("\n").length,
        },
      };
    },
  };

export const typescriptLanguageServiceInspectionBackend: InlineFormatInspectionBackend =
  {
    name: "inline-format-typescript-language-service",
    languages: [...TYPESCRIPT_BACKED_LANGUAGES],
    async inspect(request) {
      if (!isTypeScriptBackedLanguage(request.document.language)) {
        return null;
      }

      const session = createTypeScriptInspectionSession(request.document);
      try {
        if (request.kind === "diagnostics") {
          const diagnostics = mapDiagnostics(
            collectDiagnostics(session),
            session.sourceFile,
          );

          return {
            backendName: this.name,
            language: request.document.language,
            kind: request.kind,
            summary:
              diagnostics.length === 0
                ? "TypeScript language service reported no syntactic or semantic diagnostics for the current virtual document."
                : `TypeScript language service reported ${String(diagnostics.length)} diagnostic(s) for the current virtual document.`,
            diagnostics,
            payload: {
              diagnosticCount: diagnostics.length,
            },
          };
        }

        if (request.kind === "semantic-tokens") {
          const semanticTokens = mapEncodedTypeScriptSemanticTokens(
            session.sourceFile,
            session.languageService.getEncodedSemanticClassifications(
              session.fileName,
              {
                start: 0,
                length: session.sourceFile.end,
              },
              ts.SemanticClassificationFormat.TwentyTwenty,
            ),
          );

          return {
            backendName: this.name,
            language: request.document.language,
            kind: request.kind,
            summary: createSemanticTokensSummary(semanticTokens.length),
            ...(semanticTokens.length > 0
              ? { ranges: semanticTokens.map((token) => token.range) }
              : {}),
            payload: {
              tokenCount: semanticTokens.length,
              tokens: semanticTokens,
            },
          };
        }

        const targetOffset = resolveInspectionOffset(request, session);
        if (targetOffset === null) {
          return {
            backendName: this.name,
            language: request.document.language,
            kind: request.kind,
            summary:
              request.kind === "explain-symbol"
                ? `TypeScript language service backend could not locate symbol ${request.symbolName ?? "<unknown>"} in the current virtual document.`
                : "TypeScript language service backend could not locate a suitable symbol in the current virtual document.",
          };
        }

        const quickInfo = session.languageService.getQuickInfoAtPosition(
          session.fileName,
          targetOffset,
        );
        const quickInfoText = formatQuickInfoText(quickInfo);
        const quickInfoRange =
          quickInfo !== undefined
            ? createRangeFromTextSpan(session.sourceFile, quickInfo.textSpan)
            : undefined;

        if (request.kind === "definition") {
          const symbolName = request.symbolName?.trim();
          const definitionInfo =
            session.languageService.getDefinitionAndBoundSpan(
              session.fileName,
              targetOffset,
            );
          const definitions = definitionInfo?.definitions ?? [];
          const boundRange =
            definitionInfo !== undefined
              ? createRangeFromTextSpan(
                  session.sourceFile,
                  definitionInfo.textSpan,
                )
              : undefined;
          const sameFileDefinitionRanges = definitions
            .filter((definition) => definition.fileName === session.fileName)
            .map((definition) =>
              createRangeFromTextSpan(session.sourceFile, definition.textSpan),
            );

          return {
            backendName: this.name,
            language: request.document.language,
            kind: request.kind,
            summary: createDefinitionSummary(
              symbolName,
              definitions.length,
              sameFileDefinitionRanges.length,
            ),
            ...(sameFileDefinitionRanges.length > 0
              ? { ranges: sameFileDefinitionRanges }
              : {}),
            payload: {
              ...(symbolName !== undefined && symbolName.length > 0
                ? { symbolName }
                : {}),
              definitionCount: definitions.length,
              sameFileDefinitionCount: sameFileDefinitionRanges.length,
              ...(boundRange !== undefined ? { boundSpan: boundRange } : {}),
              definitionFiles: [
                ...new Set(
                  definitions.map((definition) => definition.fileName),
                ),
              ],
              quickInfo: quickInfoText,
            },
          };
        }

        if (request.kind === "document-highlights") {
          const symbolName = request.symbolName?.trim();
          const highlights =
            session.languageService.getDocumentHighlights(
              session.fileName,
              targetOffset,
              [session.fileName],
            ) ?? [];
          const ranges = highlights.flatMap((documentHighlight) =>
            documentHighlight.fileName === session.fileName
              ? documentHighlight.highlightSpans.map((highlightSpan) =>
                  createRangeFromTextSpan(
                    session.sourceFile,
                    highlightSpan.textSpan,
                  ),
                )
              : [],
          );

          return {
            backendName: this.name,
            language: request.document.language,
            kind: request.kind,
            summary: createDocumentHighlightsSummary(ranges.length),
            ...(ranges.length > 0 ? { ranges } : {}),
            payload: {
              ...(symbolName !== undefined && symbolName.length > 0
                ? { symbolName }
                : {}),
              highlightCount: ranges.length,
              quickInfo: quickInfoText,
            },
          };
        }

        if (request.kind === "explain-symbol") {
          const symbolName = request.symbolName?.trim();
          if (symbolName === undefined || symbolName.length === 0) {
            return {
              backendName: this.name,
              language: request.document.language,
              kind: request.kind,
              summary:
                "TypeScript language service backend requires a symbol name for explain-symbol requests.",
            };
          }

          const symbolOffsets = findIdentifierOffsets(
            session.sourceFile,
            symbolName,
          );
          const referenceGroups = session.languageService.findReferences(
            session.fileName,
            symbolOffsets[0] ?? targetOffset,
          );
          const ranges = symbolOffsets.map((offset) =>
            createRangeFromTextSpan(session.sourceFile, {
              start: offset,
              length: symbolName.length,
            }),
          );

          return {
            backendName: this.name,
            language: request.document.language,
            kind: request.kind,
            summary: createExplainSymbolSummary(
              symbolName,
              quickInfoText,
              countReferenceEntries(referenceGroups),
            ),
            ...(ranges.length > 0 ? { ranges } : {}),
            payload: {
              symbolName,
              quickInfo: quickInfoText,
              referenceCount: countReferenceEntries(referenceGroups),
            },
          };
        }

        return {
          backendName: this.name,
          language: request.document.language,
          kind: request.kind,
          summary: createHoverSummary(quickInfoText),
          ...(quickInfoRange !== undefined ? { ranges: [quickInfoRange] } : {}),
          payload: {
            quickInfo: quickInfoText,
            filePath: request.document.filePath,
          },
        };
      } finally {
        session.dispose();
      }
    },
  };

export const defaultInlineFormatInspectionBackends: readonly InlineFormatInspectionBackend[] =
  [
    typescriptLanguageServiceInspectionBackend,
    basedPyrightInspectionBackend,
    bashLanguageServerInspectionBackend,
    inlineFormatInspectionScaffoldBackend,
  ];

export function resolveInlineFormatInspectionBackend(
  language: string,
  backends: readonly InlineFormatInspectionBackend[] = defaultInlineFormatInspectionBackends,
): InlineFormatInspectionBackend {
  return (
    backends.find((backend) => backend.languages.includes(language)) ??
    inlineFormatInspectionScaffoldBackend
  );
}

export async function inspectInlineFormatDocument(
  document: InlineFormatVirtualDocument,
  kind: InlineFormatInspectionKind,
  options: {
    position?: InlineFormatInspectionPosition;
    symbolName?: string;
    backends?: readonly InlineFormatInspectionBackend[];
  } = {},
): Promise<InlineFormatInspectionResult | null> {
  const backend = resolveInlineFormatInspectionBackend(
    document.language,
    options.backends,
  );

  return await backend.inspect({
    kind,
    document,
    ...(options.position !== undefined ? { position: options.position } : {}),
    ...(options.symbolName !== undefined
      ? { symbolName: options.symbolName }
      : {}),
  });
}
