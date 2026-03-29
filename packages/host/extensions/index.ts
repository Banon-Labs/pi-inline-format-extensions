import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  INLINE_DETERMINISTIC_RUN_COMMAND,
  INLINE_DETERMINISTIC_STATUS_COMMAND,
  defaultInlineFormatPlugins,
  detectInlineFormatMatches,
  formatInlineFormatMatches,
  formatInlineFormatPlugins,
  registerHostRuntimeSeams,
  validateCanonicalPythonHeredocParity,
} from "../src/index.js";

const HOST_STATUS_COMMAND = "inline-format-host-status";
const SAMPLE_COMMANDS = {
  python: `cat > /tmp/delete.me.py <<'PY'
#!/usr/bin/env python3

print("hello")
PY`,
  javascript: `node <<'JS'
console.log("hello from js")
JS`,
  typescript: `cat > /tmp/delete.me.ts <<'TS'
const answer: number = 42;
console.log(answer);
TS`,
  bash: `bash <<'SH'
echo "hello from sh"
SH`,
} as const;

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
        ].join("\n"),
        "info",
      );
    },
  });
}
