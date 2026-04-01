# pi-inline-format-extensions

[![check](https://github.com/Banon-Labs/pi-inline-format-extensions/actions/workflows/check.yml/badge.svg)](https://github.com/Banon-Labs/pi-inline-format-extensions/actions/workflows/check.yml)

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
│   ├── intel/            # Semantic inspection / meaning-aware companion layer
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

## Semantic/intel ownership contract

The new semantic/intel layer is **not** a language plugin and **not** a renderer owner.

Its role is to make future meaning-aware inspection possible without breaking the current host/plugin split:

- **intel** owns virtual-document and inspection contracts,
- **intel** may later orchestrate compiler/LSP backends,
- **host** may call into intel for inspect/explain workflows,
- **language plugins** stay focused on heredoc detection and language metadata,
- **host/Pi** remain responsible for visual rendering and syntax-highlighting output.

This keeps the architecture additive:

- plugins detect,
- host renders,

- intel explains meaning.

## Design rule

Only the **host** should own Pi render/tool override seams.
Language packages should expose reusable plugin objects and detection/render metadata only.
The **intel** package should expose meaning-oriented contracts and backend orchestration only.

## Current package status

- `@pi-inline-format/host`
  - owns the built-in `bash` override,
  - owns deterministic compare helpers and summary-suppression seams,
  - loads the default plugin list,
  - exposes `/inline-format-host-status`, `/inline-format-use-deterministic-model [scenario]`, `/inline-format-run-deterministic-compare [scenario]`, `/inline-format-deterministic-status`, `/inline-format-intel-status`, `/inline-format-inspect-sample <scenario>`, `/inline-format-explain-symbol <scenario> <symbol>`, `/inline-format-find-definition <scenario> <symbol>`, `/inline-format-highlight-symbol <scenario> <symbol>`, `/inline-format-semantic-tokens <scenario>`, and `/inline-format-diagnostics-sample <scenario>`.
- `@pi-inline-format/shared-contract`
  - defines the stable detection contract (`InlineFormatPlugin` and `InlineFormatMatch`).
- `@pi-inline-format/intel`
  - defines the semantic/inspection contracts,
  - owns virtual-document and inspection request/result types,
  - now ships a TypeScript language-service backend for JavaScript/TypeScript hover, explain-symbol, definition, document-highlight, diagnostics, and semantic-token payload flows,
  - now ships a basedpyright prototype backend for Python diagnostics, hover/explain-symbol, definition, and semantic-token payload flows,
  - now ships a bash-language-server plus ShellCheck prototype backend for Bash diagnostics, hover-like explain, definition, and document-highlight flows,
  - still falls back to a scaffold backend for unsupported languages and any inspection kinds not yet implemented by a real backend,
  - does not own rendering or syntax-highlighting seams.
- `@pi-inline-format/python`, `@pi-inline-format/javascript`, `@pi-inline-format/typescript`, and `@pi-inline-format/bash`
  - provide heredoc detection only,
  - report language plus line boundaries,
  - do not own any Pi renderer/highlighter seams.
- The repository root exposes `packages/host/extensions/index.ts` through the root `package.json` `pi.extensions` manifest so both local-path development and pinned git installs can load the same root package surface.

## Shipped today

This repo is the source of truth for the package-backed capabilities shipped by `Banon-Labs/pi-inline-format-extensions`.

| Language     | Detects this heredoc? | Basic highlighting | Inspection backend                                                             | Smarter highlighting in the normal tool row | Status                                                                                                                |
| ------------ | --------------------- | ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Python       | ✅                    | ✅                 | ✅ `basedpyright` prototype + semantic-token payloads                          | ✅                                          | shipped for the proven `/tmp/delete.me.py` sample via a host-owned bounded Python smarter-highlight seam              |
| JavaScript   | ✅                    | ✅                 | ✅ TypeScript language service                                                 | ✅                                          | shipped                                                                                                               |
| TypeScript   | ✅                    | ✅                 | ✅ TypeScript language service                                                 | ✅                                          | shipped                                                                                                               |
| Bash / shell | ✅                    | ✅                 | ⚠️ partial (`bash-language-server` + `shellcheck`; no semantic token provider) | ✅                                          | shipped via a host-owned smarter-highlighting seam; intel/backend semantic-token payloads remain intentionally absent |

- Python now participates in smarter tool-row highlighting for the proven shipped `/tmp/delete.me.py` sample through a host-owned bounded Python token collector in `packages/host`, backed by repo-local regression proof plus parent CLI-app tmux evidence.
- JavaScript and TypeScript feed semantic tokens into the normal bash tool-row render path.
- Bash now participates in smarter tool-row highlighting through a host-owned Bash token/span collector in `packages/host`.
- The Bash inspection backend still does **not** advertise semantic-token payloads, so `/inline-format-semantic-tokens bash` remains intentionally unavailable even though normal tool-row smarter highlighting is now shipped.

## Demo and proof links

For richer walkthrough material, transcript-style visuals, and the published GitHub Pages presentation, use:

- GitHub Pages demo: https://banon-labs.github.io/pi-inline-format-extensions/
- Focused shipped-Python regression proof: `packages/host/src/shipped-python-smarter-highlight.test.ts`
- Inspection-vs-tool-row proof: `packages/host/src/shipped-python-tool-row.test.ts`
- Truthful shipped-Python baseline data: `packages/host/src/shipped-python-smarter-highlight-baseline.ts`
- Parent CLI-app tmux smoke evidence: `bd comments pi-inline-format-extensions-d3a.7`

README-vs-Pages audit outcome:

- README stays focused on architecture, shipped status, install/release expectations, and researched-next-candidate planning.
- GitHub Pages now owns the richer visual/demo presentation layer for the restored smarter-highlighting story.
- Repo-local tests plus tmux evidence remain the proof surface; GitHub Pages is linked as a presentation surface only.

## Researched next candidates

These are languages we researched as plausible next steps, but they are **not wired into the package yet**.

| Language                      | Built in today? | Likely easy win     | Harder follow-up           | Notes                                                                                         |
| ----------------------------- | --------------- | ------------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| Ruby                          | ❌              | syntax highlighting | smarter highlighting later | Strong candidate. Ruby LSP looks more promising than Solargraph for deeper language features. |
| PHP                           | ❌              | syntax highlighting | smarter highlighting later | Good candidate. Intelephense makes later deeper support plausible.                            |
| Lua                           | ❌              | syntax highlighting | smarter highlighting later | Good candidate. LuaLS has real semantic-token work, but we have not wired it here.            |
| SQL                           | ❌              | syntax highlighting | maybe later                | Straightforward syntax candidate. The deeper language story is less settled.                  |
| Perl                          | ❌              | syntax highlighting | maybe later                | Plausible syntax candidate. Deeper language support looks weaker than Ruby/PHP/Lua.           |
| YAML / JSON / TOML / Markdown | ❌              | syntax highlighting | probably not worth it      | Good candidates if we want more file/config formats without deeper symbol-aware work.         |

## README consolidation plan

To remove duplicated capability tables from `Banon-Labs/pi-inline-format` and keep this repo as the canonical source:

1. Treat this README's `## Shipped today` and `## Researched next candidates` sections as the maintained source of truth.
2. In `pi-inline-format`, replace the duplicated tables with a short summary plus links back to:
   - `https://github.com/Banon-Labs/pi-inline-format-extensions#shipped-today`
   - `https://github.com/Banon-Labs/pi-inline-format-extensions#researched-next-candidates`
3. If we want true embedding later, do it with a generated sync step that copies these sections during a release/update workflow; GitHub README markdown does not natively support remote includes.
4. Prefer links over generated duplication unless we decide the extra automation is worth the maintenance cost.

## Install, update, and release expectations

### Preferred package surfaces

- **Stable consumer installs** should use the published npm package at the repository root, for example:
  - `npm:@banon-labs/pi-inline-format-extensions@0.1.5`
- **Pinned git refs** remain valid for release-candidate testing or emergency rollback when you need an exact repository commit:
  - `git:github.com/Banon-Labs/pi-inline-format-extensions@<commit-or-tag>`
- **Unpublished local development** should use the repository root path, not `packages/host` directly:
  - `../../pi-inline-format-extensions`

The root surface is the durable contract. Consumers should not depend on an internal package path when a root-level package source is available.

### Release order

1. Land and validate host/plugin changes in this repo first.
2. Push the updated commit or publish a stable ref/tag here.
3. Repin the consumer repo (`pi-inline-format`) to that published git ref.
4. Rerun consumer validation there (`pi list`, `npm run check`, and any scenario-specific proof flows required by the change).

### Trusted publishing steady state and bootstrap caveat

- The intended long-term npm release path is GitHub Actions trusted publishing through `.github/workflows/publish-npm.yml`.
- Keep `id-token: write`, modern npm CLI, and provenance-enabled publish settings in place so future releases can use OIDC rather than long-lived tokens.
- npm currently requires a package to already exist before you can attach a Trusted Publisher on npmjs.com, so the very first publish of a brand-new package still needs a one-time manual publish or a granular token with bypass-2FA enabled.
- After that bootstrap publish exists on npm, open each package's npm access page, attach the matching GitHub Actions trusted publisher (`Banon-Labs/<repo>`, workflow file `publish-npm.yml`), and use the workflow for subsequent releases.

### Hardened npm release checklist

1. Run `npm run check` in `/home/choza/projects/pi-inline-format-extensions` and `/home/choza/projects/pi-inline-format`.
2. Run `npm run check:release-readiness` here to confirm both repos still have the expected package metadata, trusted-publish workflow shape, public npm visibility, and registry-resolved versions.
3. Keep the steady-state publish path on GitHub OIDC/trusted publishing; if a bootstrap bypass-2FA token was used earlier, remove it from `~/.npmrc` and revoke it on npm unless you intentionally want a manual emergency fallback.
4. Bump the intended release version in both repos together, commit the changes, and create the matching release tag(s). In this workspace, any required `git push` must still be explicitly authorized by the user.
5. Let the tag-triggered `.github/workflows/publish-npm.yml` workflow publish, or manually dispatch that same workflow when supervised release control is preferable.
6. After publish, verify `npm view @banon-labs/pi-inline-format-extensions@<version> version` and `npm view @banon-labs/pi-inline-format@<version> version`, then run a temp-project proof with `pi install -l npm:@banon-labs/pi-inline-format@<version>` and `pi install -l npm:@banon-labs/pi-inline-format-extensions@<version>` followed by `pi list`.
7. If package settings ever need to be recreated, reattach the npm Trusted Publisher on each package access page with `Banon-Labs/<repo>` and workflow filename `publish-npm.yml`.

### Growth rule for new language support

When adding support for another heredoc language:

- extend detection in a plugin package,
- keep the host as the only owner of Pi runtime/render seams,
- keep syntax highlighting routed through Pi's shipped `highlightCode(...)` path,
- add deterministic and proof coverage before asking consumers to repin.

### Growth rule for semantic inspection

When adding meaning-aware inspection:

- extend `@pi-inline-format/intel` rather than a language plugin,
- prefer compiler/LSP-backed backends over custom pseudo-analysis,
- map backend results back into heredoc regions and virtual documents,
- keep rendering ownership in host/Pi rather than moving it into intel,
- treat the current TypeScript language-service backend as the baseline pattern for future language-specific semantic backends.

## Commands

```bash
npm install
npm run typecheck
npm run check
```
