# AGENTS.md — actian-ds-knowledge

Cross-harness AI guide. If your harness reads `AGENTS.md` (Cursor, Copilot CLI, Codex, Gemini CLI, etc.), this is the entry point. Claude Code reads `CLAUDE.md` for the same content; both files mirror each other.

> **For full guidance, read [CLAUDE.md](CLAUDE.md).** This file is intentionally a thin pointer to keep the two in sync.

## Contributing a change? Read this first

**Edit only files inside a `src/` folder.** Do **not** edit anything in a `dist/` folder, and do **not** change version numbers (`package.json` `version` or `paths-manifest.json` `knowledge_version`).

CI does the rest automatically: on your PR it regenerates the `dist/` files, bumps the version (both fields together), and commits them back to your branch. So just: **edit source → commit → open a PR.** If a check fails complaining about the version, you almost certainly edited it by hand — revert that change and let CI bump it.

## TL;DR

- This repo is the federated knowledge layer for the Actian Design System 2026.
- Mixed-origin domains use `src/`+`dist/` (visible folder boundary; never edit `dist/`).
- Flat domains (no `src/`+`dist/`): `app-context/`. `content/` and `accessibility/` are human-authored but have a `src/` → CI `dist/` derive (never edit `dist/`).
- `tokens/` is interim-flat — human-frozen snapshots until a successor generator lands.
- One hand-edit exception in `dist/`: `metakit.json.templates` block.
- Consumers reference logical names from `paths-manifest.json` (not physical paths). Generators write only to canonical paths under `dist/`.
- `paths-manifest.json#knowledge_version` is **derived** from `package.json#version` — stamped by CI (and `npm run sync:version`). Never edit it by hand.

## Read order

1. [llms.txt](llms.txt) — content index
2. [CONTRIBUTING.md](CONTRIBUTING.md) — `src/`+`dist/` convention + edit-here table
3. [CLAUDE.md](CLAUDE.md) — full editing rules + don'ts
4. Per-domain `AUTHORING.md` files (e.g., `foundations/src/AUTHORING.md`, `components/src/guidelines/AUTHORING.md`)
