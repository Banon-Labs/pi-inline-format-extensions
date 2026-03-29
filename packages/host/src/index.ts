import { bashInlineFormatPlugin } from "@pi-inline-format/bash";
import { javascriptInlineFormatPlugin } from "@pi-inline-format/javascript";
import { pythonInlineFormatPlugin } from "@pi-inline-format/python";
import {
  detectWithPlugins,
  type InlineFormatMatch,
  type InlineFormatPlugin,
} from "@pi-inline-format/shared-contract";
import { typescriptInlineFormatPlugin } from "@pi-inline-format/typescript";

export const defaultInlineFormatPlugins: readonly InlineFormatPlugin[] = [
  pythonInlineFormatPlugin,
  typescriptInlineFormatPlugin,
  javascriptInlineFormatPlugin,
  bashInlineFormatPlugin,
];

export function detectInlineFormatMatches(
  command: string,
): InlineFormatMatch[] {
  return detectWithPlugins(defaultInlineFormatPlugins, command);
}
