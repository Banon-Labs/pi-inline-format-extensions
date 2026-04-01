import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const docsPath = path.join(process.cwd(), "docs", "index.html");
const html = readFileSync(docsPath, "utf8");
const title = "Raw multiline Bash tool call (no heredoc)";
const titleIndex = html.indexOf(title);
assert.notEqual(
  titleIndex,
  -1,
  `Expected raw Bash proof panel in ${docsPath}.`,
);

const panelEnd = html.indexOf("</section>", titleIndex);
assert.notEqual(panelEnd, -1, "Expected raw Bash proof section to terminate.");
const panel = html.slice(titleIndex, panelEnd);

assert.match(
  panel,
  /background-color:rgb\(40, 50, 40\)/u,
  "Expected the raw Bash proof panel to preserve the highlighted tool-row background.",
);
assert.match(
  panel,
  /color:rgb\(78, 201, 176\)|color:rgb\(86, 156, 214\)|color:rgb\(206, 145, 120\)/u,
  "Expected the raw Bash proof panel to contain syntax-highlight colors instead of a single plain fallback color.",
);
assert.doesNotMatch(
  panel,
  /font-weight:700;color:rgb\(181, 189, 104\)">\$ set -euo pipefail<\/span><span style="color:rgb\(181, 189, 104\)">/u,
  "Expected the raw Bash proof panel not to collapse to the plain tool-title fallback styling.",
);

console.log(`Raw Bash Pages proof check passed. docs=${docsPath}`);
