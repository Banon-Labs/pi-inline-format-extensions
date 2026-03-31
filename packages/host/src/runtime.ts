import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  type ToolCall,
} from "@mariozechner/pi-ai";
import { pythonInlineFormatPlugin } from "@pi-inline-format/python";
import { bashInlineFormatPlugin } from "@pi-inline-format/bash";
import { javascriptInlineFormatPlugin } from "@pi-inline-format/javascript";
import type {
  InlineFormatMatch,
  InlineFormatPlugin,
} from "@pi-inline-format/shared-contract";
import { typescriptInlineFormatPlugin } from "@pi-inline-format/typescript";
import {
  collectInlineFormatSemanticTokens,
  createInlineFormatVirtualDocument,
  inspectInlineFormatDocument,
  type InlineFormatInspectionKind,
  type InlineFormatInspectionPosition,
  type InlineFormatInspectionResult,
  type InlineFormatRegionReference,
  type InlineFormatSemanticToken,
} from "@pi-inline-format/intel";
import {
  createBashToolDefinition,
  createLocalBashOperations,
  highlightCode,
  initTheme,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type Theme,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

import { collectHostBashSmarterHighlightTokens } from "./bash-smarter-highlight.js";
import { collectHostPythonSmarterHighlightTokens } from "./python-smarter-highlight.js";

const CANONICAL_PYTHON_HEREDOC_COMMAND = `python3 <<'PY'
#!/usr/bin/env python3

print("hello")
PY`;
const CANONICAL_PYTHON_HEREDOC_EXPECTED_MATCHES: readonly InlineFormatMatch[] =
  [
    {
      pluginName: "python",
      language: "python",
      startLineIndex: 1,
      endLineIndex: 3,
    },
  ];
const BASH_PARAMS = Type.Object({
  command: Type.String({ description: "Bash command to execute" }),
  timeout: Type.Optional(
    Type.Number({
      description: "Timeout in seconds (optional, no default timeout)",
    }),
  ),
});

export const INLINE_DETERMINISTIC_PROVIDER = "inline-deterministic";
export const INLINE_DETERMINISTIC_MODEL = "canonical-heredoc-compare";
export const INLINE_DETERMINISTIC_PROMPT =
  "Use bash to run python from a heredoc with python3. Keep the transcript inline and normal.";
export const INLINE_DETERMINISTIC_USE_COMMAND =
  "inline-format-use-deterministic-model";
export const INLINE_DETERMINISTIC_RUN_COMMAND =
  "inline-format-run-deterministic-compare";
export const INLINE_DETERMINISTIC_STATUS_COMMAND =
  "inline-format-deterministic-status";
export const BASH_SUMMARY_SUPPRESSION_INSTRUCTIONS = `When the user asks for a bash action and the bash transcript itself will clearly show what happened, do not add prefatory narration, planning text, completion summaries, restatements, or reformatted file contents unless the user explicitly asks for them.

After a successful bash tool result, prefer ending the turn immediately with no extra assistant narration.

In particular, do not add follow-up narration such as:
- \`Done\`
- \`Done: <path>\`
- \`Created <path>\`
- \`Wrote <path>\`
- \`Executed <path>\`
- \`Contents:\`
- restated file paths
- fenced code blocks repeating file contents
- paraphrases like \`Created /tmp/delete.me.py with a bash heredoc.\`

For the canonical heredoc flow in this repo, the preferred behavior is:
- call bash directly
- let the bash tool row/output speak for itself
- do not add any assistant text before or after a successful bash tool result`;

const INLINE_DETERMINISTIC_API = "inline-deterministic-api";
type DeterministicScenarioKey = "python" | "javascript" | "typescript" | "bash";

type DeterministicScenario = {
  key: DeterministicScenarioKey;
  label: string;
  model: string;
  prompt: string;
  toolCallId: string;
  bashCommand: string;
};

const INLINE_DETERMINISTIC_SCENARIOS = [
  {
    key: "python",
    label: "Python",
    model: INLINE_DETERMINISTIC_MODEL,
    prompt: INLINE_DETERMINISTIC_PROMPT,
    toolCallId: "call_inline_format_deterministic_python_bash",
    bashCommand: `python3 <<'PY'
#!/usr/bin/env python3

def main() -> None:
    print("hello from py")

if __name__ == "__main__":
    main()
PY`,
  },
  {
    key: "javascript",
    label: "JavaScript",
    model: "javascript-heredoc-compare",
    prompt:
      "Use bash to run javascript from a heredoc with node. Keep the transcript inline and normal.",
    toolCallId: "call_inline_format_deterministic_javascript_bash",
    bashCommand: `node <<'JS'
const value = 42;
console.log("hello from js", value);
JS`,
  },
  {
    key: "typescript",
    label: "TypeScript",
    model: "typescript-heredoc-compare",
    prompt:
      "Use bash to run typescript from a heredoc with npx tsx. Keep the transcript inline and normal.",
    toolCallId: "call_inline_format_deterministic_typescript_bash",
    bashCommand: `npx tsx <<'TS'
type Answer = {
  value: number;
};

const answer: Answer = { value: 42 };
console.log("hello from ts", answer.value);
TS`,
  },
  {
    key: "bash",
    label: "Bash",
    model: "bash-heredoc-compare",
    prompt:
      "Use bash to run shell from a heredoc with bash. Keep the transcript inline and normal.",
    toolCallId: "call_inline_format_deterministic_bash_bash",
    bashCommand: `bash <<'SH'
set -euo pipefail
echo "hello from sh"
SH`,
  },
] as const satisfies readonly DeterministicScenario[];

const INLINE_DETERMINISTIC_DEFAULT_SCENARIO = INLINE_DETERMINISTIC_SCENARIOS[0];
const INLINE_DETERMINISTIC_SCENARIO_KEYS = INLINE_DETERMINISTIC_SCENARIOS.map(
  (scenario) => scenario.key,
).join(", ");

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function compareNumbers(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function createUsage(): AssistantMessage["usage"] {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function createAssistantShell(model: Model<string>): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: createUsage(),
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function getLatestUserText(context: Context): string | undefined {
  const latestUser = [...context.messages]
    .reverse()
    .find((message) => message.role === "user");

  if (latestUser === undefined) {
    return undefined;
  }

  if (typeof latestUser.content === "string") {
    return latestUser.content;
  }

  return latestUser.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("\n")
    .trim();
}

function getDeterministicScenarioByModel(
  modelId: string,
): DeterministicScenario | undefined {
  return INLINE_DETERMINISTIC_SCENARIOS.find(
    (scenario) => scenario.model === modelId,
  );
}

function getDeterministicScenarioByKey(
  key: string,
): DeterministicScenario | undefined {
  return INLINE_DETERMINISTIC_SCENARIOS.find(
    (scenario) => scenario.key === key,
  );
}

function parseDeterministicScenarioArg(
  args: string,
): DeterministicScenario | undefined {
  const normalized = args.trim().toLowerCase();
  if (normalized.length === 0) {
    return INLINE_DETERMINISTIC_DEFAULT_SCENARIO;
  }

  return getDeterministicScenarioByKey(normalized);
}

function formatDeterministicScenarioUsage(): string {
  return `Usage: /${INLINE_DETERMINISTIC_RUN_COMMAND} [${INLINE_DETERMINISTIC_SCENARIO_KEYS}]`;
}

function formatDeterministicModelUsage(): string {
  return `Usage: /${INLINE_DETERMINISTIC_USE_COMMAND} [${INLINE_DETERMINISTIC_SCENARIO_KEYS}]`;
}

function createDeterministicMissMessage(
  scenario: DeterministicScenario,
): string {
  return [
    `This deterministic compare model only supports the ${scenario.label.toLowerCase()} heredoc flow.`,
    `Expected prompt: ${scenario.prompt}`,
    `Run /${INLINE_DETERMINISTIC_RUN_COMMAND} ${scenario.key} or switch with /${INLINE_DETERMINISTIC_USE_COMMAND} ${scenario.key}.`,
  ].join(" ");
}

function hasSuccessfulToolResult(
  context: Context,
  toolName: string,
  toolCallId: string,
): boolean {
  return context.messages.some(
    (message) =>
      message.role === "toolResult" &&
      message.toolName === toolName &&
      message.toolCallId === toolCallId &&
      !message.isError,
  );
}

function pushTextResponse(
  stream: AssistantMessageEventStream,
  output: AssistantMessage,
  text: string,
): void {
  output.content.push({ type: "text", text: "" });
  const contentIndex = output.content.length - 1;
  stream.push({ type: "text_start", contentIndex, partial: output });

  const block = output.content[contentIndex];
  if (block?.type === "text") {
    block.text = text;
  }

  stream.push({
    type: "text_delta",
    contentIndex,
    delta: text,
    partial: output,
  });
  stream.push({
    type: "text_end",
    contentIndex,
    content: text,
    partial: output,
  });
  stream.push({ type: "done", reason: "stop", message: output });
  stream.end();
}

function pushToolCallResponse(
  stream: AssistantMessageEventStream,
  output: AssistantMessage,
  toolCall: ToolCall,
): void {
  output.stopReason = "toolUse";
  output.content.push(toolCall);
  const contentIndex = output.content.length - 1;
  stream.push({ type: "toolcall_start", contentIndex, partial: output });
  stream.push({
    type: "toolcall_delta",
    contentIndex,
    delta: JSON.stringify(toolCall.arguments),
    partial: output,
  });
  stream.push({
    type: "toolcall_end",
    contentIndex,
    toolCall,
    partial: output,
  });
  stream.push({ type: "done", reason: "toolUse", message: output });
  stream.end();
}

function streamDeterministicInlineCompare(
  model: Model<string>,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();

  queueMicrotask(() => {
    const output = createAssistantShell(model);
    stream.push({ type: "start", partial: output });

    try {
      if (options?.signal?.aborted) {
        output.stopReason = "aborted";
        output.errorMessage = "Aborted before deterministic compare response.";
        stream.push({ type: "error", reason: "aborted", error: output });
        stream.end();
        return;
      }

      const scenario = getDeterministicScenarioByModel(model.id);
      if (scenario === undefined) {
        pushTextResponse(
          stream,
          output,
          `Unknown deterministic scenario for model ${model.id}.`,
        );
        return;
      }

      if (hasSuccessfulToolResult(context, "bash", scenario.toolCallId)) {
        stream.push({ type: "done", reason: "stop", message: output });
        stream.end();
        return;
      }

      if (getLatestUserText(context) !== scenario.prompt) {
        pushTextResponse(
          stream,
          output,
          createDeterministicMissMessage(scenario),
        );
        return;
      }

      pushToolCallResponse(stream, output, {
        type: "toolCall",
        id: scenario.toolCallId,
        name: "bash",
        arguments: {
          command: scenario.bashCommand,
        },
      });
    } catch (error) {
      output.stopReason = options?.signal?.aborted ? "aborted" : "error";
      output.errorMessage =
        error instanceof Error ? error.message : String(error);
      stream.push({ type: "error", reason: output.stopReason, error: output });
      stream.end();
    }
  });

  return stream;
}

function highlightCodeWithRenderTheme(code: string, lang: string): string[] {
  initTheme();
  return highlightCode(code, lang);
}

function formatDefaultBashCall(
  command: string,
  timeout: number | undefined,
  theme: Pick<Theme, "fg" | "bold">,
): string {
  const timeoutSuffix = timeout
    ? theme.fg("muted", ` (timeout ${String(timeout)}s)`)
    : "";

  return `${theme.fg("toolTitle", theme.bold(`$ ${command}`))}${timeoutSuffix}`;
}

function getSemanticTokenThemeColor(
  token: InlineFormatSemanticToken,
): "syntaxType" | "syntaxVariable" | "syntaxFunction" | "accent" | "toolTitle" {
  switch (token.tokenType) {
    case "class":
    case "enum":
    case "interface":
    case "namespace":
    case "typeParameter":
    case "type":
      return "syntaxType";
    case "function":
    case "member":
      return "syntaxFunction";
    case "parameter":
    case "variable":
    case "enumMember":
    case "property":
      return "syntaxVariable";
    default:
      return "accent";
  }
}

function highlightInlineSegment(segment: string, language: string): string {
  if (segment.length === 0) {
    return "";
  }

  return highlightCodeWithRenderTheme(segment, language)[0] ?? segment;
}

type InlineSemanticRenderTheme = Pick<
  Theme,
  "fg" | "bold" | "italic" | "underline"
>;

function styleSemanticTokenText(
  token: InlineFormatSemanticToken,
  text: string,
  theme: InlineSemanticRenderTheme,
): string {
  let styled = text;

  if (token.modifiers.includes("declaration")) {
    styled = theme.bold(styled);
  }

  if (token.modifiers.includes("readonly")) {
    styled = theme.underline(styled);
  }

  if (token.modifiers.includes("defaultLibrary")) {
    styled = theme.italic(styled);
  }

  return theme.fg(getSemanticTokenThemeColor(token), styled);
}

function shouldFallbackForOutOfOrderSemanticTokenRange(
  start: number,
  end: number,
): boolean {
  return end < start;
}

function shouldFallbackForOverlappingSemanticTokenRange(
  start: number,
  cursor: number,
): boolean {
  return start < cursor;
}

function shouldFallbackForCrossLineSemanticToken(
  startLineIndex: number,
  endLineIndex: number,
): boolean {
  return startLineIndex !== endLineIndex;
}

function supportsSuppliedSemanticTokenRendering(
  language: InlineFormatMatch["language"],
): boolean {
  return (
    language === "javascript" ||
    language === "typescript" ||
    language === "python" ||
    language === "bash"
  );
}

function bucketSemanticTokensByLine(
  semanticTokens: readonly InlineFormatSemanticToken[],
): ReadonlyMap<number, readonly InlineFormatSemanticToken[]> {
  const tokensByLine = new Map<number, InlineFormatSemanticToken[]>();

  for (const token of semanticTokens) {
    const lineTokens = tokensByLine.get(token.range.start.lineIndex) ?? [];
    lineTokens.push(token);
    tokensByLine.set(token.range.start.lineIndex, lineTokens);
  }

  for (const lineTokens of tokensByLine.values()) {
    lineTokens.sort(
      (left, right) =>
        left.range.start.columnIndex - right.range.start.columnIndex,
    );
  }

  return tokensByLine;
}

function renderSemanticallyHighlightedScriptLinesFromTokens(
  language: InlineFormatMatch["language"],
  sourceLines: readonly string[],
  semanticTokens: readonly InlineFormatSemanticToken[],
  theme: InlineSemanticRenderTheme,
): string[] | null {
  if (!supportsSuppliedSemanticTokenRendering(language)) {
    return null;
  }

  if (semanticTokens.length === 0) {
    return null;
  }

  for (const token of semanticTokens) {
    if (
      shouldFallbackForCrossLineSemanticToken(
        token.range.start.lineIndex,
        token.range.end.lineIndex,
      )
    ) {
      return null;
    }
  }

  const tokensByLine = bucketSemanticTokensByLine(semanticTokens);

  return sourceLines.map((line, lineIndex) => {
    const lineTokens = tokensByLine.get(lineIndex) ?? [];

    if (lineTokens.length === 0) {
      return highlightInlineSegment(line, language);
    }

    let cursor = 0;
    const renderedSegments: string[] = [];

    for (const token of lineTokens) {
      const start = token.range.start.columnIndex;
      const end = token.range.end.columnIndex;

      if (
        shouldFallbackForOverlappingSemanticTokenRange(start, cursor) ||
        shouldFallbackForOutOfOrderSemanticTokenRange(start, end)
      ) {
        return highlightInlineSegment(line, language);
      }

      renderedSegments.push(
        highlightInlineSegment(line.slice(cursor, start), language),
      );
      renderedSegments.push(
        styleSemanticTokenText(
          token,
          highlightInlineSegment(line.slice(start, end), language),
          theme,
        ),
      );
      cursor = end;
    }

    renderedSegments.push(highlightInlineSegment(line.slice(cursor), language));
    return renderedSegments.join("");
  });
}

export function renderSemanticallyHighlightedScriptLinesWithSuppliedTokens(
  language: InlineFormatMatch["language"],
  sourceLines: readonly string[],
  semanticTokens: readonly InlineFormatSemanticToken[],
  theme: InlineSemanticRenderTheme,
): string[] | null {
  return renderSemanticallyHighlightedScriptLinesFromTokens(
    language,
    sourceLines,
    semanticTokens,
    theme,
  );
}

function collectSuppliedSemanticTokensForMatch(
  command: string,
  match: InlineFormatMatch,
): readonly InlineFormatSemanticToken[] | null {
  if (!supportsSuppliedSemanticTokenRendering(match.language)) {
    return null;
  }

  const region = createInlineFormatRegionReference(command, match.language);
  if (region === null) {
    return null;
  }

  const document = createInlineFormatVirtualDocument(region);

  if (match.language === "bash") {
    return collectHostBashSmarterHighlightTokens(region.source);
  }

  if (match.language === "python") {
    return collectHostPythonSmarterHighlightTokens(document);
  }

  return collectInlineFormatSemanticTokens(document);
}

function renderInlineHighlightedBashCall(
  command: string,
  timeout: number | undefined,
  theme: Pick<Theme, "fg" | "bold" | "italic" | "underline">,
): string | null {
  const matches = detectInlineFormatMatches(command);
  if (matches.length === 0) {
    return null;
  }

  const lines = command.split("\n");
  const highlightedByLine = new Map<number, string>();

  for (const match of matches) {
    const sourceLines = lines.slice(
      match.startLineIndex,
      match.endLineIndex + 1,
    );

    if (sourceLines.length === 0) {
      continue;
    }

    const semanticTokens = collectSuppliedSemanticTokensForMatch(
      command,
      match,
    );
    const highlightedLines =
      (semanticTokens === null
        ? null
        : renderSemanticallyHighlightedScriptLinesWithSuppliedTokens(
            match.language,
            sourceLines,
            semanticTokens,
            theme,
          )) ??
      highlightCodeWithRenderTheme(sourceLines.join("\n"), match.language);

    sourceLines.forEach((line, index) => {
      highlightedByLine.set(
        match.startLineIndex + index,
        highlightedLines[index] ?? line,
      );
    });
  }

  if (highlightedByLine.size === 0) {
    return null;
  }

  const renderedLines = lines.map((line, index) => {
    const prefixedLine = `${index === 0 ? "$ " : ""}${line}`;
    const highlightedLine = highlightedByLine.get(index);

    if (highlightedLine !== undefined) {
      return `${index === 0 ? "$ " : ""}${highlightedLine}`;
    }

    return theme.fg("toolTitle", theme.bold(prefixedLine));
  });

  const timeoutSuffix = timeout
    ? theme.fg("muted", ` (timeout ${String(timeout)}s)`)
    : "";

  return `${renderedLines.join("\n")}${timeoutSuffix}`;
}

async function useDeterministicModel(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  scenario: DeterministicScenario = INLINE_DETERMINISTIC_DEFAULT_SCENARIO,
): Promise<boolean> {
  const model = ctx.modelRegistry.find(
    INLINE_DETERMINISTIC_PROVIDER,
    scenario.model,
  );
  if (model === undefined) {
    ctx.ui.notify(
      `Model ${INLINE_DETERMINISTIC_PROVIDER}/${scenario.model} is not registered. Try /reload.`,
      "error",
    );
    return false;
  }

  const success = await pi.setModel(model);
  if (!success) {
    ctx.ui.notify(
      `Could not activate ${INLINE_DETERMINISTIC_PROVIDER}/${scenario.model}.`,
      "error",
    );
    return false;
  }

  ctx.ui.notify(
    `Using ${INLINE_DETERMINISTIC_PROVIDER}/${scenario.model} for ${scenario.label.toLowerCase()} deterministic compare output.`,
    "info",
  );
  return true;
}

export const defaultInlineFormatPlugins = [
  pythonInlineFormatPlugin,
  typescriptInlineFormatPlugin,
  javascriptInlineFormatPlugin,
  bashInlineFormatPlugin,
] as const satisfies readonly InlineFormatPlugin[];

export function compareInlineFormatPlugins(
  left: InlineFormatPlugin,
  right: InlineFormatPlugin,
): number {
  return (
    compareStrings(left.name, right.name) ||
    compareStrings(left.language, right.language)
  );
}

export function compareInlineFormatMatches(
  left: InlineFormatMatch,
  right: InlineFormatMatch,
): number {
  return (
    compareStrings(left.pluginName, right.pluginName) ||
    compareStrings(left.language, right.language) ||
    compareNumbers(left.startLineIndex, right.startLineIndex) ||
    compareNumbers(left.endLineIndex, right.endLineIndex)
  );
}

export function sortInlineFormatPlugins(
  plugins: readonly InlineFormatPlugin[],
): InlineFormatPlugin[] {
  return [...plugins].sort(compareInlineFormatPlugins);
}

export function sortInlineFormatMatches(
  matches: readonly InlineFormatMatch[],
): InlineFormatMatch[] {
  return [...matches].sort(compareInlineFormatMatches);
}

function detectWithPlugins(
  plugins: readonly InlineFormatPlugin[],
  command: string,
): InlineFormatMatch[] {
  return sortInlineFormatMatches(
    plugins
      .map((plugin) => plugin.detect(command))
      .filter((match): match is InlineFormatMatch => match !== null),
  );
}

export function detectInlineFormatMatches(
  command: string,
): InlineFormatMatch[] {
  return detectWithPlugins(defaultInlineFormatPlugins, command);
}

export function getCanonicalPythonHeredocMatches(): InlineFormatMatch[] {
  return detectInlineFormatMatches(CANONICAL_PYTHON_HEREDOC_COMMAND);
}

export function validateCanonicalPythonHeredocParity(): boolean {
  const actualMatches = sortInlineFormatMatches(
    getCanonicalPythonHeredocMatches(),
  );
  const expectedMatches = sortInlineFormatMatches(
    CANONICAL_PYTHON_HEREDOC_EXPECTED_MATCHES,
  );

  if (actualMatches.length !== expectedMatches.length) {
    return false;
  }

  return actualMatches.every(
    (match, index) =>
      compareInlineFormatMatches(
        match,
        expectedMatches[index] as InlineFormatMatch,
      ) === 0,
  );
}

export function formatInlineFormatPlugins(
  plugins: readonly InlineFormatPlugin[] = defaultInlineFormatPlugins,
): string {
  return sortInlineFormatPlugins(plugins)
    .map((plugin) => `${plugin.name}:${plugin.language}`)
    .join(", ");
}

export function formatInlineFormatMatches(
  matches: readonly InlineFormatMatch[],
): string {
  return sortInlineFormatMatches(matches)
    .map(
      (match) =>
        `${match.pluginName}:${match.language}[${String(match.startLineIndex)}-${String(match.endLineIndex)}]`,
    )
    .join(", ");
}

export function findInlineFormatMatch(
  command: string,
  language?: string,
): InlineFormatMatch | undefined {
  const matches = detectInlineFormatMatches(command);
  if (language === undefined) {
    return matches[0];
  }

  return matches.find((match) => match.language === language);
}

function extractInlineFormatSource(
  command: string,
  match: InlineFormatMatch,
): string {
  return command
    .split("\n")
    .slice(match.startLineIndex, match.endLineIndex + 1)
    .join("\n");
}

function inferInlineFormatFilePathHint(command: string): string | undefined {
  const fileWriteMatch = /cat\s*>\s*(?<path>\S+)\s*<</u.exec(command);
  if (fileWriteMatch?.groups?.path !== undefined) {
    return fileWriteMatch.groups.path;
  }

  return undefined;
}

export function createInlineFormatRegionReference(
  command: string,
  language?: string,
  projectRoot: string = process.cwd(),
): InlineFormatRegionReference | null {
  const match = findInlineFormatMatch(command, language);
  if (match === undefined) {
    return null;
  }

  const filePathHint = inferInlineFormatFilePathHint(command);

  return {
    language: match.language,
    match,
    command,
    source: extractInlineFormatSource(command, match),
    ...(filePathHint !== undefined ? { filePathHint } : {}),
    projectRoot,
  };
}

export async function inspectInlineFormatCommand(
  command: string,
  kind: InlineFormatInspectionKind,
  options: {
    language?: string;
    symbolName?: string;
    position?: InlineFormatInspectionPosition;
    projectRoot?: string;
  } = {},
): Promise<InlineFormatInspectionResult | null> {
  const region = createInlineFormatRegionReference(
    command,
    options.language,
    options.projectRoot,
  );
  if (region === null) {
    return null;
  }

  const document = createInlineFormatVirtualDocument(region);
  return await inspectInlineFormatDocument(document, kind, {
    ...(options.symbolName !== undefined
      ? { symbolName: options.symbolName }
      : {}),
    ...(options.position !== undefined ? { position: options.position } : {}),
  });
}

export function formatInlineFormatInspectionResult(
  result: InlineFormatInspectionResult,
): string {
  const lines = [
    `Backend: ${result.backendName}`,
    `Language: ${result.language}`,
    `Kind: ${result.kind}`,
    `Summary: ${result.summary}`,
  ];

  if (result.ranges !== undefined && result.ranges.length > 0) {
    lines.push(
      `Ranges: ${result.ranges
        .map(
          (range: {
            start: InlineFormatInspectionPosition;
            end: InlineFormatInspectionPosition;
          }) =>
            `[${String(range.start.lineIndex)}:${String(range.start.columnIndex)}-${String(range.end.lineIndex)}:${String(range.end.columnIndex)}]`,
        )
        .join(", ")}`,
    );
  }

  if (result.diagnostics !== undefined) {
    lines.push(`Diagnostics: ${String(result.diagnostics.length)}`);
  }

  if (result.payload !== undefined) {
    lines.push(`Payload: ${JSON.stringify(result.payload)}`);
  }

  return lines.join("\n");
}

export function createHostBashRuntime(cwd: string = process.cwd()): {
  operations: ReturnType<typeof createLocalBashOperations>;
  toolDefinition: ReturnType<typeof createBashToolDefinition>;
} {
  const operations = createLocalBashOperations();
  const originalBash = createBashToolDefinition(cwd, { operations });

  return {
    operations,
    toolDefinition: {
      name: "bash",
      label: originalBash.label,
      description: originalBash.description,
      promptSnippet:
        originalBash.promptSnippet ??
        "Execute bash commands (ls, grep, find, etc.)",
      parameters: BASH_PARAMS,
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        return await originalBash.execute(
          toolCallId,
          params,
          signal,
          onUpdate,
          ctx,
        );
      },
      renderCall(args, theme, context) {
        const state = context.state as {
          startedAt?: number | undefined;
          endedAt?: number | undefined;
        };
        if (context.executionStarted && state.startedAt === undefined) {
          state.startedAt = Date.now();
          state.endedAt = undefined;
        }

        const highlightedCall = renderInlineHighlightedBashCall(
          args.command,
          args.timeout,
          theme,
        );
        const renderedCall =
          highlightedCall ??
          formatDefaultBashCall(args.command, args.timeout, theme);
        return new Text(renderedCall, 0, 0);
      },
    },
  };
}

export function registerDeterministicProvider(pi: ExtensionAPI): void {
  pi.registerProvider(INLINE_DETERMINISTIC_PROVIDER, {
    baseUrl: "https://inline-deterministic.invalid",
    apiKey: "inline-deterministic-local-only",
    api: INLINE_DETERMINISTIC_API,
    models: INLINE_DETERMINISTIC_SCENARIOS.map((scenario) => ({
      id: scenario.model,
      name: `${scenario.label} Heredoc Compare`,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 32000,
      maxTokens: 4096,
    })),
    streamSimple: streamDeterministicInlineCompare,
  });

  pi.registerCommand(INLINE_DETERMINISTIC_USE_COMMAND, {
    description: `Switch the current session to ${INLINE_DETERMINISTIC_PROVIDER}/<scenario-model>. Optional args: ${INLINE_DETERMINISTIC_SCENARIO_KEYS}.`,
    handler: async (args, ctx) => {
      const scenario = parseDeterministicScenarioArg(args);
      if (scenario === undefined) {
        ctx.ui.notify(formatDeterministicModelUsage(), "warning");
        return;
      }

      await useDeterministicModel(pi, ctx, scenario);
    },
  });

  pi.registerCommand(INLINE_DETERMINISTIC_RUN_COMMAND, {
    description:
      "Switch to the local deterministic compare model for the requested scenario and send the matching heredoc prompt with no real LLM call.",
    handler: async (args, ctx) => {
      const scenario = parseDeterministicScenarioArg(args);
      if (scenario === undefined) {
        ctx.ui.notify(formatDeterministicScenarioUsage(), "warning");
        return;
      }

      if (!ctx.isIdle()) {
        ctx.ui.notify(
          "Agent is busy. Wait for it to finish before starting the deterministic compare.",
          "warning",
        );
        return;
      }

      const activated = await useDeterministicModel(pi, ctx, scenario);
      if (!activated) {
        return;
      }

      pi.sendUserMessage(scenario.prompt);
    },
  });

  pi.registerCommand(INLINE_DETERMINISTIC_STATUS_COMMAND, {
    description:
      "Show the local deterministic compare provider, scenarios, models, and helper commands.",
    handler: async (_args, ctx) => {
      await Promise.resolve();
      ctx.ui.notify(
        [
          `Provider: ${INLINE_DETERMINISTIC_PROVIDER}`,
          `Default model: ${INLINE_DETERMINISTIC_MODEL}`,
          `Scenarios: ${INLINE_DETERMINISTIC_SCENARIOS.map((scenario) => `${scenario.key}=${scenario.model}`).join(", ")}`,
          `Default prompt: ${INLINE_DETERMINISTIC_PROMPT}`,
          `Commands: /${INLINE_DETERMINISTIC_USE_COMMAND} [scenario], /${INLINE_DETERMINISTIC_RUN_COMMAND} [scenario]`,
        ].join("\n"),
        "info",
      );
    },
  });
}

export function registerHostRuntimeSeams(
  pi: ExtensionAPI,
  cwd: string = process.cwd(),
): void {
  const { operations, toolDefinition } = createHostBashRuntime(cwd);

  registerDeterministicProvider(pi);

  pi.on("before_agent_start", async (event) => {
    await Promise.resolve();
    if (event.systemPrompt.includes(BASH_SUMMARY_SUPPRESSION_INSTRUCTIONS)) {
      return undefined;
    }

    return {
      systemPrompt: `${event.systemPrompt}\n\n${BASH_SUMMARY_SUPPRESSION_INSTRUCTIONS}`,
    };
  });

  pi.registerTool(toolDefinition);
  pi.on("user_bash", async () => ({
    operations,
  }));
}
