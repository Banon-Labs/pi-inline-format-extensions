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

## Design rule

Only the **host** should own Pi render/tool override seams.
Language packages should expose reusable plugin objects and detection/render metadata only.

## Current scaffold status

- `@pi-inline-format/host` loads a default plugin list and exposes `/inline-format-host-status`.
- `@pi-inline-format/shared-contract` defines the first plugin contract.
- `@pi-inline-format/python` contains the first real heredoc detector scaffold.
- `@pi-inline-format/typescript`, `@pi-inline-format/javascript`, and `@pi-inline-format/bash` are placeholders.

## Commands

```bash
npm install
npm run typecheck
npm run check
```
