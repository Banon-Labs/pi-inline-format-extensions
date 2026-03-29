# pi-inline-format-extensions

Greenfield workspace for a host-managed inline formatting platform.

## Goal

Turn the current Python-specific inline heredoc rendering work into a host/plugin architecture where:

- the **host** package owns Pi runtime seams such as built-in `bash` overrides and compare helpers,
- language-specific packages contribute **detection and formatting metadata**,
- future language packs can be added without multiple packages fighting over the same Pi renderer.

## Workspace layout

```text
pi-inline-format-extensions/
├── packages/
│   ├── host/             # Pi-facing host/orchestrator package
│   ├── shared-contract/  # Types and registration contract for plugins
│   ├── python/           # First real language plugin
│   ├── typescript/       # Placeholder plugin scaffold
│   ├── javascript/       # Placeholder plugin scaffold
│   └── bash/             # Placeholder plugin scaffold
├── package.json
└── tsconfig.json
```

## Highlighting ownership contract

The workspace intentionally does **not** roll its own syntax highlighter.

Ownership is split this way:

- **plugins** decide whether a bash/heredoc shape matches and report language plus line boundaries,
- **shared-contract** only exposes the detection contract (`InlineFormatPlugin.detect(...)` → `InlineFormatMatch`),
- **host** owns the Pi-facing render seam and calls Pi's shipped highlighting path,
- **Pi** remains the actual source of syntax highlighting/color output.

Current evidence in code:

- `packages/host/src/runtime.ts` imports `highlightCode` from `@mariozechner/pi-coding-agent` and uses it via `highlightCodeWithRenderTheme(...)` inside the host-owned bash `renderCall(...)` path.
- `packages/python/src/index.ts` only finds heredoc ranges, extracts source text, and returns `InlineFormatMatch` metadata.
- `packages/shared-contract/src/index.ts` only defines `InlineFormatPlugin` and `InlineFormatMatch`; it does not expose any renderer/highlighter API.

This boundary is intentional and should remain stable:

- no custom tokenization engine,
- no plugin-owned ANSI coloring,
- no language-pack-specific renderer that bypasses Pi,
- no duplicate highlighting stack layered alongside Pi's shipped one.

If support expands to more languages, add or adjust plugin detection logic and keep highlighting routed through the host/Pi-owned path rather than inventing a language-specific highlighter.

## Design rule

## Design rule

Only the **host** should own Pi render/tool override seams.
Language packages should expose reusable plugin objects and detection/render metadata only.

## Current scaffold status

- `@pi-inline-format/host` loads a default plugin list and exposes `/inline-format-host-status`.
- `@pi-inline-format/shared-contract` defines the first plugin contract.
- `@pi-inline-format/python` contains the first real heredoc detector scaffold.
- `@pi-inline-format/typescript`, `@pi-inline-format/javascript`, and `@pi-inline-format/bash` are placeholders.
- The repository root now exposes `packages/host/extensions/index.ts` through the root `package.json` `pi.extensions` manifest so a future pinned git install can load the host runtime directly from the repo root.

## Commands

```bash
npm install
npm run typecheck
npm run check
```
