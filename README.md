# actian-ds-knowledge

Actian Design System knowledge layer. Consumed by the [Actian DS Claude plugin](https://github.com/volivarii/Actian-DS-Claude-plugin) and (future) docs site, Storybook, API clients.

> **Federation status (2026-05-10):** Phase 1 closed. All knowledge content migrated and federated. Phase B (`src/`+`dist/` restructure) in flight under parallel-change discipline (`MIGRATIONS.md` Rule 1 in plugin repo). Repo currently at `volivarii/actian-ds-knowledge`; transfers to Actian org at trigger condition (formal team adoption / cross-team consumption / external publication).

## Read first

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — `src/`+`dist/` convention, edit-here / never-edit table, per-domain authoring pointers
- [`llms.txt`](llms.txt) — content index for AI agents (raw `.md` URL pattern)
- [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) — AI-agent guides

## Contents

| Layer | Editable source | Generated artifacts |
|---|---|---|
| **Foundations** (mixed) | `foundations/src/foundations.md` (Kristina, MD-as-SoT) + `foundations/src/AUTHORING.md` | `foundations/dist/*.json` (8 derived; CI from MD) |
| **Tokens** (interim-flat — see [`tokens/README.md`](tokens/README.md)) | `tokens/tokens.json`, `tokens/tokens.css` (human-frozen until successor generator returns) | `tokens/token-reference.md` (CI from `tokens.json`) |
| **Components** (mixed) | `components/src/guidelines/*.json` (85 files: 44 curated + 41 stubs) + `components/src/guidelines/AUTHORING.md` | `components/dist/registries/{fmkit,dskit,metakit}.json` + `components/dist/registries/meta-kit/styles.json` + `components/dist/{text,effect}-styles.md` (CI from Figma) |
| **Content guidelines** (single-origin) | `content/content.md` (Jeff) | — |
| **Accessibility** (single-origin) | `accessibility/accessibility.md` | — |
| **Presentation** (single-origin) | `presentation/presentation-guide.md` | — |
| **App context** (single-origin) | `app-context/app-context.json` | — |
| **FM↔DS map** (single-origin) | `fm-to-ds-map/fm-to-ds-map.json` | — |

> **Phase B dual-publish (transient through Phase D):** during the migration, generators write outputs to BOTH new (`foundations/dist/`, `components/dist/`) AND legacy (`foundations/*.json`, `components/registries/`) paths so existing consumers keep working. Phase D drops the legacy duplicates after the migration window stabilizes. Spec: `docs/superpowers/specs/2026-05-10-knowledge-repo-restructure-design.md` in plugin repo (gitignored).

## CI

| Workflow | Trigger | What it does |
|---|---|---|
| `.github/workflows/sync-from-figma.yml` | Cron (07:00 UTC nightly) + manual | Figma REST → `components/dist/registries/*.json` (and legacy paths). Auto-stubs missing component guidelines. Auto-bumps `package.json` patch on additive/breaking diff. Opens additive PRs auto-merged; flagged PRs (breaking) get `review-required` label. |
| `.github/workflows/foundations-derive.yml` | PR event on `foundations/src/foundations.md` or parser scripts | Regenerates `foundations/dist/*.json` (and legacy `foundations/*.json` during dual-publish for plugin compatibility). Posts a semantic-diff comment summarizing what changed. |

## Consumers

- **Actian DS Claude plugin:** vendored snapshot pulled nightly (`vendor-snapshot.yml` 09:00 UTC, 2h offset from upstream Figma sync). No runtime network dependency.
- **(Future) docs site, Storybook, API clients.** Per the federation thesis — the knowledge layer is shared substrate.

## Collaborators

- Vincent Olivari (`volivarii`) — lead
- Jeff (`levita99zeenea`) — content guidelines
- Kristina — foundations

## License

UNLICENSED. Internal Actian use.
