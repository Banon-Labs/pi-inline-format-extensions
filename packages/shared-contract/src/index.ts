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
