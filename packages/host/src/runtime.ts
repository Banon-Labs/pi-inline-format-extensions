import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
  type ToolCall,
} from "@mariozechner/pi-ai";
import {
  describePythonHeredoc,
  pythonInlineFormatPlugin,
} from "@pi-inline-format/python";
import { bashInlineFormatPlugin } from "@pi-inline-format/bash";
import { javascriptInlineFormatPlugin } from "@pi-inline-format/javascript";
import type {
  InlineFormatMatch,
  InlineFormatPlugin,
} from "@pi-inline-format/shared-contract";
import { typescriptInlineFormatPlugin } from "@pi-inline-format/typescript";
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

const CANONICAL_PYTHON_HEREDOC_COMMAND = `cat > /tmp/delete.me.py <<'PY'
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
const CANONICAL_INLINE_PATH = "/tmp/delete.me.py";
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
  "Use bash to write python to a file using heredocs. Execute into /tmp/delete.me.py";
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
const INLINE_DETERMINISTIC_TOOL_CALL_ID =
  "call_inline_format_deterministic_bash";
const INLINE_DETERMINISTIC_BASH_COMMAND = `cat > /tmp/delete.me.py <<'PY'
#!/usr/bin/env python3

def main() -> None:
    print("hello from /tmp/delete.me.py")

if __name__ == "__main__":
    main()
PY`;
const INLINE_DETERMINISTIC_MISS_MESSAGE =
  "This deterministic compare model only supports the canonical heredoc flow. Use /inline-format-run-deterministic-compare.";

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

      if (
        hasSuccessfulToolResult(
          context,
          "bash",
          INLINE_DETERMINISTIC_TOOL_CALL_ID,
        )
      ) {
        stream.push({ type: "done", reason: "stop", message: output });
        stream.end();
        return;
      }

      if (getLatestUserText(context) !== INLINE_DETERMINISTIC_PROMPT) {
        pushTextResponse(stream, output, INLINE_DETERMINISTIC_MISS_MESSAGE);
        return;
      }

      pushToolCallResponse(stream, output, {
        type: "toolCall",
        id: INLINE_DETERMINISTIC_TOOL_CALL_ID,
        name: "bash",
        arguments: {
          command: INLINE_DETERMINISTIC_BASH_COMMAND,
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

function renderInlineHighlightedBashCall(
  command: string,
  timeout: number | undefined,
  theme: Pick<Theme, "fg" | "bold">,
): string | null {
  if (!command.includes(CANONICAL_INLINE_PATH)) {
    return null;
  }

  const heredoc = describePythonHeredoc(command);
  if (heredoc === null) {
    return null;
  }

  const highlightedLines = highlightCodeWithRenderTheme(
    heredoc.source,
    "python",
  );
  const lines = command.split("\n");
  const renderedLines = lines.map((line, index) => {
    const prefixedLine = `${index === 0 ? "$ " : ""}${line}`;

    if (index > heredoc.startLineIndex && index < heredoc.endLineIndex) {
      return `${index === 0 ? "$ " : ""}${highlightedLines[index - heredoc.startLineIndex - 1] ?? line}`;
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
): Promise<void> {
  const model = ctx.modelRegistry.find(
    INLINE_DETERMINISTIC_PROVIDER,
    INLINE_DETERMINISTIC_MODEL,
  );
  if (model === undefined) {
    ctx.ui.notify(
      `Model ${INLINE_DETERMINISTIC_PROVIDER}/${INLINE_DETERMINISTIC_MODEL} is not registered. Try /reload.`,
      "error",
    );
    return;
  }

  const success = await pi.setModel(model);
  if (!success) {
    ctx.ui.notify(
      `Could not activate ${INLINE_DETERMINISTIC_PROVIDER}/${INLINE_DETERMINISTIC_MODEL}.`,
      "error",
    );
    return;
  }

  ctx.ui.notify(
    `Using ${INLINE_DETERMINISTIC_PROVIDER}/${INLINE_DETERMINISTIC_MODEL} for deterministic compare output.`,
    "info",
  );
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
    models: [
      {
        id: INLINE_DETERMINISTIC_MODEL,
        name: "Canonical Heredoc Compare",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32000,
        maxTokens: 4096,
      },
    ],
    streamSimple: streamDeterministicInlineCompare,
  });

  pi.registerCommand(INLINE_DETERMINISTIC_USE_COMMAND, {
    description: `Switch the current session to ${INLINE_DETERMINISTIC_PROVIDER}/${INLINE_DETERMINISTIC_MODEL}.`,
    handler: async (_args, ctx) => {
      await useDeterministicModel(pi, ctx);
    },
  });

  pi.registerCommand(INLINE_DETERMINISTIC_RUN_COMMAND, {
    description:
      "Switch to the local deterministic compare model and send the canonical heredoc prompt with no real LLM call.",
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify(
          "Agent is busy. Wait for it to finish before starting the deterministic compare.",
          "warning",
        );
        return;
      }

      await useDeterministicModel(pi, ctx);
      pi.sendUserMessage(INLINE_DETERMINISTIC_PROMPT);
    },
  });

  pi.registerCommand(INLINE_DETERMINISTIC_STATUS_COMMAND, {
    description:
      "Show the local deterministic compare provider, model, and helper commands.",
    handler: async (_args, ctx) => {
      await Promise.resolve();
      ctx.ui.notify(
        [
          `Provider: ${INLINE_DETERMINISTIC_PROVIDER}`,
          `Model: ${INLINE_DETERMINISTIC_MODEL}`,
          `Prompt: ${INLINE_DETERMINISTIC_PROMPT}`,
          `Commands: /${INLINE_DETERMINISTIC_USE_COMMAND}, /${INLINE_DETERMINISTIC_RUN_COMMAND}`,
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
