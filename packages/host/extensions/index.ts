import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  defaultInlineFormatPlugins,
  detectInlineFormatMatches,
  formatInlineFormatMatches,
  formatInlineFormatPlugins,
  hostBashOperations,
  hostBashToolDefinition,
  validateCanonicalPythonHeredocParity,
} from "../src/index.js";

const HOST_STATUS_COMMAND = "inline-format-host-status";
const SAMPLE_COMMAND = `cat > /tmp/delete.me.py <<'PY'
#!/usr/bin/env python3

print("hello")
PY`;

export default function registerInlineFormatHost(pi: ExtensionAPI): void {
  pi.registerTool(hostBashToolDefinition);

  pi.on("user_bash", async () => ({
    operations: hostBashOperations,
  }));

  pi.registerCommand(HOST_STATUS_COMMAND, {
    description: "Show the current host/plugin scaffold status.",
    handler: async (_args, ctx) => {
      const loadedPlugins = formatInlineFormatPlugins(
        defaultInlineFormatPlugins,
      );
      const matches = formatInlineFormatMatches(
        detectInlineFormatMatches(SAMPLE_COMMAND),
      );
      const parityStatus = validateCanonicalPythonHeredocParity()
        ? "pass"
        : "fail";

      ctx.ui.notify(
        [
          "pi-inline-format host scaffold is active.",
          "Host-owned seams: bash override, deterministic compare helpers, plugin orchestration.",
          `Canonical Python heredoc parity: ${parityStatus}`,
          `Plugins: ${loadedPlugins}`,
          `Sample detection: ${matches || "none"}`,
        ].join("\n"),
        "info",
      );
    },
  });
}
