import type { InlineFormatPlugin } from "@pi-inline-format/shared-contract";

export const bashInlineFormatPlugin: InlineFormatPlugin = {
  name: "bash",
  language: "bash",
  detect: () => null,
};
