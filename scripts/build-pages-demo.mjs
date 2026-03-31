import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const scenarios = [
  {
    key: "python",
    label: "Python",
    model: "inline-deterministic/canonical-heredoc-compare",
    prompt:
      "Use bash to write python to a file using heredocs. Execute into /tmp/delete.me.py",
  },
  {
    key: "javascript",
    label: "JavaScript",
    model: "inline-deterministic/javascript-heredoc-compare",
    prompt:
      "Use bash to run javascript from a heredoc with node. Keep the transcript inline and normal.",
  },
  {
    key: "typescript",
    label: "TypeScript",
    model: "inline-deterministic/typescript-heredoc-compare",
    prompt:
      "Use bash to write typescript to a file using heredocs. Execute into /tmp/delete.me.ts",
  },
  {
    key: "bash",
    label: "Bash",
    model: "inline-deterministic/bash-heredoc-compare",
    prompt:
      "Use bash to run shell from a heredoc with bash. Keep the transcript inline and normal.",
  },
];

function run(command) {
  return execSync(command, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function shellEscape(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function captureScenario(scenario) {
  const session = `pi-pages-${scenario.key}-${process.pid}-${Date.now()}`;
  const cmd = [
    "pi",
    "--offline",
    "--extension",
    "./packages/host/extensions/index.ts",
    "--model",
    scenario.model,
    shellEscape(scenario.prompt),
  ].join(" ");

  run(
    `tmux new-session -d -s ${shellEscape(session)} -c ${shellEscape(repoRoot)} ${shellEscape(cmd)}`,
  );
  try {
    execSync("sleep 18");
    const paneId = run(
      `tmux list-panes -t ${shellEscape(session)} -F '#{pane_id}'`,
    ).trim();
    return run(`tmux capture-pane -p -e -S -220 -t ${shellEscape(paneId)}`);
  } finally {
    try {
      run(`tmux kill-session -t ${shellEscape(session)}`);
    } catch {
      // ignore cleanup failures
    }
  }
}

function extractBody(capture, prompt) {
  const startIndex = capture.indexOf(prompt);
  if (startIndex < 0) {
    throw new Error(`Prompt not found in capture: ${prompt}`);
  }

  const regionStart = capture.lastIndexOf("\n", startIndex - 1);
  const tookIndex = capture.indexOf("Took ", startIndex);
  if (tookIndex < 0) {
    throw new Error(`"Took" line not found for prompt: ${prompt}`);
  }
  const regionEnd = capture.indexOf("\n", tookIndex);
  return capture.slice(regionStart + 1, regionEnd).trimEnd();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function xterm256ToRgb(code) {
  const basic = [
    [0, 0, 0],
    [128, 0, 0],
    [0, 128, 0],
    [128, 128, 0],
    [0, 0, 128],
    [128, 0, 128],
    [0, 128, 128],
    [192, 192, 192],
    [128, 128, 128],
    [255, 0, 0],
    [0, 255, 0],
    [255, 255, 0],
    [0, 0, 255],
    [255, 0, 255],
    [0, 255, 255],
    [255, 255, 255],
  ];

  if (code < 16) {
    const [r, g, b] = basic[code] ?? [255, 255, 255];
    return `rgb(${r}, ${g}, ${b})`;
  }

  if (code >= 232) {
    const value = 8 + (code - 232) * 10;
    return `rgb(${value}, ${value}, ${value})`;
  }

  const adjusted = code - 16;
  const r = Math.floor(adjusted / 36);
  const g = Math.floor((adjusted % 36) / 6);
  const b = adjusted % 6;
  const scale = [0, 95, 135, 175, 215, 255];
  return `rgb(${scale[r]}, ${scale[g]}, ${scale[b]})`;
}

function ansiToHtml(input) {
  let index = 0;
  let html = "";
  let open = false;
  const state = {
    bold: false,
    italic: false,
    underline: false,
    fg: null,
    bg: null,
  };

  function styleString() {
    const styles = [];
    if (state.bold) styles.push("font-weight:700");
    if (state.italic) styles.push("font-style:italic");
    if (state.underline) styles.push("text-decoration:underline");
    if (state.fg) styles.push(`color:${state.fg}`);
    if (state.bg) styles.push(`background-color:${state.bg}`);
    return styles.join(";");
  }

  function reopen() {
    if (open) {
      html += "</span>";
      open = false;
    }
    const style = styleString();
    if (style.length > 0) {
      html += `<span style="${style}">`;
      open = true;
    }
  }

  function handleCodes(rawCodes) {
    const codes = rawCodes.length === 0 ? [0] : rawCodes;
    for (let i = 0; i < codes.length; i += 1) {
      const code = codes[i];
      if (Number.isNaN(code)) continue;
      if (code === 0) {
        state.bold = false;
        state.italic = false;
        state.underline = false;
        state.fg = null;
        state.bg = null;
      } else if (code === 1) {
        state.bold = true;
      } else if (code === 22) {
        state.bold = false;
      } else if (code === 3) {
        state.italic = true;
      } else if (code === 23) {
        state.italic = false;
      } else if (code === 4) {
        state.underline = true;
      } else if (code === 24) {
        state.underline = false;
      } else if (code === 39) {
        state.fg = null;
      } else if (code === 49) {
        state.bg = null;
      } else if (code >= 30 && code <= 37) {
        state.fg = xterm256ToRgb(code - 30);
      } else if (code >= 90 && code <= 97) {
        state.fg = xterm256ToRgb(code - 90 + 8);
      } else if (code >= 40 && code <= 47) {
        state.bg = xterm256ToRgb(code - 40);
      } else if (code >= 100 && code <= 107) {
        state.bg = xterm256ToRgb(code - 100 + 8);
      } else if ((code === 38 || code === 48) && codes[i + 1] === 2) {
        const r = codes[i + 2] ?? 255;
        const g = codes[i + 3] ?? 255;
        const b = codes[i + 4] ?? 255;
        if (code === 38) state.fg = `rgb(${r}, ${g}, ${b})`;
        else state.bg = `rgb(${r}, ${g}, ${b})`;
        i += 4;
      } else if ((code === 38 || code === 48) && codes[i + 1] === 5) {
        const colorCode = codes[i + 2] ?? 15;
        if (code === 38) state.fg = xterm256ToRgb(colorCode);
        else state.bg = xterm256ToRgb(colorCode);
        i += 2;
      }
    }
    reopen();
  }

  while (index < input.length) {
    const char = input[index];
    if (char === "\u001b") {
      const next = input[index + 1];
      if (next === "[") {
        const end = input.slice(index + 2).search(/[A-Za-z]/);
        if (end >= 0) {
          const sequence = input.slice(index + 2, index + 2 + end);
          const command = input[index + 2 + end];
          if (command === "m") {
            const codes =
              sequence.length === 0 ? [] : sequence.split(";").map(Number);
            handleCodes(codes);
          }
          index += end + 3;
          continue;
        }
      }
      index += 1;
      continue;
    }

    html += escapeHtml(char);
    index += 1;
  }

  if (open) {
    html += "</span>";
  }

  return html;
}

const captures = scenarios.map((scenario) => ({
  ...scenario,
  body: ansiToHtml(extractBody(captureScenario(scenario), scenario.prompt)),
}));

const cards = captures
  .map(
    (scenario) => `<section class="example">
      <div class="example-header">
        <strong>${scenario.label}</strong>
        <span>actual ANSI capture from Pi</span>
      </div>
      <pre>${scenario.body}</pre>
    </section>`,
  )
  .join("\n");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>pi-inline-format smarter highlighting demo</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0a0f1d;
        --panel: #111a30;
        --border: #2b3a63;
        --text: #edf2ff;
        --muted: #9fb0d9;
        --accent: #8be9fd;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: radial-gradient(circle at top, #16223f 0%, #0a0f1d 55%);
        color: var(--text);
      }
      main { max-width: 1280px; margin: 0 auto; padding: 56px 20px 80px; }
      .eyebrow {
        color: var(--accent);
        font-size: 0.88rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h1 { margin: 10px 0 14px; font-size: clamp(2.3rem, 5vw, 4rem); line-height: 1.05; }
      .lead { max-width: 80ch; color: var(--muted); line-height: 1.75; font-size: 1.06rem; }
      .badge-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
      .badge {
        padding: 8px 12px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgba(139, 233, 253, 0.08);
        color: var(--text);
        font-size: 0.94rem;
      }
      .pi-window {
        margin-top: 28px;
        background: rgba(17, 26, 48, 0.92);
        border: 1px solid var(--border);
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 22px 64px rgba(0, 0, 0, 0.28);
      }
      .pi-topbar, .pi-statusbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.03);
        color: var(--muted);
        font-size: 0.92rem;
      }
      .pi-topbar { border-bottom: 1px solid var(--border); }
      .pi-statusbar { border-top: 1px solid var(--border); }
      .dots { display: flex; gap: 8px; }
      .dot { width: 10px; height: 10px; border-radius: 999px; }
      .red { background: #ff5f57; }
      .yellow { background: #ffbd2e; }
      .green { background: #28c840; }
      .pi-body { padding: 20px; }
      .examples {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
      }
      .example, .card {
        background: rgba(17, 26, 48, 0.92);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 16px;
        overflow: hidden;
      }
      .example-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        font-size: 0.92rem;
      }
      .example-header strong { color: var(--text); }
      .example-header span { color: var(--muted); }
      pre {
        margin: 0;
        padding: 14px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 0.92rem;
        line-height: 1.5;
        color: var(--text);
        font-family: "SFMono-Regular", ui-monospace, "Cascadia Code", Menlo, Consolas, monospace;
      }
      .links {
        margin-top: 24px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 18px;
      }
      .card {
        padding: 22px;
        border-color: var(--border);
        box-shadow: 0 22px 64px rgba(0, 0, 0, 0.28);
      }
      h2 { margin-top: 0; }
      p, li { color: var(--muted); line-height: 1.75; }
      a { color: var(--accent); }
      ul { padding-left: 20px; }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">GitHub Pages demo surface</div>
      <h1>Actual ANSI captures from Pi for all four shipped inline-format examples</h1>
      <p class="lead">
        This page is built from actual ANSI captures of Pi rendering the deterministic shipped samples for Python, JavaScript, TypeScript, and Bash. It is still a demo surface only: authoritative proof remains the repo-local regressions, the full validation sweep, and tmux smoke evidence.
      </p>
      <div class="badge-row">
        <div class="badge">Actual ANSI capture</div>
        <div class="badge">4 shipped language examples</div>
        <div class="badge">Presentation, not proof</div>
      </div>

      <section class="pi-window">
        <div class="pi-topbar">
          <div class="dots"><span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span></div>
          <div>pi · inline-format demo package loaded</div>
          <div>repo: Banon-Labs/pi-inline-format-extensions</div>
        </div>
        <div class="pi-body">
          <div class="examples">
            ${cards}
          </div>
        </div>
        <div class="pi-statusbar">
          <span>render source: actual Pi ANSI captures</span>
          <span>proof source: repo tests + tmux evidence</span>
        </div>
      </section>

      <section class="links">
        <article class="card">
          <h2>Authoritative proof links</h2>
          <ul>
            <li><a href="https://github.com/Banon-Labs/pi-inline-format-extensions/blob/main/packages/host/src/shipped-python-smarter-highlight.test.ts">Python smarter-highlight regression</a></li>
            <li><a href="https://github.com/Banon-Labs/pi-inline-format-extensions/blob/main/packages/host/src/shipped-javascript-smarter-highlight.test.ts">JavaScript smarter-highlight regression</a></li>
            <li><a href="https://github.com/Banon-Labs/pi-inline-format-extensions/blob/main/packages/host/src/shipped-typescript-smarter-highlight.test.ts">TypeScript smarter-highlight regression</a></li>
            <li><a href="https://github.com/Banon-Labs/pi-inline-format-extensions/blob/main/packages/host/src/shipped-bash-smarter-highlight.test.ts">Bash smarter-highlight regression</a></li>
            <li><a href="https://github.com/Banon-Labs/pi-inline-format-extensions/blob/main/packages/host/src/shipped-python-tool-row.test.ts">Python inspection-vs-tool-row proof</a></li>
          </ul>
        </article>
        <article class="card">
          <h2>Trust boundary</h2>
          <p>
            These panels are derived from real deterministic Pi captures rather than handwritten mock snippets. GitHub Pages is still not the proof surface; it is only a readable presentation layer over proof that already exists elsewhere in the repo and bd comments.
          </p>
        </article>
      </section>
    </main>
  </body>
</html>`;

writeFileSync(path.join(repoRoot, "docs/index.html"), html);
