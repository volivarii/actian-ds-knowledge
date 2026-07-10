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

### Added
- **Editor: a live freshness chip.** The header now shows the knowledge version
  and when the substrate last changed ("v0.34.83 · updated 3 h ago"), fetched
  live from main (version from `package.json`, date from its last CI bump
  commit) rather than baked at build time, since the editor SPA only redeploys
  on editor changes. The chip stays silent rather than guessing when the probes
  fail, and it replaces the hero's static "updated at every merge" badge with a
  claim that proves itself. Answers the direction's "what's up to date"
  question (flow 4). ([#399])

### Changed
- **Editor: the sidebar speaks author language and separates its two
  dimensions.** The repo-shaped section names are gone: "Content —
  Writing/Patterns/Product" is now "Writing rules", "Pattern copy", and
  "Product copy", and "App context — Apps/Entities/Patterns" is now "Apps",
  "Entities", and "UX patterns" (which also disambiguates the two unrelated
  "Patterns" groups: the words used in patterns vs the patterns themselves).
  The tree is also grouped into its two ontological dimensions: **Design
  system** (foundations, accessibility, writing rules, pattern and product
  copy, components — what the system prescribes) and **The products** (apps,
  entities, UX patterns — what the system serves), reflecting how app-context
  sits in the knowledge graph as a bridged domain rather than more DS content.
  Labels and grouping only; no routing or data change. ([#398])

### Added
- **Editor: a front door.** The editor's landing surface is now a home screen
  instead of a bare dashboard: what this place is in one sentence (and that
  every edit ships as a reviewed pull request, so you cannot break anything),
  three starting actions (write missing guidance, find a component, see how an
  edit ships), a prioritized "Needs attention" list of real coverage gaps that
  deep-links into each component's authoring workspace, and the former
  Coverage/Accessibility/Relationships tabs absorbed as an "Explore the data"
  section. The coverage fetch behind all of this is now memoized per session
  (5-minute TTL), so the home screen, the coverage table, and the accessibility
  dashboard share one GitHub crawl instead of each running their own. Sidebar
  entry renamed Coverage → Home. Editor tooling only: no dist, contract, or
  consumer-facing change. ([#397])
- **Editor: relations panel polish (cursor-follow outline, guided empty states,
  and the source-mode frontmatter editor).** The outline now highlights the section
  the cursor sits in (source mode and the frontmatter screen's CodeMirror body),
  a passive follow marker distinct from the click-to-scope filter. Empty relation
  groups render a plain-language affordance ("Nothing links here yet.", "No
  references yet. Use Manage to add one.") instead of a bare "(0)", and the three
  groups are relabeled to author-facing vocabulary: Referenced by (was Incoming),
  References (was Outgoing), In the graph. The relations panel now also renders
  beside the frontmatter-form screen's plain CodeMirror body, which previously had
  no panel (only the WYSIWYG branch did). And the `[[` reference picker stays on
  screen: its left edge is clamped near the right margin so a 320px card no longer
  clips off-screen, and it flips above the caret when there is no room for its full
  height below. Editor tooling only: no dist, contract, or consumer-facing change.
  ([#394])
- **Editor: type `[[` to reference anything.** In the rich editor, `[[` opens a picker over the
  knowledge graph's components plus the current document's sections; selecting inserts a plain
  markdown link in the corpus's existing grammar (bare component slug, or `#anchor` for sections),
  so every insertion round-trips byte-safely and feeds straight back into the relations panel's
  index. Other node types join the picker once a body-link grammar for them is decided. ([#393])
- **Editor: frontmatter collapses, prose gets the viewport.** In the frontmatter-form screens the
  form now starts collapsed behind a Frontmatter Show/Hide toggle (bodyless record files stay
  expanded, the form is their content) and the prose body editor grows from a fixed 320px box to
  the full viewport height. Incoming-reference snippets in the relations panel are now extracted
  from the referencing file's prose body only, so a reference living in frontmatter no longer
  leaks raw YAML into the panel. ([#390])
- **Editor: unified relations panel in the markdown editor's source and rich modes, and beside the
  rich body editor in the frontmatter-form screen.** A persistent side panel now shows the document
  outline with per-section connection counts and, below it, the file's relations in context:
  incoming references rendered as contextual snippets from the referencing paragraph, outgoing
  links and frontmatter refs (with the existing add/disconnect/repoint flow reached from the
  panel), and the typed knowledge-graph edges touching this file (composed_of, uses_component,
  in_category, a11y_ref, with an "as of last merge" staleness label). Restores the relations
  surface rich mode lacked and makes the cross-domain graph visible during authoring. Rich editing
  is itself opt-in (the CI-derived safe set), and the frontmatter-form screen's non-WYSIWYG body
  branch (plain CodeMirror) has no panel. Section connection counts also exclude a file's own
  references to its own anchors (previously counted): a self-link no longer inflates a section's
  pill. Editor tooling only: no dist, contract, or consumer-facing change. ([#389])
- **Content dist split: per-bucket views beside the global concat.** `derive-content.js` now also
  emits `content/dist/writing.md`, `content/dist/patterns.md`, and `content/dist/product.md`: split
  views of the same global sections (index order preserved, words-to-avoid table rendered in the
  writing view), so a consumer that needs only one family reads only that file instead of the full
  `global.md`. New manifest keys `content.{writingMd,patternsMd,productMd}`; llms.txt indexes the
  splits. Parallel change per MIGRATIONS Rule 1: `global.md` stays the cross-bucket document
  (root-level ground rules like `global-guidelines.md` appear only there) and existing consumers
  are unaffected; its only content change is a fix the review surfaced: frontmatter-only stub
  sections (empty prose bodies) are no longer emitted, removing a malformed empty `---` block. A
  bucket resolving to zero prose sections now fails the derive loudly instead of shipping a
  header-only file, and all content dist writes go through the shared atomic writer. Tests pin
  bucket partition correctness, the no-empty-block invariant, and per-file dist staleness. ([#387])
- **Editor: WYSIWYG rich body editing everywhere, on a CI-derived safe set.** The rich-safe file
  set is no longer a hand-curated `domains.json` `wysiwyg.safePaths` allowlist (whose guard test
  silently skipped missing entries): it is now generated by walking every editable source file and
  actually round-tripping it through the shared Milkdown guard
  (`editor/scripts/gen-wysiwyg-safe-paths.ts` → `editor/src/generated/wysiwyg-safe-paths.json`,
  ~100 files rich-safe). A corpus gate re-classifies every walked file with no skips, three
  known-unsafe files are pinned so a loosened guard can't silently admit them, and Editor CI fails
  on a stale committed set (its paths filter now includes the content source trees that feed the
  set). Rich mode gains a guard-safe formatting toolbar (headings, lists, quote, bold/italic/link,
  code block, table insert + row/col/cell ops) where every button's real command output is
  round-trip-tested, and `<Media>` directives render an image preview with insertion via the media
  picker (serialization stays byte-exact). Contract change: the `domains.json` `wysiwyg` block now
  carries only `distEquivalence` (schema updated); rich-safe source files were baselined to
  Milkdown's canonical form (bullet/table normalization, dist regenerated) so a first WYSIWYG save
  is a byte no-op. WYSIWYG remains opt-in via the editor flag. ([#385])
- **Editor: frontmatter forms for content and foundations.** The knowledge editor now edits
  `content/src/**` and `foundations/src/*.md` frontmatter through schema-driven forms, on a new
  routing registry (`matchFrontmatterForm`) that replaces the hardcoded per-domain if-chain. Adds
  `schemas/foundations.json` (`a11y_refs` / `motion_refs`) and wires `domains.json`
  `foundations.frontmatterSchema`. Forms preserve interleaved authoring comments on save (only
  changed keys are rewritten), open frontmatter-free files without a false parse-error, and keep the
  missing-frontmatter warning for record domains that require it. Editor tooling only: no `dist/`,
  contract, or consumer-facing change. ([#383])
- **Knowledge graph: app-context to component bridge.** UX patterns now carry an authored `components` list (app-context pattern frontmatter), projected into the knowledge graph as directed `uses_component` edges (ux_pattern to component), so "what components realize this pattern" and "where is this component used" are graph-queryable. This connects the app-context island (#364) to the component graph. 93 edges across 28 patterns, taking the graph to 843 nodes / 1081 edges, with a `pattern_component_edges` count in `quality-report.json`. Purely additive: no `context.jsonld`, manifest, or workflow change, existing nodes and edges unchanged, and the re-derive is byte-identical. ([#381])
- Knowledge graph now models **component composition**: registry `nestedComponents` is projected as directed `composed_of` edges (component to component, parent as source, nested child as target), declared in `schemas/graph.json` and `graph/vocabulary.json` (`source: [component]`, `target: [component]`). 336 edges, taking the graph to 843 nodes / 988 edges. Icons are included on purpose (nearly every component nests them); a "real composites only" view is a one-hop consumer filter on the target's `in_category` edge, not a derive-time exclusion. A `composition_edges` count is surfaced in `quality-report.json`. Purely additive: no `context.jsonld`, manifest, or workflow change, existing nodes and edges unchanged, and the re-derive is byte-identical. Slice 2b of Phase 2 identity; endpoints resolve by slug (the graph's node identity), so a child slug that collides across kits binds to the first-wins node until slice-3 key identity disambiguates. ([#379])
- Page-level category overrides (`components/src/category-page-overrides.json`)
  so churned/self-hosting icon page names (`DS Icons`, `DS Icons: replacement`)
  resolve to canonical categories, and staging pages are excluded from the sync. ([#375])
- Mass category-loss tripwires: the sync now fails loud (exit 2, no PR) when a
  category with 10+ members drops to zero or the icon library collapses, instead
  of silently shipping an empty `icons.json`. Registry-root guard plus a
  `deriveIcons` guard; `schemas/icons.json` also rejects an empty dist library. ([#375])
- The Figma sync now resolves nested composite instances to their component via a componentSetId bridge. A nested instance's `componentId` points at a variant node inside a component set; when the direct node-id and key lookups miss, the sync now bridges through `components[componentId].componentSetId` to the registry's set-level `nodeId` (no extra API call), at both the anatomy normalizer (a new Tier 3 after node-id and key) and the registry `nestedComponents` builder. Strictly additive: it only resolves previously-unresolved instances and never changes an already-resolved slug, and private sub-components (whose set is not a published component) stay unresolved. A live spike measured that this resolves about 43% of currently-unresolved nested instances, essentially the whole "set is a published component" population. The effect on the dist (more resolved anatomy instances; composite children in `nestedComponents`) materializes on the next Figma sync. Second slice of Phase 2 identity; unblocks projecting component composition into the graph. ([#371])
- Knowledge graph component nodes now carry the stable Figma `figmaKey` / `figmaNodeId` as queryable identifiers (mapped in the JSON-LD context to `actian-ds:figmaComponentKey` / `actian-ds:figmaNodeId`), so a component is addressable by its rename-proof Figma key rather than only its mutable slug. A new `graph/dist/collisions.json` sidecar records the 22 cross-registry slug collisions (a slug present in more than one kit with distinct keys), each with its candidate `{kit, key, nodeId}` and the kit the graph node resolved to, with a `slug_collisions` count in `quality-report.json`. Purely additive: the node id stays slug-derived, slug is unchanged, and every non-component node and every edge is byte-identical. First slice of Phase 2 identity (key as a carried join). ([#368])
- Knowledge graph now projects the **app-context domain** (apps, domain entities, terminology, UX patterns) as an additive island. 4 new node types (`app`, `app_entity`, `terminology_term`, `ux_pattern`; 96 nodes) and 3 new edge types (`in_app`; `entity_related`, carrying the relationship name in a `predicate` field; `term_about`, inferred term-to-entity/app/pattern bridges where a terminology key matches a node slug; 152 edges) take the graph to 843 nodes / 652 edges. Terminology terms map to `skos:Concept` in the JSON-LD view, with `skos:definition` and `skos:hiddenLabel` (the discouraged alternatives). Edge identity now includes the `predicate` field so an entity pair can carry more than one relationship (e.g. `hasInputs` + `hasOutputs`); the 500 predicate-less existing edges stay byte-identical. Purely additive: the existing 747 nodes / 500 edges and the 6 existing node/edge types are unchanged, and `graph/dist/graph.json` stays canonical. No component bridge is emitted (no authored source links app-context to components). Realizes Plan 2 of the graph-as-spine direction. ([#364])
- Knowledge graph now also emits a linked-data view, `graph/dist/graph.jsonld`, governed by a hand-authored `graph/context.jsonld`. It is a lossless, additive sibling of `graph/dist/graph.json` (which stays canonical): the same nodes and edges wrapped with a JSON-LD `@context` (reusing schema.org/SKOS/PROV, `actian-ds:` for DS-specific concepts), stable IRI identity, and reified edges. No consumer change required; the base JSON is unchanged. This is the keystone of the graph-as-spine direction. ([#361])
- **P2 name layer ACTIVATED: variable-id export populated.** `tokens/src/figma-variable-ids.json`
  is now populated (618 ids exported from the dskit file via `scripts/figma-plugin`), so the join
  resolves real published names: 74 color tokens (appearance `background`/`border`/`text`) and 44
  length tokens (layout `gap`/`padding`). The next Figma sync emits these as `var(--zen-*, value)`
  render facts on real anatomy — flipping the whole P2 name layer (colors + layout) from the
  values-only no-op to live. Also fixes the `scripts/figma-plugin` export crash (`findAll` →
  guarded manual tree-walk; a single unknown node type no longer aborts the export). ([#358])
- **P2 name layer: token names ride the appearance capture.** The nightly sync now records the
  published `--zen-*` custom property each captured **color** appearance slot is bound to —
  `backgroundToken`, `border.colorToken`, `text.colorToken`, per variant — so consumers can emit
  `var(--zen-color-bg-selected, #f3f5f9)`: the value guarantees fidelity, the name enables theming.
  The join is key-based end to end (REST `boundVariables.id` → the committed
  `tokens/src/figma-variable-ids.json` export → `figma-bindings-raw.json` stable keys → a name that
  must exist in `tokens.css` with a slot-compatible value) and does **no** name guessing: the
  published name is the full DTCG path, never a segment-dropped approximation, so a name is never
  fabricated — any miss captures value-only. The id→key export comes from a new minimal Figma
  plugin (`scripts/figma-plugin/`, manual run); until it is populated the sync behaves exactly as
  today. The same map feeds the previously dead `varNameById` path, so layout gap/padding token refs
  light up too. Anatomy schema gains the optional token fields (additive; existing dist stays valid).
  Corner-radius token binding (`radiusToken`) is intentionally deferred: the REST `boundVariables`
  key for a bound corner radius is not verifiable from the public spec, so it waits for a real sync
  payload to confirm the shape rather than ship an unverified assumption (the radius VALUE still
  rides). ([#356])
- **P2 name layer: layout spacing tokens (gap/padding).** The anatomy `layout` now records the
  published `--zen-*` length token each spacing slot is bound to alongside its px value:
  `layout.gapToken` (beside `layout.gap`) and `layout.paddingTokens` (per bound side, beside
  `layout.padding`), so consumers can emit `gap:var(--zen-spacing-xs, 8px)`. Length-gated (a spacing
  slot only ever carries a length-valued token, mirroring the color gate). This also **fixes a latent
  bare-name hazard**: `spacingValue` previously returned the token *name in place of* the px value
  when a variable resolved, which would have written a bare `--zen-*` name into `layout.gap`/`padding`
  (invalid CSS) the moment the variable-id export populated `varNameById`. Layout values are now
  always px, with the token riding in parallel. Additive schema (`gapToken`/`paddingTokens` optional;
  existing dist stays valid); no-op while the export is empty. ([#357])
- **Per-variant icon capture in the anatomy sync.** A variant that swaps an instance's referenced
  component (tag-status swapping its per-status icon) is now captured as a `slug` field on the
  variant delta in `appearance.variants`, so consumers can render each variant's own glyph instead
  of the default variant's (the Success-tag-shows-Fail-icon defect). Additive and optional: the
  anatomy schema's variant delta gains an optional string `slug`; existing dist stays valid, and
  consumers that ignore it behave as before. Real data lands on the next nightly sync. ([#354])

### Changed
- **Breaking Figma sync (2026-07-08).** Component or variant changes the nightly sync classified as breaking; the PR body carries the per-component diff summary. ([#378](https://github.com/volivarii/actian-ds-knowledge/pull/378))
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
- Retired the harvest token-bindings sidecars (`components/dist/token-bindings/`), their generator
  (`harvest-token-bindings.js`), lib, schema, and tests. Superseded by the P2 name layer plus the
  appearance path; the plugin-side consumer (path-b) was retired first, so no reader remains.

### Fixed
- The Figma sync now resolves page-level category overrides on each component's own reported page name (`containing_frame.pageName`), not only the Pages-panel canvas name, so an override still applies when the two diverge (the icons page shows `DS Icons` in the panel while icon components report `Icons`). Unblocks the first post-#375 sync, which the mass-loss tripwire correctly halted with the icon category unrestored. ([#377])
- `transform-registry` no longer emits `categorySlug: "null"` for a
  null-category component (`slugify(null)` guard). ([#375])
- Restored the `Icons` and `Alert (banner)` categories that a Figma page reorg
  had stripped (root cause of the breaking sync PR #374). ([#375])
- The Figma sync no longer hard-fails when a single icon is renamed, removed, or recategorized in Figma. The icons-svg derive previously warn-skipped only a dangling *curated* icon override; an auto-exported icon whose registry category drifted from "Icons" still threw and blocked the entire multi-domain sync (anatomy, registry, tokens, everything). It now warn-skips any invalid icon slug in the sync path (dropping it from `icons.json` with a provenance-tagged warning that says whether to fix Figma or the curated source), while the bare `deriveIcons` call stays strict for direct callers. One stray recategorized icon can no longer block unrelated content. ([#373])
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
[#394]: https://github.com/volivarii/actian-ds-knowledge/pull/394
[#397]: https://github.com/volivarii/actian-ds-knowledge/pull/397
[#398]: https://github.com/volivarii/actian-ds-knowledge/pull/398
[#399]: https://github.com/volivarii/actian-ds-knowledge/pull/399
[#393]: https://github.com/volivarii/actian-ds-knowledge/pull/393
[#390]: https://github.com/volivarii/actian-ds-knowledge/pull/390
[#389]: https://github.com/volivarii/actian-ds-knowledge/pull/389
[#387]: https://github.com/volivarii/actian-ds-knowledge/pull/387
[#385]: https://github.com/volivarii/actian-ds-knowledge/pull/385
[#383]: https://github.com/volivarii/actian-ds-knowledge/pull/383
[#381]: https://github.com/volivarii/actian-ds-knowledge/pull/381
[#379]: https://github.com/volivarii/actian-ds-knowledge/pull/379
[#377]: https://github.com/volivarii/actian-ds-knowledge/pull/377
[#375]: https://github.com/volivarii/actian-ds-knowledge/pull/375
[#373]: https://github.com/volivarii/actian-ds-knowledge/pull/373
[#371]: https://github.com/volivarii/actian-ds-knowledge/pull/371
[#368]: https://github.com/volivarii/actian-ds-knowledge/pull/368
[#364]: https://github.com/volivarii/actian-ds-knowledge/pull/364
[#361]: https://github.com/volivarii/actian-ds-knowledge/pull/361
[#358]: https://github.com/volivarii/actian-ds-knowledge/pull/358
[#357]: https://github.com/volivarii/actian-ds-knowledge/pull/357
[#356]: https://github.com/volivarii/actian-ds-knowledge/pull/356
[#354]: https://github.com/volivarii/actian-ds-knowledge/pull/354
[#351]: https://github.com/volivarii/actian-ds-knowledge/pull/351
[#347]: https://github.com/volivarii/actian-ds-knowledge/pull/347
[#341]: https://github.com/volivarii/actian-ds-knowledge/pull/341
[#346]: https://github.com/volivarii/actian-ds-knowledge/pull/346
[#345]: https://github.com/volivarii/actian-ds-knowledge/pull/345
[#344]: https://github.com/volivarii/actian-ds-knowledge/pull/344
[#340]: https://github.com/volivarii/actian-ds-knowledge/pull/340
[#339]: https://github.com/volivarii/actian-ds-knowledge/pull/339
[#338]: https://github.com/volivarii/actian-ds-knowledge/pull/338
