import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  INLINE_DETERMINISTIC_RUN_COMMAND,
  INLINE_DETERMINISTIC_STATUS_COMMAND,
  defaultInlineFormatPlugins,
  detectInlineFormatMatches,
  formatInlineFormatInspectionResult,
  formatInlineFormatMatches,
  formatInlineFormatPlugins,
  inspectInlineFormatCommand,
  registerHostRuntimeSeams,
  validateCanonicalPythonHeredocParity,
} from "../src/index.js";

const HOST_STATUS_COMMAND = "inline-format-host-status";
const INTEL_STATUS_COMMAND = "inline-format-intel-status";
const INSPECT_SAMPLE_COMMAND = "inline-format-inspect-sample";
const EXPLAIN_SYMBOL_COMMAND = "inline-format-explain-symbol";
const FIND_DEFINITION_COMMAND = "inline-format-find-definition";
const HIGHLIGHT_SYMBOL_COMMAND = "inline-format-highlight-symbol";
const SEMANTIC_TOKENS_COMMAND = "inline-format-semantic-tokens";
const DIAGNOSTICS_COMMAND = "inline-format-diagnostics-sample";
const SAMPLE_COMMANDS = {
  python: `cat > /tmp/delete.me.py <<'PY'
#!/usr/bin/env python3

def main() -> None:
    print("hello")
PY`,
  javascript: `node <<'JS'
const value = 42;
console.log(value);
JS`,
  typescript: `cat > /tmp/delete.me.ts <<'TS'
type Answer = {
  value: number;
};

const answer: Answer = { value: 42 };
console.log(answer.value);
TS`,
  bash: `bash <<'SH'
set -euo pipefail

greet() {
  echo "hello from sh"
}

greet
SH`,
} as const;

type SampleScenario = keyof typeof SAMPLE_COMMANDS;

const REPRESENTATIVE_HOVER_SYMBOLS: Partial<Record<SampleScenario, string>> = {
  python: "main",
  bash: "greet",
};
type SymbolInspectionKind =
  | "explain-symbol"
  | "definition"
  | "document-highlights";

function parseScenario(args: string): SampleScenario | null {
  const normalized = args.trim().toLowerCase();
  if (normalized in SAMPLE_COMMANDS) {
    return normalized as SampleScenario;
  }

  return null;
}

function parseScenarioAndSymbol(args: string): {
  scenario: SampleScenario | null;
  symbolName: string;
} {
  const [rawScenario, ...symbolParts] = args.trim().split(/\s+/u);
  return {
    scenario: rawScenario ? parseScenario(rawScenario) : null,
    symbolName: symbolParts.join(" ").trim(),
  };
}

function formatSymbolUsage(commandName: string): string {
  return `Usage: /${commandName} <${Object.keys(SAMPLE_COMMANDS).join("|")}> <symbol>`;
}

function formatScenarioUsage(commandName: string): string {
  return `Usage: /${commandName} <${Object.keys(SAMPLE_COMMANDS).join("|")}>`;
}

async function notifyHoverInspection(
  ctx: {
    ui: {
      notify(message: string, level: "warning" | "info" | "error"): void;
    };
  },
  scenario: SampleScenario,
): Promise<void> {
  const representativeSymbol = REPRESENTATIVE_HOVER_SYMBOLS[scenario];
  const result = await inspectInlineFormatCommand(
    SAMPLE_COMMANDS[scenario],
    "hover",
    {
      language: scenario,
      ...(representativeSymbol !== undefined
        ? { symbolName: representativeSymbol }
        : {}),
    },
  );

  if (result === null) {
    ctx.ui.notify(`No inline format match found for ${scenario}.`, "warning");
    return;
  }

  ctx.ui.notify(formatInlineFormatInspectionResult(result), "info");
}

async function notifySymbolInspection(
  ctx: {
    ui: {
      notify(message: string, level: "warning" | "info" | "error"): void;
    };
  },
  kind: SymbolInspectionKind,
  scenario: SampleScenario,
  symbolName: string,
): Promise<void> {
  const result = await inspectInlineFormatCommand(
    SAMPLE_COMMANDS[scenario],
    kind,
    {
      language: scenario,
      symbolName,
    },
  );

  if (result === null) {
    ctx.ui.notify(
      `No inline format match found for ${scenario}/${symbolName}.`,
      "warning",
    );
    return;
  }

  ctx.ui.notify(formatInlineFormatInspectionResult(result), "info");
}

