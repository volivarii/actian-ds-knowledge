# actian-ds-knowledge

Actian Design System knowledge layer. Consumed by the [Actian DS Claude plugin](https://github.com/volivarii/Actian-DS-Claude-plugin) and (future) docs site, Storybook, API clients.

> **Federation status (2026-05-09):** Phase 1.1 standup in progress. Knowledge migration from the plugin happens incrementally. Currently lives at `volivarii/actian-ds-knowledge`; transfers to Actian org at trigger condition (formal team adoption / cross-team consumption / external publication).

## Contents

| Layer | Path | Status |
|---|---|---|
| Component registries | `components/registries/{fmkit,dskit,metakit}.json` | ✅ Phase 1.1 shipped |
| Component guidelines | `components/guidelines/*.json` (85 files) | ✅ Phase 1.1 shipped |
| Component MDs (auto-generated) | `components/{fm-components,dskit-components,meta-kit/components}.md` | ✅ Phase 1.1 shipped |
| Foundations | `foundations/foundations.md` + `foundations/*.json` (8 derived) + `foundations/AUTHORING.md` | ✅ Phase 1.2 shipped |
| Tokens | `tokens/tokens.json` (DTCG) + `tokens/tokens.css` | ✅ Phase 1.3 shipped |
| Content guidelines | `content/content.md` (Jeff fold-in) | ✅ Phase 1.3 shipped |
| Accessibility | `accessibility/accessibility.md` | ✅ Phase 1.3 shipped |
| App context | `app-context/app-context.json` | ✅ Phase 1.3 shipped |
| FM↔DS map | `fm-to-ds-map/fm-to-ds-map.json` | ✅ Phase 1.3 shipped |

**All knowledge content migrated.** Phase 1.4 (plugin vendoring CI) + Phase 1.5 (decommission `/sync-design-system`) remain — both happen on the plugin side, not here.

## CI

`.github/workflows/sync-from-figma.yml` runs nightly + on-demand. Lifts the Figma-REST sync from the plugin's `scripts/sync/`. Outputs to `components/` paths. Smoke-gated against the plugin's `/sync-design-system` skill until byte-identical outputs are confirmed across multiple sync passes (`MIGRATIONS.md` Rule 1, parallel-change discipline).

## Consumers

- **Actian DS Claude plugin:** vendored snapshot pulled at plugin release time (Phase 1.4 deliverable). No runtime network dependency.
- **(Future) docs site, Storybook, API clients.**

## Collaborators

- Vincent Olivari (`volivarii`) — lead
- Jeff (`levita99zeenea`) — content guidelines (Phase 1.3 fold-in)
- Kristina — foundations (Phase 1.2)

## License

UNLICENSED. Internal Actian use.
