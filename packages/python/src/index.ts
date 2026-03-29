import type {
  InlineFormatMatch,
  InlineFormatPlugin,
} from "@pi-inline-format/shared-contract";

const PYTHON_HEREDOC_MARKERS = ["<<'PY'", '<<"PY"', "<<PY"];
const PYTHON_HEREDOC_TERMINATOR = "PY";

function detectPythonHeredoc(command: string): InlineFormatMatch | null {
  const lines = command.split("\n");
  const startLineIndex = lines.findIndex((line) =>
    PYTHON_HEREDOC_MARKERS.some((marker) => line.includes(marker)),
  );

  if (startLineIndex === -1) {
    return null;
  }

  const endLineIndex = lines.findIndex(
    (line, index) =>
      index > startLineIndex && line === PYTHON_HEREDOC_TERMINATOR,
  );

  if (endLineIndex <= startLineIndex + 1) {
    return null;
  }

  return {
    pluginName: "python",
    language: "python",
    startLineIndex: startLineIndex + 1,
    endLineIndex: endLineIndex - 1,
  };
}

export const pythonInlineFormatPlugin: InlineFormatPlugin = {
  name: "python",
  language: "python",
  detect: detectPythonHeredoc,
};