async function notifySemanticTokensInspection(
  ctx: {
    ui: {
      notify(message: string, level: "warning" | "info" | "error"): void;
    };
  },
  scenario: SampleScenario,
): Promise<void> {
  const result = await inspectInlineFormatCommand(
    SAMPLE_COMMANDS[scenario],
    "semantic-tokens",
    {
      language: scenario,
    },
  );

  if (result === null) {
    ctx.ui.notify(`No inline format match found for ${scenario}.`, "warning");
    return;
  }

  ctx.ui.notify(formatInlineFormatInspectionResult(result), "info");
}

async function notifyDiagnosticsInspection(
  ctx: {
    ui: {
      notify(message: string, level: "warning" | "info" | "error"): void;
    };
  },
  scenario: SampleScenario,
): Promise<void> {
  const result = await inspectInlineFormatCommand(
    SAMPLE_COMMANDS[scenario],
    "diagnostics",
    {
      language: scenario,
    },
  );

  if (result === null) {
    ctx.ui.notify(`No inline format match found for ${scenario}.`, "warning");
    return;
  }

  ctx.ui.notify(formatInlineFormatInspectionResult(result), "info");
}

export default function registerInlineFormatHost(pi: ExtensionAPI): void {
  registerHostRuntimeSeams(pi);

  pi.registerCommand(HOST_STATUS_COMMAND, {
    description: "Show the current host/plugin scaffold status.",
    handler: async (_args, ctx) => {
      const loadedPlugins = formatInlineFormatPlugins(
        defaultInlineFormatPlugins,
      );
      const representativeDetections = Object.entries(SAMPLE_COMMANDS).map(
        ([label, command]) =>
          `${label}=${formatInlineFormatMatches(detectInlineFormatMatches(command)) || "none"}`,
      );
      const parityStatus = validateCanonicalPythonHeredocParity()
        ? "pass"
        : "fail";

      ctx.ui.notify(
        [
          "pi-inline-format host scaffold is active.",
          "Host-owned seams: bash override, deterministic compare helpers, summary suppression, plugin orchestration.",
          `Canonical Python heredoc parity: ${parityStatus}`,
          `Plugins: ${loadedPlugins}`,
          `Representative detections: ${representativeDetections.join(", ")}`,
          `Compare helpers: /${INLINE_DETERMINISTIC_RUN_COMMAND}, /${INLINE_DETERMINISTIC_STATUS_COMMAND}`,
          `Intel helpers: /${INTEL_STATUS_COMMAND}, /${INSPECT_SAMPLE_COMMAND} <scenario>, /${EXPLAIN_SYMBOL_COMMAND} <scenario> <symbol>, /${FIND_DEFINITION_COMMAND} <scenario> <symbol>, /${HIGHLIGHT_SYMBOL_COMMAND} <scenario> <symbol>, /${SEMANTIC_TOKENS_COMMAND} <scenario>, /${DIAGNOSTICS_COMMAND} <scenario>`,
        ].join("\n"),
        "info",
      );
    },
  });

  pi.registerCommand(INTEL_STATUS_COMMAND, {
    description: "Show the current semantic/intel scaffold status.",
    handler: async (_args, ctx) => {
      await Promise.resolve();
      ctx.ui.notify(
        [
          "Intel layer is active.",
          "Scope: virtual documents, inspection request/result plumbing, and backend dispatch.",
          "Real backends: TypeScript language service for javascript/typescript, basedpyright prototype for python, and a bash-language-server plus ShellCheck prototype for bash. The TS path supports hover, explain-symbol, definitions, document highlights, diagnostics, and semantic-token payloads. Python currently supports diagnostics, hover, explain-symbol, definitions, and semantic-token payloads. Bash currently supports diagnostics, hover-like explain, definitions, and document highlights through the prototype path; upstream bash-language-server does not expose semantic tokens, so Bash does not currently participate in smarter tool-row highlighting.",
          `Commands: /${INSPECT_SAMPLE_COMMAND} <scenario>, /${EXPLAIN_SYMBOL_COMMAND} <scenario> <symbol>, /${FIND_DEFINITION_COMMAND} <scenario> <symbol>, /${HIGHLIGHT_SYMBOL_COMMAND} <scenario> <symbol>, /${SEMANTIC_TOKENS_COMMAND} <scenario>, /${DIAGNOSTICS_COMMAND} <scenario>`,
          `Scenarios: ${Object.keys(SAMPLE_COMMANDS).join(", ")}`,
        ].join("\n"),
        "info",
      );
    },
  });

  pi.registerCommand(INSPECT_SAMPLE_COMMAND, {
    description:
      "Inspect a representative sample heredoc region through the intel backend. Usage: /inline-format-inspect-sample <python|javascript|typescript|bash>",
    handler: async (args, ctx) => {
      const scenario = parseScenario(args);
      if (scenario === null) {
        ctx.ui.notify(formatScenarioUsage(INSPECT_SAMPLE_COMMAND), "warning");
        return;
      }

      await notifyHoverInspection(ctx, scenario);
    },
  });

  pi.registerCommand(EXPLAIN_SYMBOL_COMMAND, {
    description:
      "Explain a symbol in a representative sample heredoc through the intel backend. Usage: /inline-format-explain-symbol <scenario> <symbol>",
    handler: async (args, ctx) => {
      const { scenario, symbolName } = parseScenarioAndSymbol(args);
      if (scenario === null || symbolName.length === 0) {
        ctx.ui.notify(formatSymbolUsage(EXPLAIN_SYMBOL_COMMAND), "warning");
        return;
      }

      await notifySymbolInspection(ctx, "explain-symbol", scenario, symbolName);
    },
  });

  pi.registerCommand(FIND_DEFINITION_COMMAND, {
    description:
      "Resolve a symbol definition in a representative sample heredoc. Usage: /inline-format-find-definition <scenario> <symbol>",
    handler: async (args, ctx) => {
      const { scenario, symbolName } = parseScenarioAndSymbol(args);
      if (scenario === null || symbolName.length === 0) {
        ctx.ui.notify(formatSymbolUsage(FIND_DEFINITION_COMMAND), "warning");
        return;
      }

      await notifySymbolInspection(ctx, "definition", scenario, symbolName);
    },
  });

  pi.registerCommand(HIGHLIGHT_SYMBOL_COMMAND, {
    description:
      "Show document-highlight ranges for a symbol in a representative sample heredoc. Usage: /inline-format-highlight-symbol <scenario> <symbol>",
    handler: async (args, ctx) => {
      const { scenario, symbolName } = parseScenarioAndSymbol(args);
      if (scenario === null || symbolName.length === 0) {
        ctx.ui.notify(formatSymbolUsage(HIGHLIGHT_SYMBOL_COMMAND), "warning");
        return;
      }

      await notifySymbolInspection(
        ctx,
        "document-highlights",
        scenario,
        symbolName,
      );
    },
  });

  pi.registerCommand(SEMANTIC_TOKENS_COMMAND, {
    description:
      "Expose semantic-token payloads for a representative sample heredoc. Usage: /inline-format-semantic-tokens <scenario>",
    handler: async (args, ctx) => {
      const scenario = parseScenario(args);
      if (scenario === null) {
        ctx.ui.notify(formatScenarioUsage(SEMANTIC_TOKENS_COMMAND), "warning");
        return;
      }

      await notifySemanticTokensInspection(ctx, scenario);
    },
  });

  pi.registerCommand(DIAGNOSTICS_COMMAND, {
    description:
      "Show diagnostics for a representative sample heredoc through the intel backend. Usage: /inline-format-diagnostics-sample <scenario>",
    handler: async (args, ctx) => {
      const scenario = parseScenario(args);
      if (scenario === null) {
        ctx.ui.notify(formatScenarioUsage(DIAGNOSTICS_COMMAND), "warning");
        return;
      }

      await notifyDiagnosticsInspection(ctx, scenario);
    },
  });
}
