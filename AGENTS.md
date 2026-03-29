# Agent Instructions

This repository uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

The repository root is the canonical instruction file for this repo.

## Commands

```bash
npm install
npm run typecheck
npm run check
```

## Architecture rules

- Keep `packages/host` as the only owner of Pi runtime seams such as built-in tool overrides and deterministic compare helpers.
- Keep language-specific logic in plugin packages under `packages/*`.
- Do not let multiple language packages independently override the same built-in Pi tool.
- Put shared interfaces and registration types in `packages/shared-contract`.
- Use `bd` for all task tracking; do not add markdown TODO lists.

## Ralphi

- Use `.ralphi/config.yaml` as the source of truth for the Ralph loop.
- Keep host-owned runtime seams, compare helpers, and plugin orchestration in `packages/host` only.
- Keep language packages pure plugins; shared contracts belong in `packages/shared-contract`.
- Use `npm run check` for full validation and `npm run typecheck` for quick verification.
