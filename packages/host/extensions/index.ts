import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  defaultInlineFormatPlugins,
  detectInlineFormatMatches,
} from "../src/index.js";

const HOST_STATUS_COMMAND = "inline-format-host-status";
const SAMPLE_COMMAND = `cat > /tmp/delete.me.py <<'PY'
#!/usr/bin/env python3

print("hello")
PY`;

export default function registerInlineFormatHost(pi: ExtensionAPI): void {
  pi.registerCommand(HOST_STATUS_COMMAND, {
    description: "Show the current host/plugin scaffold status.",
    handler: async (_args, ctx) => {
      await Promise.resolve();
      const loadedPlugins = defaultInlineFormatPlugins
        .map((plugin) => plugin.name)
        .join(", ");
      const matches = detectInlineFormatMatches(SAMPLE_COMMAND)
        .map(
          (match) =>
            `${match.pluginName}:${match.language}[${String(match.startLineIndex)}-${String(match.endLineIndex)}]`,
        )
        .join(", ");

      ctx.ui.notify(
        [
          "pi-inline-format host scaffold is active.",
          `Plugins: ${loadedPlugins}`,
          `Sample detection: ${matches || "none"}`,
        ].join("\n"),
        "info",
      );
    },
  });
}
