# actian-ds-knowledge

Actian Design System knowledge layer. Consumed by the [Actian DS Claude plugin](https://github.com/volivarii/Actian-DS-Claude-plugin) and (future) docs site, Storybook, API clients.

> **Federation status (2026-05-11):** Phase 1 complete. v0.2.0 ships the `src/`+`dist/` structural split + `paths-manifest.json` consumer contract + tag-based versioning. Currently lives at `volivarii/actian-ds-knowledge`; transfers to Actian org at trigger conditions (formal team adoption / cross-team consumption / external publication).

## Read first

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — `src/`+`dist/` convention, edit-here / never-edit table, per-domain authoring pointers
- [`llms.txt`](llms.txt) — content index for AI agents (raw `.md` URL pattern)
- [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) — AI-agent guides
- [`paths-manifest.json`](paths-manifest.json) — logical-name → file-path contract; canonical surface for downstream consumers

## Contents

| Layer | Editable source | Generated artifacts |
|---|---|---|
| **Foundations** (mixed) | `foundations/src/foundations.md` (Kristina, MD-as-SoT) + `foundations/src/AUTHORING.md` | `foundations/dist/*.json` (8 derived; CI from MD) |
| **Tokens** (interim-flat — see [`tokens/README.md`](tokens/README.md)) | `tokens/tokens.json`, `tokens/tokens.css` (human-frozen until successor generator returns) | `tokens/token-reference.md` (CI from `tokens.json`) |
| **Components** (mixed) | `components/src/guidelines/*.json` (85 files: 44 curated + 41 stubs) + `components/src/guidelines/AUTHORING.md` | `components/dist/registries/{fmkit,dskit,metakit}.json` + `components/dist/registries/meta-kit/styles.json` + `components/dist/{text,effect}-styles.md` (CI from Figma) |
| **Content guidelines** (mixed) | `content/src/*.md` (Jeff — 36 per-topic files + `global-guidelines.md` + `content-index.md` + `format-spec.md` + `AUTHORING.md`) | `content/dist/content.md` (CI-consolidated reference from `scripts/content/derive-content.js`) |
| **Accessibility** (single-origin) | `accessibility/accessibility.md` | — |
| **Presentation** (single-origin) | `presentation/presentation-guide.md` | — |
| **App context** (single-origin) | `app-context/app-context.json` | — |
| **FM↔DS map** (single-origin) | `fm-to-ds-map/fm-to-ds-map.json` | — |

> **Consumer indirection:** plugin code, future docs site, etc. reference **logical names** from `paths-manifest.json` (e.g., `foundations.color`, `components.registries.dskit`), not physical paths. The manifest maps logical → physical. Future restructures only change the manifest; consumer code keeps working.

## CI

| Workflow | Trigger | What it does |
|---|---|---|
| `.github/workflows/sync-from-figma.yml` | Cron (07:00 UTC nightly) + manual | Figma REST → `components/dist/registries/*.json`. Auto-stubs missing component guidelines. Auto-bumps `package.json` patch on additive/breaking diff + emits matching `v$VERSION` git tag. Opens additive PRs auto-merged; flagged PRs (breaking) get `review-required` label. |
| `.github/workflows/foundations-derive.yml` | PR event on `foundations/src/foundations.md` or parser scripts | Regenerates `foundations/dist/*.json`. Auto-bumps `package.json` patch + emits tag after the regen commit. Posts a semantic-diff comment summarizing what changed. |
| `.github/workflows/validate-manifest.yml` | PR event on `paths-manifest.json` or any content directory | Runs `scripts/validate-manifest.js`. Verifies every manifest path resolves to a real file + no orphan content exists outside the manifest. Required check. |

## Versioning

Knowledge repo uses semver via `package.json#version`. Every Figma-data or foundation change auto-bumps a patch and emits a matching `v$VERSION` git tag. Structural changes bump a minor (breaking change for consumers' path layout) — current is v0.2.0.

Downstream consumers (e.g., the plugin) pin a semver range in their `vendored.json`:
- `~0.2.0` — auto-pull any v0.2.x (patches only; safe for nightly cron)
- Major or minor jumps require human bump (consent gate)

## Consumers

- **Actian DS Claude plugin** — vendors a pinned snapshot nightly (`vendor-snapshot.yml` 09:00 UTC, 2h offset from upstream Figma sync). Resolves tag via semver range. No runtime network dependency.
- **(Future) docs site, Storybook, API clients.** Per the federation thesis — the knowledge layer is shared substrate.

## Collaborators

- Vincent Olivari (`volivarii`) — lead
- Jeff (`levita99zeenea`) — content guidelines
- Kristina — foundations

## License

UNLICENSED. Internal Actian use.
