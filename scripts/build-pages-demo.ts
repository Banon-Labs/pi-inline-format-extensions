import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import {
  DEMO_LANGUAGE_ORDER,
  DEMO_SAMPLE_VARIANTS,
  DEMO_VARIANT_ORDER,
  type DemoLanguage,
  type DemoSample,
  type DemoVariant,
} from "../packages/host/src/demo-samples.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const scenarios = DEMO_LANGUAGE_ORDER.flatMap((language) =>
  DEMO_VARIANT_ORDER.map((variant) => DEMO_SAMPLE_VARIANTS[language][variant]),
);

const RAW_BASH_PROOF_COMMAND = [
  "set -euo pipefail",
  'printf "%s\\n" "$HOME"',
  "if [[ -d src ]]; then",
  '  echo "src exists"',
  "fi",
].join("\n");

function run(command: string): string {
  return execSync(command, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function captureScenario(scenario: DemoSample): string {
  const session = `pi-pages-${scenario.key}-${process.pid}-${Date.now()}`;
  const cmd = [
    "pi",
    "--offline",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--extension",
    "./packages/host/extensions/index.ts",
    "--model",
    `inline-deterministic/${scenario.model}`,
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
    return run(`tmux capture-pane -p -e -S -420 -t ${shellEscape(paneId)}`);
  } finally {
    try {
      run(`tmux kill-session -t ${shellEscape(session)}`);
    } catch {
      // ignore cleanup failures
    }
  }
}

function captureRawBashProof(): string {
  const session = `pi-pages-raw-bash-${process.pid}-${Date.now()}`;
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), "pi-pages-raw-bash-"));
  const cmd = [
    "pi",
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
  ].join(" ");

  run(
    `tmux new-session -d -s ${shellEscape(session)} -c ${shellEscape(projectRoot)} ${shellEscape(cmd)}`,
  );
  try {
    execSync("sleep 8");
    const paneId = run(
      `tmux list-panes -t ${shellEscape(session)} -F '#{pane_id}'`,
    ).trim();
    run(
      `tmux send-keys -t ${shellEscape(paneId)} -l ${shellEscape(`!${RAW_BASH_PROOF_COMMAND}`)}`,
    );
    run(`tmux send-keys -t ${shellEscape(paneId)} Enter`);

    for (let attempt = 0; attempt < 15; attempt += 1) {
      execSync("sleep 2");
      const capture = run(
        `tmux capture-pane -p -e -S -260 -t ${shellEscape(paneId)}`,
      );

      if (
        capture.includes("\u001b[48;2;40;50;40m") &&
        capture.includes("\u001b[38;2;78;201;176m") &&
        capture.includes("Took ")
      ) {
        return capture;
      }
    }

    throw new Error(
      "Raw Bash proof capture did not include syntax-highlighted Bash output. Reinstall the released inline-format packages before rebuilding the Pages demo.",
    );
  } finally {
    try {
      run(`tmux kill-session -t ${shellEscape(session)}`);
    } catch {
      // ignore cleanup failures
    }
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

function extractRawBashBody(capture: string): string {
  const rowStartMarker = "\u001b[48;2;40;50;40m";
  const startIndex = capture.indexOf(rowStartMarker);
  if (startIndex < 0) {
    throw new Error(
      `Raw bash proof row start marker not found in capture: ${rowStartMarker}`,
    );
  }

  const tookIndex = capture.indexOf("Took ", startIndex);
  if (tookIndex >= 0) {
    const regionEnd = capture.indexOf("\n", tookIndex);
    return capture.slice(startIndex, regionEnd).trimEnd();
  }

  const separatorIndex = capture.indexOf("────────────────", startIndex);
  if (separatorIndex < 0) {
    throw new Error(
      'Neither a "Took" line nor a trailing separator was found for the raw bash proof capture',
    );
  }

  const regionEnd = capture.lastIndexOf("\n", separatorIndex - 1);
  return capture.slice(startIndex, regionEnd).trimEnd();
}

function extractBody(capture: string, prompt: string): string {
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function xterm256ToRgb(code: number): string {
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
  ] as const;

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

function ansiToHtml(input: string): string {
  let index = 0;
  let html = "";
  let open = false;
  const state = {
    bold: false,
    italic: false,
    underline: false,
    fg: null as string | null,
    bg: null as string | null,
  };

  function styleString(): string {
    const styles: string[] = [];
    if (state.bold) styles.push("font-weight:700");
    if (state.italic) styles.push("font-style:italic");
    if (state.underline) styles.push("text-decoration:underline");
    if (state.fg) styles.push(`color:${state.fg}`);
    if (state.bg) styles.push(`background-color:${state.bg}`);
    return styles.join(";");
  }

  function reopen(): void {
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

  function handleCodes(rawCodes: number[]): void {
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

const rawBashProof = {
  title: "Raw multiline Bash tool call (no heredoc)",
  body: ansiToHtml(extractRawBashBody(captureRawBashProof())),
};

const capturesByLanguage = Object.fromEntries(
  DEMO_LANGUAGE_ORDER.map((language) => [
    language,
    Object.fromEntries(
      DEMO_VARIANT_ORDER.map((variant) => [
        variant,
        captures.find(
          (capture) =>
            capture.language === language && capture.variant === variant,
        )!,
      ]),
    ) as Record<DemoVariant, (typeof captures)[number]>,
  ]),
) as Record<DemoLanguage, Record<DemoVariant, (typeof captures)[number]>>;

function renderLanguageCard(language: DemoLanguage): string {
  const variants = capturesByLanguage[language];
  const label = variants.standard.label;
  const defaultVariant: DemoVariant = "standard";
  const panels = DEMO_VARIANT_ORDER.map((variant) => {
    const sample = variants[variant];
    const hidden = variant === defaultVariant ? "" : ' hidden="hidden"';
    return `<section class="variant-panel${variant === defaultVariant ? " is-active" : ""}" data-variant="${variant}"${hidden}>
      <div class="variant-meta">
        <strong>${sample.variantLabel} example</strong>
        <span>actual ANSI capture from Pi · source: repo sample + deterministic compare path</span>
      </div>
      <pre>${sample.body}</pre>
    </section>`;
  }).join("\n");

  return `<section class="example" data-language="${language}">
    <div class="example-header">
      <div class="example-title">
        <strong>${label}</strong>
        <span>actual ANSI capture from Pi</span>
      </div>
      <label class="variant-picker">
        <span>Example</span>
        <select data-variant-select>
          <option value="standard">Explicit basic</option>
          <option value="eof">EOF basic</option>
          <option value="verbose">Verbose</option>
        </select>
      </label>
    </div>
    ${panels}
  </section>`;
}

const cards = DEMO_LANGUAGE_ORDER.map(renderLanguageCard).join("\n");

const rawBashFeature = `<section class="card raw-bash-proof">
  <div class="example-header">
    <div class="example-title">
      <strong>${rawBashProof.title}</strong>
      <span>actual ANSI capture from Pi · interactive ! bash path · no heredoc opener</span>
    </div>
  </div>
  <div class="variant-meta">
    <strong>Why it matters</strong>
    <span>The command body has no heredoc opener, but the tool row still renders it as Bash by default.</span>
  </div>
  <pre>${rawBashProof.body}</pre>
</section>`;

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
      main { max-width: 1400px; margin: 0 auto; padding: 56px 20px 80px; }
      .eyebrow {
        color: var(--accent);
        font-size: 0.88rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h1 { margin: 10px 0 14px; font-size: clamp(2.3rem, 5vw, 4rem); line-height: 1.05; }
      .lead { max-width: 90ch; color: var(--muted); line-height: 1.75; font-size: 1.06rem; }
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
      .pi-topbar,
      .pi-statusbar {
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
      .pi-caption {
        padding: 14px 16px;
        border-top: 1px solid rgba(255,255,255,0.08);
        background: rgba(255, 255, 255, 0.04);
      }
      .pi-caption p {
        margin: 0;
        color: var(--muted);
        line-height: 1.7;
        font-size: 0.92rem;
      }
      .pi-caption-links {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .dots { display: flex; gap: 8px; }
      .dot { width: 10px; height: 10px; border-radius: 999px; }
      .red { background: #ff5f57; }
      .yellow { background: #ffbd2e; }
      .green { background: #28c840; }
      .pi-body { padding: 20px; }
      .examples {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 16px;
      }
      .example,
      .card {
        background: rgba(17, 26, 48, 0.92);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 16px;
        overflow: hidden;
      }
      .raw-bash-proof {
        margin-bottom: 16px;
      }
      .example-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        font-size: 0.92rem;
      }
      .example-title {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .example-title strong { color: var(--text); }
      .example-title span { color: var(--muted); }
      .variant-picker {
        display: flex;
        flex-direction: column;
        gap: 6px;
        color: var(--muted);
      }
      .variant-picker select {
        min-width: 130px;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: rgba(255,255,255,0.05);
        color: var(--text);
      }
      .variant-panel[hidden] { display: none; }
      .variant-meta {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 14px;
        background: rgba(255,255,255,0.03);
        border-bottom: 1px solid rgba(255,255,255,0.08);
        font-size: 0.86rem;
      }
      .variant-meta strong { color: var(--text); }
      .variant-meta span { color: var(--muted); }
      pre {
        margin: 0;
        padding: 14px;
        background: rgb(40, 50, 40);
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 38rem;
        font-size: 0.9rem;
        line-height: 1.5;
        color: var(--text);
        font-family: "SFMono-Regular", ui-monospace, "Cascadia Code", Menlo, Consolas, monospace;
      }
      .links {
        margin-top: 24px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
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
      @media (max-width: 760px) {
        .example-header,
        .variant-meta,
        .pi-topbar,
        .pi-statusbar {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">GitHub Pages demo surface</div>
      <h1>Actual ANSI captures from Pi for explicit-marker basics, generic EOF basics, verbose inline-format examples, and a raw multiline Bash tool call proof across all four shipped languages</h1>
      <p class="lead">
        This page is built from actual ANSI captures of Pi rendering deterministic shipped samples for Python, JavaScript, TypeScript, and Bash, plus a dedicated raw multiline Bash proof that uses no heredoc opener at all. Each language includes a basic explicit-marker example, a basic generic-EOF example, and a longer verbose variant selectable from a dropdown, while the extra Bash panel shows the newer default-Bash highlighting path directly. It remains a demo surface only: authoritative proof stays in repo-local regressions, validation runs, and tmux smoke evidence.
      </p>
      <div class="badge-row">
        <div class="badge">Actual ANSI capture</div>
        <div class="badge">4 shipped languages</div>
        <div class="badge">3 variants per language</div>
        <div class="badge">Raw Bash no-heredoc proof</div>
        <div class="badge">Presentation, not proof</div>
      </div>

      <section class="pi-window">
        <div class="pi-topbar">
          <div class="dots"><span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span></div>
          <div>pi · inline-format demo package loaded</div>
          <div>repo: Banon-Labs/pi-inline-format-extensions</div>
        </div>
        <div class="pi-body">
          ${rawBashFeature}
          <div class="examples">
            ${cards}
          </div>
        </div>
        <div class="pi-caption">
          <p>
            Caption: every transcript variant above — including the raw multiline Bash proof with no heredoc opener — is derived from an actual ANSI capture collected from Pi running in tmux; the outer page frame is presentation chrome, not a literal full-screen Pi screenshot. Method sources:
            <span class="pi-caption-links">
              <a href="https://github.com/Banon-Labs/pi-inline-format-extensions/blob/main/scripts/build-pages-demo.ts">capture + ANSI-to-HTML generator</a>,
              <a href="https://github.com/Banon-Labs/pi-inline-format-extensions/blob/main/packages/host/src/demo-samples.ts">explicit + EOF + verbose sample source definitions</a>,
              <a href="https://github.com/Banon-Labs/pi-inline-format-extensions/blob/main/packages/host/src/runtime.ts">deterministic scenario registration</a>,
              <a href="https://github.com/Banon-Labs/pi-inline-format-extensions/blob/main/packages/host/extensions/index.ts">extension sample command usage</a>,
              <a href="https://github.com/Banon-Labs/pi-inline-format-extensions/blob/main/.github/workflows/pages.yml">Pages publish workflow</a>
            </span>
          </p>
        </div>
        <div class="pi-statusbar">
          <span>render source: actual Pi ANSI captures</span>
          <span>proof source: repo tests + tmux evidence</span>
        </div>
      </section>

      <section class="links">
        <article class="card">
          <h2>Trust boundary</h2>
          <p>
            These panels are derived from real Pi ANSI captures rather than handwritten mock snippets. The language grid comes from deterministic compare flows, and the extra raw Bash panel comes from Pi's interactive ! bash path to prove the no-heredoc default-highlighting behavior directly. GitHub Pages is still not the proof surface; it is only a readable presentation layer over proof that already exists elsewhere in the repo and bd comments.
          </p>
        </article>
        <article class="card">
          <h2>Capture generation sources</h2>
          <ul>
            <li><a href="https://github.com/Banon-Labs/pi-inline-format-extensions/blob/main/scripts/build-pages-demo.ts">scripts/build-pages-demo.ts</a> — launches Pi in tmux, captures ANSI output for the explicit-marker/EOF/verbose grids plus the raw multiline Bash proof, and converts SGR styling into HTML spans</li>
            <li><a href="https://github.com/Banon-Labs/pi-inline-format-extensions/blob/main/packages/host/src/demo-samples.ts">packages/host/src/demo-samples.ts</a> — repo-grounded explicit-marker, generic-EOF, and verbose examples for Python, JavaScript, TypeScript, and Bash</li>
            <li><a href="https://github.com/Banon-Labs/pi-inline-format-extensions/blob/main/packages/host/src/runtime.ts">packages/host/src/runtime.ts</a> — deterministic compare registration for the page capture models</li>
            <li><a href="https://github.com/Banon-Labs/pi-inline-format-extensions/blob/main/.github/workflows/pages.yml">.github/workflows/pages.yml</a> — GitHub Pages publish path</li>
          </ul>
        </article>
        <article class="card">
          <h2>Verbose example reference influences</h2>
          <ul>
            <li><a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types">MDN JavaScript grammar and types</a> plus related MDN material on template literals, destructuring, and regular expressions</li>
            <li><a href="https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html">TypeScript handbook template literal types</a> and related handbook sections on unions and literal types</li>
            <li><a href="https://www.gnu.org/software/bash/manual/html_node/Arrays.html">GNU Bash arrays</a> and <a href="https://www.gnu.org/software/bash/manual/html_node/Shell-Parameter-Expansion.html">parameter expansion</a> reference material</li>
            <li>The verbose Python variant is adapted from the provided syntax-heavy corpus and normalized into a runnable inline heredoc sample</li>
          </ul>
        </article>
      </section>
    </main>
    <script>
      for (const example of document.querySelectorAll('[data-language]')) {
        const select = example.querySelector('[data-variant-select]');
        const panels = example.querySelectorAll('.variant-panel');
        if (!(select instanceof HTMLSelectElement)) continue;
        const update = () => {
          for (const panel of panels) {
            const active = panel.getAttribute('data-variant') === select.value;
            panel.toggleAttribute('hidden', !active);
            panel.classList.toggle('is-active', active);
          }
        };
        select.addEventListener('change', update);
        update();
      }
    </script>
  </body>
</html>`;

const formattedHtml = await prettier.format(html, { parser: "html" });
writeFileSync(path.join(repoRoot, "docs/index.html"), formattedHtml);
