# pi-inline-format-extensions

Host/plugin workspace for a package-backed inline formatting platform.

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
│   ├── python/           # Python heredoc detector
│   ├── typescript/       # TypeScript heredoc detector
│   ├── javascript/       # JavaScript heredoc detector
│   └── bash/             # Shell/bash heredoc detector
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

Only the **host** should own Pi render/tool override seams.
Language packages should expose reusable plugin objects and detection/render metadata only.

## Current package status

- `@pi-inline-format/host`
  - owns the built-in `bash` override,
  - owns deterministic compare helpers and summary-suppression seams,
  - loads the default plugin list,
  - exposes `/inline-format-host-status`, `/inline-format-use-deterministic-model [scenario]`, `/inline-format-run-deterministic-compare [scenario]`, and `/inline-format-deterministic-status`.
- `@pi-inline-format/shared-contract`
  - defines the stable detection contract (`InlineFormatPlugin` and `InlineFormatMatch`).
- `@pi-inline-format/python`, `@pi-inline-format/javascript`, `@pi-inline-format/typescript`, and `@pi-inline-format/bash`
  - provide heredoc detection only,
  - report language plus line boundaries,
  - do not own any Pi renderer/highlighter seams.
- The repository root exposes `packages/host/extensions/index.ts` through the root `package.json` `pi.extensions` manifest so both local-path development and pinned git installs can load the same root package surface.

## Install, update, and release expectations

### Preferred package surfaces

- **Stable consumer installs** should use a pinned git source at the repository root, for example:
  - `git:github.com/Banon-Labs/pi-inline-format-extensions@<commit-or-tag>`
- **Unpublished local development** should use the repository root path, not `packages/host` directly:
  - `../../pi-inline-format-extensions`

The root surface is the durable contract. Consumers should not depend on an internal package path when a root-level package source is available.

### Release order

1. Land and validate host/plugin changes in this repo first.
2. Push the updated commit or publish a stable ref/tag here.
3. Repin the consumer repo (`pi-inline-format`) to that published git ref.
4. Rerun consumer validation there (`pi list`, `npm run check`, and any scenario-specific proof flows required by the change).

### Growth rule for new language support

When adding support for another heredoc language:

- extend detection in a plugin package,
- keep the host as the only owner of Pi runtime/render seams,
- keep syntax highlighting routed through Pi's shipped `highlightCode(...)` path,
- add deterministic and proof coverage before asking consumers to repin.

## Commands

```bash
npm install
npm run typecheck
npm run check
```
