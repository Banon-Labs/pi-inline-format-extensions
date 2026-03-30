import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  InlineFormatInspectionBackend,
  InlineFormatInspectionDiagnostic,
  InlineFormatInspectionPosition,
  InlineFormatInspectionRange,
  InlineFormatInspectionRequest,
  InlineFormatInspectionResult,
} from "./index.js";

type JsonRpcResponse = {
  id?: number;
  result?: unknown;
  error?: {
    message?: string;
  };
};

type JsonRpcNotification = {
  method?: string;
  params?: unknown;
};

type LspPosition = {
  line: number;
  character: number;
};

type LspRange = {
  start: LspPosition;
  end: LspPosition;
};

type LspLocation = {
  uri: string;
  range: LspRange;
};

type LspLocationLink = {
  targetUri: string;
  targetRange: LspRange;
  targetSelectionRange: LspRange;
};

type LspDocumentHighlight = {
  range: LspRange;
};

type NotificationWaiter = {
  method: string;
  predicate: (params: unknown) => boolean;
  resolve: (params: unknown) => void;
  reject: (error: Error) => void;
};

type ShellCheckJson = {
  comments?: Array<{
    file?: string;
    line?: number;
    endLine?: number;
    column?: number;
    endColumn?: number;
    level?: string;
    code?: number;
    message?: string;
  }>;
};

const BASH_LANGUAGE = "bash";
const BASH_BACKEND_NAME = "inline-format-bash-language-server";
const LSP_TIMEOUT_MS = 8000;

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

function findFirstIdentifierPosition(
  source: string,
): InlineFormatInspectionPosition | null {
  const lines = source.split("\n");
  const identifierPattern = /[A-Za-z_][A-Za-z0-9_]*/u;

  for (const [lineIndex, line] of lines.entries()) {
    const match = identifierPattern.exec(line);
    if (match?.index !== undefined) {
      return {
        lineIndex,
        columnIndex: match.index,
      };
    }
  }

  return null;
}

function findIdentifierRangeAtPosition(
  source: string,
  position: InlineFormatInspectionPosition,
): InlineFormatInspectionRange | undefined {
  const line = source.split("\n")[position.lineIndex];
  if (line === undefined) {
    return undefined;
  }

  const identifierPattern = /[A-Za-z_][A-Za-z0-9_]*/gu;
  for (const match of line.matchAll(identifierPattern)) {
    const startColumn = match.index;
    if (startColumn === undefined) {
      continue;
    }

    const endColumn = startColumn + match[0].length;
    if (
      position.columnIndex < startColumn ||
      position.columnIndex >= endColumn
    ) {
      continue;
    }

    return {
      start: {
        lineIndex: position.lineIndex,
        columnIndex: startColumn,
      },
      end: {
        lineIndex: position.lineIndex,
        columnIndex: endColumn,
      },
    };
  }

  return undefined;
}

function resolveBashInspectionPosition(
  request: InlineFormatInspectionRequest,
): InlineFormatInspectionPosition | null {
  if (request.position !== undefined) {
    return request.position;
  }

  const symbolName = request.symbolName?.trim();
  if (symbolName !== undefined && symbolName.length > 0) {
    const symbolRanges = findTextualSymbolRanges(
      request.document.content,
      symbolName,
    );
    return symbolRanges[0]?.start ?? null;
  }

  return findFirstIdentifierPosition(request.document.content);
}

function toLspPosition(position: InlineFormatInspectionPosition): LspPosition {
  return {
    line: position.lineIndex,
    character: position.columnIndex,
  };
}

function fromLspRange(range: LspRange): InlineFormatInspectionRange {
  return {
    start: {
      lineIndex: range.start.line,
      columnIndex: range.start.character,
    },
    end: {
      lineIndex: range.end.line,
      columnIndex: range.end.character,
    },
  };
}

function shellCheckSeverityToInspection(
  severity: string | undefined,
): InlineFormatInspectionDiagnostic["severity"] {
  switch (severity) {
    case "error":
      return "error";
    case "warning":
      return "warning";
    default:
      return "info";
  }
}

function normalizeHoverText(contents: unknown): string | null {
  if (typeof contents === "string") {
    return contents.trim() || null;
  }

  if (
    typeof contents === "object" &&
    contents !== null &&
    "value" in contents &&
    typeof contents.value === "string"
  ) {
    return contents.value.trim() || null;
  }

  if (Array.isArray(contents)) {
    const parts = contents
      .map((entry) => normalizeHoverText(entry))
      .filter((entry): entry is string => entry !== null);
    return parts.length > 0 ? parts.join("\n") : null;
  }

  return null;
}

