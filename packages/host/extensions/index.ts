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
echo "hello from sh"
SH`,
} as const;

type SampleScenario = keyof typeof SAMPLE_COMMANDS;

function parseScenario(args: string): SampleScenario | null {
  const normalized = args.trim().toLowerCase();
  if (normalized in SAMPLE_COMMANDS) {
    return normalized as SampleScenario;
  }

  return null;
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
          `Intel helpers: /${INTEL_STATUS_COMMAND}, /${INSPECT_SAMPLE_COMMAND} <scenario>, /${EXPLAIN_SYMBOL_COMMAND} <scenario> <symbol>`,
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
          "Real backend: TypeScript language service for javascript/typescript. Fallback scaffold: python/bash and any unsupported language.",
          `Commands: /${INSPECT_SAMPLE_COMMAND} <scenario>, /${EXPLAIN_SYMBOL_COMMAND} <scenario> <symbol>`,
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
        ctx.ui.notify(
          `Usage: /${INSPECT_SAMPLE_COMMAND} <${Object.keys(SAMPLE_COMMANDS).join("|")}>`,
          "warning",
        );
        return;
      }

      const result = await inspectInlineFormatCommand(
        SAMPLE_COMMANDS[scenario],
        "hover",
        { language: scenario },
      );

      if (result === null) {
        ctx.ui.notify(
          `No inline format match found for ${scenario}.`,
          "warning",
        );
        return;
      }

      ctx.ui.notify(formatInlineFormatInspectionResult(result), "info");
    },
  });

  pi.registerCommand(EXPLAIN_SYMBOL_COMMAND, {
    description:
      "Explain a symbol in a representative sample heredoc through the intel backend. Usage: /inline-format-explain-symbol <scenario> <symbol>",
    handler: async (args, ctx) => {
      const [rawScenario, ...symbolParts] = args.trim().split(/\s+/u);
      const scenario = rawScenario ? parseScenario(rawScenario) : null;
      const symbolName = symbolParts.join(" ").trim();

      if (scenario === null || symbolName.length === 0) {
        ctx.ui.notify(
          `Usage: /${EXPLAIN_SYMBOL_COMMAND} <${Object.keys(SAMPLE_COMMANDS).join("|")}> <symbol>`,
          "warning",
        );
        return;
      }

      const result = await inspectInlineFormatCommand(
        SAMPLE_COMMANDS[scenario],
        "explain-symbol",
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
    },
  });
}
