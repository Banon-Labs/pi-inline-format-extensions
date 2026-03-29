export interface InlineFormatMatch {
  pluginName: string;
  language: string;
  startLineIndex: number;
  endLineIndex: number;
}

export interface InlineFormatPlugin {
  name: string;
  language: string;
  detect(command: string): InlineFormatMatch | null;
}

export function detectWithPlugins(
  plugins: readonly InlineFormatPlugin[],
  command: string,
): InlineFormatMatch[] {
  return plugins
    .map((plugin) => plugin.detect(command))
    .filter((match): match is InlineFormatMatch => match !== null);
}
