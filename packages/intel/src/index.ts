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
