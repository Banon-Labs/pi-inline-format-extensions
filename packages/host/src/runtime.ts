import { bashInlineFormatPlugin } from "@pi-inline-format/bash";
import { javascriptInlineFormatPlugin } from "@pi-inline-format/javascript";
import { pythonInlineFormatPlugin } from "@pi-inline-format/python";
import type {
  InlineFormatMatch,
  InlineFormatPlugin,
} from "@pi-inline-format/shared-contract";
import { typescriptInlineFormatPlugin } from "@pi-inline-format/typescript";
import {
  createBashToolDefinition,
  createLocalBashOperations,
} from "@mariozechner/pi-coding-agent";

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

export const defaultInlineFormatPlugins = [
  pythonInlineFormatPlugin,
  typescriptInlineFormatPlugin,
  javascriptInlineFormatPlugin,
  bashInlineFormatPlugin,
] as const satisfies readonly InlineFormatPlugin[];

export const hostBashOperations = createLocalBashOperations();

export const hostBashToolDefinition = createBashToolDefinition(process.cwd(), {
  operations: hostBashOperations,
});

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