function normalizeLocations(result: unknown): LspLocation[] {
  if (!Array.isArray(result)) {
    return [];
  }

  return result.flatMap((entry) => {
    if (
      typeof entry === "object" &&
      entry !== null &&
      "uri" in entry &&
      "range" in entry
    ) {
      const uri = typeof entry.uri === "string" ? entry.uri : undefined;
      const range = entry.range as LspRange | undefined;
      return uri !== undefined && range !== undefined ? [{ uri, range }] : [];
    }

    if (
      typeof entry === "object" &&
      entry !== null &&
      "targetUri" in entry &&
      ("targetSelectionRange" in entry || "targetRange" in entry)
    ) {
      const link = entry as LspLocationLink;
      return [
        {
          uri: link.targetUri,
          range: link.targetSelectionRange ?? link.targetRange,
        },
      ];
    }

    return [];
  });
}

class JsonRpcStdioClient {
  private readonly process = spawn("bash-language-server", ["start"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  private readonly pendingRequests = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private readonly notificationWaiters: NotificationWaiter[] = [];
  private readonly stderrChunks: string[] = [];
  private stdoutBuffer = Buffer.alloc(0);
  private nextRequestId = 0;

  constructor() {
    this.process.stdout.on("data", (chunk: Buffer) => {
      this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
      this.processStdoutBuffer();
    });

    this.process.stderr.on("data", (chunk: Buffer) => {
      this.stderrChunks.push(chunk.toString("utf8"));
    });

    this.process.on("exit", (code, signal) => {
      const error = new Error(
        `bash-language-server exited before the request completed (code=${String(code)} signal=${String(signal)} stderr=${this.stderrChunks.join("")}).`,
      );
      for (const pending of this.pendingRequests.values()) {
        pending.reject(error);
      }
      this.pendingRequests.clear();
      while (this.notificationWaiters.length > 0) {
        this.notificationWaiters.shift()?.reject(error);
      }
    });
  }

  dispose(): void {
    this.process.kill();
  }

  async request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextRequestId++;
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
    });

