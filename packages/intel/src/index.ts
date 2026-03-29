import ts from "typescript";

import type { InlineFormatMatch } from "@pi-inline-format/shared-contract";

export type InlineFormatInspectionKind =
  | "hover"
  | "explain-symbol"
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
          return {
            backendName: this.name,
            language: request.document.language,
            kind: request.kind,
            summary:
              "Semantic token rendering is not exposed yet, but the TypeScript language service backend is active for hover/explain/diagnostics.",
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
