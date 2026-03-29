import type { InlineFormatPlugin } from "@pi-inline-format/shared-contract";

export const typescriptInlineFormatPlugin: InlineFormatPlugin = {
  name: "typescript",
  language: "typescript",
  detect: () => null,
};
