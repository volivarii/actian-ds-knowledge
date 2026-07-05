# Changelog

All notable changes to the Actian Product Design System knowledge layer are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project's `knowledge_version` follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## How this changelog works

`package.json#version` and `paths-manifest.json#knowledge_version` are bumped **automatically by
CI** (2-file lockstep) on every Figma sync and every `src/` derive, so the repo produces many patch
releases per week. This file does **not** list every automated patch bump. It records the
**notable** changes: new capabilities, schema and contract changes, breaking syncs, and anything a
downstream consumer (plugin, docs, future MCP, Claude Design) should know about. Routine additive
Figma refreshes are summarized, not enumerated.

Each entry links its pull request. Dates are the merge date (UTC).

## [Unreleased]

### Changed
- **Canonical sync emit (wave 2).** The nightly sync can now tell "re-emitted" from "changed":
  registry components, categories, and the anatomy bundle are emitted in sorted key order (ends the
  ~97% move-noise in breaking-PR diffs); files are written only when canonical bytes differ;
  `lastSynced`/`generatedAt`/`synced_at` are preserved on content-equal re-emits (they now mean
  "last content change"); media captures count only real writes. A night with zero changes is now a
  true no-op: no PR, no version bump, no tag. The first sync after this lands a one-time key-order
  migration PR.
- **TAG-GAP closed for the sync, visible elsewhere.** Any sync run that writes vendorable content
  opens a PR and bumps, even when the entry-level verdict is unchanged; `validate-manifest` adds a
  report-only notice when a human PR changes vendorable content without a bump.
- **Sync owns `media/_index.json`.** The media index regenerates inside the sync run, so
  `guidelines-derive` no longer heals it afterwards with a stacked second bump (the phantom
  untagged versions like 0.34.66-67 stop being minted).
- **Breaking syncs self-record in this changelog.** The sync bot inserts an entry with the real PR
  number under Unreleased on every breaking sync (additive nightly refreshes stay unlisted by
  design).
- **`package-lock.json` joins the version lockstep** (and is resynced from 0.34.55 to current):
  bumps stamp its version fields, so `npm install` in CI stops dirtying the tree on every run.
- **CI hardening.** The Figma sync and all derive/validate workflows now run under concurrency
  groups (queued, never cancelled mid-push), auto-commit pushes rebase and retry once on a lost
  race, and `content-derive` pushes with the actian-ds-bot App token like its siblings, so required
  checks re-run on its auto-commits without a manual empty commit. ([#351])

### Removed
- **`--zen-color-text-link-{default,reverse,visited}` tokens retired.** The text-link family is
  deleted from `foundations/src/tokens.md` (and so from `tokens/tokens.json` / `tokens.css`);
  interactive/link text is `--zen-color-text-primary` (primary-500, same resolved value as the old
  link-default) and body text is `--zen-color-text-default`. The five component `tokens.yml`
  bindings that used `color-text-link-default` (tabs, side-nav, global-header, button, breadcrumbs)
  now bind `color-text-primary`, and stale pre-rename body-text uses of `color-text-primary` across
  nine components now bind `color-text-default`. Consumers emitting
  `var(--zen-color-text-link-default)` must migrate to `var(--zen-color-text-primary)` before
  vendoring a snapshot with this change. ([#341])

### Fixed
- **Anatomy prune guard.** A transient per-slug Figma fetch miss or normalization failure no longer
  lets the nightly sync delete that component's existing anatomy file or drop its entry from
  `anatomy.bundle.json` (failed slugs are re-seeded from the existing dist, so even a total outage
  re-emits the prior bundle instead of wiping it). Failures are rendered in the sync PR changelog,
  and any real anatomy deletion now escalates the sync verdict to breaking (review-required)
  instead of auto-merging. ([#351])
- **Media mass-prune guard.** A capture role resolving to zero frames on more than 3 slugs at once
  (the signature of a library-wide sub-section rename outside the alias list) is refused instead of
  deleting every `<role>-*.webp` across the library; the refusal is surfaced as a warning in the
  sync PR changelog. Single-slug removals and shrink prunes behave as before. ([#351])

## [0.34.69] - 2026-07-03

### Added
- **Per-variant resolved appearance (Phase 1A-ii).** The nightly anatomy sync now captures how a
  component's resolved appearance (fill, border, radius, text) changes across variant values, inline
  on the anatomy tree as `appearance.variants[]` deltas relative to `variantDefaults`. Root-anchored
  alignment captures where nodes align and records structural divergence in `quality.structuralVariants`
  / `quality.uncapturedValues` instead of mis-emitting. Variant names are preserved verbatim so they
  match consumer instance props. Live on real data: 81 of 83 components carry `appearance`, 40 carry
  per-variant deltas. ([#347], [#344])

### Changed
- `schemas/anatomy.json`: additive `appearance.variants[]`, file-level `variantDefaults`, and
  `quality.structuralVariants` / `quality.uncapturedValues`. Variant `border`/`text` deltas are
  shape-constrained via shared `$defs`. All existing dist anatomy files remain valid. ([#347])

### Fixed
- Anatomy appearance capture now reads the correct Figma **REST** field names
  (`individualStrokeWeights`, `rectangleCornerRadii`) rather than Plugin-API names, and no longer
  emits a color occluded beneath a visible non-solid paint. ([#347])

## [0.34.68] - 2026-07-03

### Added
- **Resolved appearance capture (Phase 1A).** Anatomy nodes now carry a resolved `appearance`
  (fill/border/radius/text) captured from Figma's REST paint data, the render-fidelity substrate:
  consumers emit the resolved value with the token name added later for theming. ([#345])
- **Tag-family token-binding sidecars (harvest).** Variant-prop scoped bindings with schema v2
  (`variant:{prop,values}` + `variantDefaults`), 9 sidecars. ([#338])

### Fixed
- **Editor: single submission path.** Every edit now routes through the batch/cart; the direct
  "Submit as PR" paths were removed, and batch submit is hardened with a synchronous re-entry guard
  and a `try/finally` guard reset. ([#346])
- **Sync publish gate.** Components on category-header pages are excluded from the sync (publish gate
  is the member page), restoring 6 form-component originals that duplicates had masked. ([#339], [#340])

## Earlier

Prior releases (token-render-facts harvest predecessors, app-context restructure, WYSIWYG editor
rollout, foundations/content derive pipelines) predate this changelog and are recorded in the git
history and pull-request record.

[Unreleased]: https://github.com/volivarii/actian-ds-knowledge/compare/v0.34.69...HEAD
[0.34.69]: https://github.com/volivarii/actian-ds-knowledge/compare/v0.34.68...v0.34.69
[0.34.68]: https://github.com/volivarii/actian-ds-knowledge/compare/v0.34.65...v0.34.68
[#351]: https://github.com/volivarii/actian-ds-knowledge/pull/351
[#347]: https://github.com/volivarii/actian-ds-knowledge/pull/347
[#341]: https://github.com/volivarii/actian-ds-knowledge/pull/341
[#346]: https://github.com/volivarii/actian-ds-knowledge/pull/346
[#345]: https://github.com/volivarii/actian-ds-knowledge/pull/345
[#344]: https://github.com/volivarii/actian-ds-knowledge/pull/344
[#340]: https://github.com/volivarii/actian-ds-knowledge/pull/340
[#339]: https://github.com/volivarii/actian-ds-knowledge/pull/339
[#338]: https://github.com/volivarii/actian-ds-knowledge/pull/338