    this.writeMessage({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    return await withTimeout(
      promise,
      LSP_TIMEOUT_MS,
      `Timed out waiting for ${method} response from bash-language-server.`,
    );
  }

  notify(method: string, params: unknown): void {
    this.writeMessage({
      jsonrpc: "2.0",
      method,
      params,
    });
  }

  async waitForNotification(
    method: string,
    predicate: (params: unknown) => boolean,
  ): Promise<unknown> {
    const promise = new Promise<unknown>((resolve, reject) => {
      this.notificationWaiters.push({
        method,
        predicate,
        resolve,
        reject,
      });
    });

    return await withTimeout(
      promise,
      LSP_TIMEOUT_MS,
      `Timed out waiting for ${method} notification from bash-language-server.`,
    );
  }

  private processStdoutBuffer(): void {
    const separator = Buffer.from("\r\n\r\n", "utf8");

    while (true) {
      const headerEnd = this.stdoutBuffer.indexOf(separator);
      if (headerEnd === -1) {
        return;
      }

      const headerText = this.stdoutBuffer.slice(0, headerEnd).toString("utf8");
      const contentLengthMatch = /Content-Length:\s*(\d+)/iu.exec(headerText);
      if (contentLengthMatch?.[1] === undefined) {
        throw new Error(
          `Invalid LSP header from bash-language-server: ${headerText}`,
        );
      }

      const contentLength = Number(contentLengthMatch[1]);
      const messageStart = headerEnd + separator.length;
      const messageEnd = messageStart + contentLength;
      if (this.stdoutBuffer.length < messageEnd) {
        return;
      }

      const messageText = this.stdoutBuffer
        .slice(messageStart, messageEnd)
        .toString("utf8");
      this.stdoutBuffer = this.stdoutBuffer.slice(messageEnd);
      this.dispatchMessage(
        JSON.parse(messageText) as JsonRpcResponse & JsonRpcNotification,
      );
    }
  }

  private dispatchMessage(
    message: JsonRpcResponse & JsonRpcNotification,
  ): void {
    if (typeof message.id === "number") {
      const pending = this.pendingRequests.get(message.id);
      if (pending === undefined) {
        return;
      }

      this.pendingRequests.delete(message.id);
      if (message.error !== undefined) {
        pending.reject(
          new Error(message.error.message ?? "Unknown LSP error."),
        );
        return;
      }

      pending.resolve(message.result);
      return;
    }

    if (message.method === undefined) {
      return;
    }

    const waiterIndex = this.notificationWaiters.findIndex(
      (waiter) =>
        waiter.method === message.method && waiter.predicate(message.params),
    );
    if (waiterIndex === -1) {
      return;
    }

    const [waiter] = this.notificationWaiters.splice(waiterIndex, 1);
    waiter?.resolve(message.params);
  }

  private writeMessage(message: Record<string, unknown>): void {
    const body = Buffer.from(JSON.stringify(message), "utf8");
    const header = Buffer.from(
      `Content-Length: ${String(body.length)}\r\n\r\n`,
      "utf8",
    );
    this.process.stdin.write(Buffer.concat([header, body]));
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

function runShellCheckDiagnostics(
  filePath: string,
): InlineFormatInspectionDiagnostic[] {
  const result = spawnSync("shellcheck", ["--format", "json1", filePath], {
    encoding: "utf8",
  });

  if (result.error !== undefined) {
    throw result.error;
  }

  const payloadText = result.stdout.trim();
  if (payloadText.length === 0) {
    return [];
  }

  const payload = JSON.parse(payloadText) as ShellCheckJson;
  const comments = payload.comments ?? [];

  return comments.map((comment) => ({
    severity: shellCheckSeverityToInspection(comment.level),
    message: comment.message ?? "ShellCheck diagnostic",
    range: {
      start: {
        lineIndex: Math.max(0, (comment.line ?? 1) - 1),
        columnIndex: Math.max(0, (comment.column ?? 1) - 1),
      },
      end: {
        lineIndex: Math.max(0, (comment.endLine ?? comment.line ?? 1) - 1),
        columnIndex: Math.max(
          0,
          (comment.endColumn ?? comment.column ?? 1) - 1,
        ),
      },
    },
    source: "shellcheck",
    ...(comment.code !== undefined ? { code: String(comment.code) } : {}),
  }));
}

async function withBashLanguageServerSession<T>(
  request: InlineFormatInspectionRequest,
  callback: (context: {
    client: JsonRpcStdioClient;
    filePath: string;
    fileUri: string;
  }) => Promise<T>,
): Promise<T> {
  const tempDir = mkdtempSync(
    path.join(tmpdir(), "pi-inline-format-bash-language-server-"),
  );
  const filePath = path.join(
    tempDir,
    path.basename(request.document.filePath) || "inline-snippet.sh",
  );
  const fileUri = pathToFileURL(filePath).toString();
  writeFileSync(filePath, request.document.content, "utf8");

  const client = new JsonRpcStdioClient();
  try {
    await client.request("initialize", {
      processId: process.pid,
      clientInfo: {
        name: "pi-inline-format-intel",
      },
      rootUri: pathToFileURL(
        request.document.region.projectRoot ?? tempDir,
      ).toString(),
      capabilities: {},
      workspaceFolders: [
        {
          uri: pathToFileURL(
            request.document.region.projectRoot ?? tempDir,
          ).toString(),
          name: path.basename(request.document.region.projectRoot ?? tempDir),
        },
      ],
    });
    client.notify("initialized", {});
    client.notify("textDocument/didOpen", {
      textDocument: {
        uri: fileUri,
        languageId: "sh",
        version: 1,
        text: request.document.content,
      },
    });

    return await callback({
      client,
      filePath,
      fileUri,
    });
  } finally {
    client.dispose();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function createDefinitionSummary(
  symbolName: string | undefined,
  definitionCount: number,
  sameFileDefinitionCount: number,
): string {
  const label = symbolName ?? "the selected symbol";
  if (definitionCount === 0) {
    return `Bash language server could not resolve a definition for ${label}.`;
  }

  if (sameFileDefinitionCount === definitionCount) {
    return `Bash language server resolved ${String(definitionCount)} definition(s) for ${label}.`;
  }

  return `Bash language server resolved ${String(definitionCount)} definition(s) for ${label}; ${String(sameFileDefinitionCount)} map directly into the current virtual document.`;
}

function createHoverSummary(hoverText: string | null): string {
  if (hoverText !== null) {
    return `Resolved hover information via bash-language-server. ${hoverText}`;
  }

  return "Resolved hover request via bash-language-server, but hover text was empty.";
}

function createDocumentHighlightsSummary(highlightCount: number): string {
  return highlightCount === 0
    ? "Bash language server reported no document highlights for the selected symbol."
    : `Bash language server reported ${String(highlightCount)} document highlight(s) for the selected symbol.`;
}

function createDiagnosticsSummary(count: number): string {
  return count === 0
    ? "ShellCheck reported no diagnostics for the current virtual document."
    : `ShellCheck reported ${String(count)} diagnostic(s) for the current virtual document.`;
}

export const bashLanguageServerInspectionBackend: InlineFormatInspectionBackend =
  {
    name: BASH_BACKEND_NAME,
    languages: [BASH_LANGUAGE],
    async inspect(request): Promise<InlineFormatInspectionResult | null> {
      if (request.document.language !== BASH_LANGUAGE) {
        return null;
      }

      const resolvedPosition = resolveBashInspectionPosition(request);
      const symbolName = request.symbolName?.trim();

      if (request.kind === "semantic-tokens") {
        return {
          backendName: this.name,
          language: request.document.language,
          kind: request.kind,
          summary:
            "bash-language-server does not advertise semanticTokensProvider, so the prototype backend cannot expose semantic-token payloads for Bash yet.",
        };
      }

      return await withBashLanguageServerSession(request, async (context) => {
        if (request.kind === "diagnostics") {
          const diagnostics = runShellCheckDiagnostics(context.filePath);
          return {
            backendName: this.name,
            language: request.document.language,
            kind: request.kind,
            summary: createDiagnosticsSummary(diagnostics.length),
            diagnostics,
            payload: {
              diagnosticCount: diagnostics.length,
              source: "shellcheck",
            },
          };
        }

        if (resolvedPosition === null) {
          return {
            backendName: this.name,
            language: request.document.language,
            kind: request.kind,
            summary:
              symbolName !== undefined && symbolName.length > 0
                ? `Bash language server could not locate symbol ${symbolName} in the current virtual document.`
                : "Bash language server could not locate a suitable symbol in the current virtual document.",
          };
        }

        if (request.kind === "definition") {
          const locations = normalizeLocations(
            await context.client.request("textDocument/definition", {
              textDocument: {
                uri: context.fileUri,
              },
              position: toLspPosition(resolvedPosition),
            }),
          );
          const sameFileRanges = locations
            .filter((location) => location.uri === context.fileUri)
            .map((location) => fromLspRange(location.range));

          return {
            backendName: this.name,
            language: request.document.language,
            kind: request.kind,
            summary: createDefinitionSummary(
              symbolName,
              locations.length,
              sameFileRanges.length,
            ),
            ...(sameFileRanges.length > 0 ? { ranges: sameFileRanges } : {}),
            payload: {
              ...(symbolName !== undefined && symbolName.length > 0
                ? { symbolName }
                : {}),
              definitionCount: locations.length,
              sameFileDefinitionCount: sameFileRanges.length,
              definitionFiles: [
                ...new Set(locations.map((location) => location.uri)),
              ],
            },
          };
        }

        if (request.kind === "document-highlights") {
          const highlights =
            ((await context.client.request("textDocument/documentHighlight", {
              textDocument: {
                uri: context.fileUri,
              },
              position: toLspPosition(resolvedPosition),
            })) as LspDocumentHighlight[] | null) ?? [];
          const ranges = highlights.map((highlight) =>
            fromLspRange(highlight.range),
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
            },
          };
        }

        const hoverResult = (await context.client.request(
          "textDocument/hover",
          {
            textDocument: {
              uri: context.fileUri,
            },
            position: toLspPosition(resolvedPosition),
          },
        )) as {
          contents?: unknown;
          range?: LspRange;
        } | null;
        const hoverText = normalizeHoverText(hoverResult?.contents);
        const hoverRange =
          hoverResult?.range !== undefined
            ? fromLspRange(hoverResult.range)
            : undefined;
        const fallbackHoverRange =
          hoverRange ??
          findIdentifierRangeAtPosition(
            request.document.content,
            resolvedPosition,
          );

        if (request.kind === "explain-symbol") {
          const textualRanges =
            symbolName === undefined || symbolName.length === 0
              ? []
              : findTextualSymbolRanges(request.document.content, symbolName);
          return {
            backendName: this.name,
            language: request.document.language,
            kind: request.kind,
            summary:
              symbolName === undefined || symbolName.length === 0
                ? createHoverSummary(hoverText)
                : `Explained symbol ${symbolName} via bash-language-server. ${hoverText ?? "Hover text was empty."}`,
            ...(textualRanges.length > 0
              ? { ranges: textualRanges }
              : fallbackHoverRange !== undefined
                ? { ranges: [fallbackHoverRange] }
                : {}),
            payload: {
              ...(symbolName !== undefined && symbolName.length > 0
                ? { symbolName }
                : {}),
              hover: hoverText,
            },
          };
        }

        return {
          backendName: this.name,
          language: request.document.language,
          kind: request.kind,
          summary:
            symbolName === undefined || symbolName.length === 0
              ? createHoverSummary(hoverText)
              : `Inspected symbol ${symbolName} via bash-language-server. ${hoverText ?? "Hover text was empty."}`,
          ...(fallbackHoverRange !== undefined
            ? { ranges: [fallbackHoverRange] }
            : {}),
          payload: {
            ...(symbolName !== undefined && symbolName.length > 0
              ? { symbolName }
              : {}),
            hover: hoverText,
          },
        };
      });
    },
  };
