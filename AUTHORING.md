# Authoring guide — actian-ds-knowledge

> One-page entry doc. Read this first; deep-dive into sub-guides as needed.

## What this repo is

The Actian Design System knowledge layer: tokens, content guidelines, accessibility patterns, component metadata. Consumed by the Actian DS Claude plugin today; future consumers planned (docs site, MCP server, partner integrations).

## What lives where

| Domain | Source (you edit here) | Generated (CI writes) |
|---|---|---|
| **Foundations** (color/type/spacing/motion/elevation/icons) | `foundations/src/foundations.md` | `foundations/dist/*.json` (8) |
| **Tokens** | `tokens/tokens.json` (frozen snapshot) | `tokens/tokens.css`, `tokens/token-reference.md` |
| **Components** | `components/src/guidelines/*.json` (85; 44 curated + 41 stubs) + `components/src/categories/*.md` (6, NEW Phase 2) | `components/dist/registries/*` (3, Figma sync) + `components/dist/categories/*.json` (6, derived) + `components/dist/categories.json` (Phase 0) |
| **Content guidelines** | `content/src/*.md` (37 files) | `content/dist/content.md` |
| **Accessibility** | `accessibility/accessibility.md` (with stable `{#slug}` anchors) | `accessibility/dist/a11y-index.json` (slug→WCAG map) |
| **Other** | `app-context/app-context.json`, `fm-to-ds-map/fm-to-ds-map.json`, `presentation/presentation-guide.md` | — |

## Roles (who owns what)

- **Plugin lead** — orchestration, CI, plugin-side integration, schemas
- **Design system lead** — foundations (tokens, scales) + component anatomy + design conventions
- **Content lead** — content guidelines + voice + UI copy

(Sub-`AUTHORING.md` files in each domain dive deeper.)

## How edits propagate

```
Your edit in src/ MD or JSON
    ↓ (open PR; CI validates via JSON Schema)
PR merged on knowledge repo
    ↓ (tag auto-created; nightly cron + manual trigger available)
Plugin's vendor-snapshot.yml pulls the new version
    ↓ (opens auto-merging PR via actian-ds-bot App)
Plugin main updated with new vendor data
    ↓ (marketplace cache propagates)
Designers using the plugin see new content
```

Typical lag end-to-end: <24 hours via nightly cron; ~10 min if you trigger vendor-snapshot manually.

## Validation

Live in VSCode: open any `components/src/categories/*.md` file — autocomplete + inline errors appear via YAML extension + JSON Schema at `schemas/category-defaults.json`.

CI: `validate-schemas.yml` blocks merge if schemas violated. Tests in `tests/` cover schema correctness.

## Reserved field conventions

Fields prefixed with `_` are system-managed (`_schema_version`, `_meta`, `_sourceFile`, `_generatedAt`). Authored content uses bare keys. Don't name new content fields with `_`-prefix.

## Cross-references

Cross-domain references use **slugs**, not quoted names:
- `motion_refs: [{ref: state-transitions}]` resolves to `foundations/dist/tokens/motion.json` pattern by slug
- `accessibility: [{ref: label-association}]` resolves to `accessibility/dist/a11y-index.json` by slug

The slug system protects against name drift; canonical names live in their authored source.

## Adding new content

- New component guideline: copy a curated one as template; flip `_stub` to false; PR with content
- New foundation token: edit `foundations/src/foundations.md`; CI regenerates the hierarchical `foundations/dist/` tree (Pattern H) on PR
- New category default content: edit `components/src/categories/<slug>.md`; CI regenerates dist
- New domain (rare): consult the plugin lead; new directory + paths-manifest entry + CI workflow

## When in doubt

- `paths-manifest.json` is the machine-readable contract
- Sub-`AUTHORING.md` per domain has details
- Open an issue or ask in chat
