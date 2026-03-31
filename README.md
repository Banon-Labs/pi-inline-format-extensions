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
| Python       | ✅                    | ✅                 | ✅ `basedpyright` prototype + semantic-token payloads                          | ✅                                          | supported for the shipped sample; parent CLI-app tmux proof showed smarter-highlighted normal tool-row output         |
| JavaScript   | ✅                    | ✅                 | ✅ TypeScript language service                                                 | ✅                                          | shipped                                                                                                               |
| TypeScript   | ✅                    | ✅                 | ✅ TypeScript language service                                                 | ✅                                          | shipped                                                                                                               |
| Bash / shell | ✅                    | ✅                 | ⚠️ partial (`bash-language-server` + `shellcheck`; no semantic token provider) | ✅                                          | shipped via a host-owned smarter-highlighting seam; intel/backend semantic-token payloads remain intentionally absent |

- JavaScript, TypeScript, and Python feed semantic tokens into the normal bash tool-row render path.
- Bash now participates in smarter tool-row highlighting through a host-owned Bash token/span collector in `packages/host`.
- The Bash inspection backend still does **not** advertise semantic-token payloads, so `/inline-format-semantic-tokens bash` remains intentionally unavailable even though normal tool-row smarter highlighting is now shipped.

## Representative interaction visuals

These are **transcript-style visuals** captured from the actual sample commands shipped by `packages/host/extensions/index.ts`. They show what the parent `pi-inline-format` extension can surface after loading this package, without pretending that README screenshots are live UI.

### Hover / inspect sample

```text
/inline-format-inspect-sample typescript
Backend: inline-format-typescript-language-service
Language: typescript
Kind: hover
Summary: Resolved hover information via the TypeScript language service. type Answer = {
    value: number;
}.
Ranges: [0:5-0:11]
Payload: {"quickInfo":"type Answer = {\n    value: number;\n}","filePath":"/tmp/delete.me.ts"}
```

### Explain symbol

```text
/inline-format-explain-symbol python main
Backend: inline-format-basedpyright
Language: python
Kind: explain-symbol
Summary: Explained symbol main via basedpyright. (function) def main() -> None
Ranges: [2:4-2:8]
Payload: {"symbolName":"main","hover":"(function) def main() -> None"}
```

### Find definition

```text
/inline-format-find-definition bash greet
Backend: inline-format-bash-language-server
Language: bash
Kind: definition
Summary: Bash language server resolved 1 definition(s) for greet.
Ranges: [2:0-4:1]
Payload: {"symbolName":"greet","definitionCount":1,"sameFileDefinitionCount":1,"definitionFiles":["file:///tmp/pi-inline-format-bash-language-server-<temp>/bash.sh"]}
```

### Highlight symbol

```text
/inline-format-highlight-symbol javascript value
Backend: inline-format-typescript-language-service
Language: javascript
Kind: document-highlights
Summary: TypeScript language service reported 2 document highlight(s) for the selected symbol.
Ranges: [0:6-0:11], [1:12-1:17]
Payload: {"symbolName":"value","highlightCount":2,"quickInfo":"const value: 42"}
```

### Semantic tokens

```text
/inline-format-semantic-tokens python
Backend: inline-format-basedpyright
Language: python
Kind: semantic-tokens
Summary: Basedpyright reported 2 semantic token(s) for the current virtual document.
Ranges: [2:4-2:8], [3:4-3:9]
Payload: {"tokenCount":2,"tokens":[{"range":{"start":{"lineIndex":2,"columnIndex":4},"end":{"lineIndex":2,"columnIndex":8}},"tokenType":"function","modifiers":["declaration"],"text":"main"},{"range":{"start":{"lineIndex":3,"columnIndex":4},"end":{"lineIndex":3,"columnIndex":9}},"tokenType":"function","modifiers":["defaultLibrary","builtin"],"text":"print"}],"legend":{"tokenTypes":["namespace","type","class","enum","typeParameter","parameter","variable","property","enumMember","function","method","keyword","decorator","selfParameter","clsParameter"],"tokenModifiers":["declaration","definition","readonly","static","async","defaultLibrary","builtin","classMember","parameter"]}}
```

```text
/inline-format-semantic-tokens bash
Backend: inline-format-bash-language-server
Language: bash
Kind: semantic-tokens
Summary: bash-language-server does not advertise semanticTokensProvider, so the prototype backend cannot expose semantic-token payloads for Bash yet.
```

### Diagnostics

```text
/inline-format-diagnostics-sample bash
Backend: inline-format-bash-language-server
Language: bash
Kind: diagnostics
Summary: ShellCheck reported 1 diagnostic(s) for the current virtual document.
Diagnostics: 1
Payload: {"diagnosticCount":1,"source":"shellcheck"}
```

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
