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

- **The Fat Marker (fm) low-fidelity renderer is now an owned, tested tier, not an incidental dependency** ([#461](https://github.com/volivarii/actian-ds-knowledge/pull/461)).
  `html-renderers/fm-html-map.js` landed in knowledge during the ds-relocation (phase 1a, #442) only
  because `ds-html-map.js` borrows 3 generic helpers from it; nothing in knowledge exercised it on its
  own, and its styling source (`fm-base.css`) never made the move at all. This adds `fm-base.css`
  alongside it (self-contained, no derive needed) and `tests/render/fm-html-map.test.js`, proving
  `renderFMComponent` renders real markup for a representative set of refs, including its
  never-throws graceful-chip fallback. See `components/render/renderer/README.md`.

- **The Claude Design bundle now gives each card a real name and subtitle**, instead of Claude Design's Design System pane showing a bare file slug ([#460](https://github.com/volivarii/actian-ds-knowledge/pull/460)).
  `build-bundle.js`'s `buildBundle()` now returns `{ written, assets }`: `assets` is a `{name, path, group, subtitle}`
  entry per card, for `DesignSync`'s `register_assets` call. `name` comes from the guideline doc's `component`
  field (a humanized slug when a rendered component has none); `subtitle` is the usage note's first sentence,
  capped short. Both derived, nothing new to author. Discovered while comparing our bundle's manifest against a
  separate, richer Actian Claude Design export built through Claude Design's own generative code-authoring flow:
  that project's cards carried `{name, subtitle, viewport}`, ours carried only `{path, group}`. See
  `components/render/README.md`.
- **The Claude Design bundle no longer embeds a visible usage-notes section inside each rendered card** ([#459](https://github.com/volivarii/actian-ds-knowledge/pull/459)).
  `build-bundle.js` used to append a `<section class="ds-usage">` rendering of the note into the card's
  own HTML body, on top of shipping the same content as a `.prompt.md` sibling (#457, below). That
  duplicated what Claude Design's own "Add usage notes" panel already surfaces to a human, and cluttered
  what should be a clean preview of the component. Removed `noteToHtml`/`USAGE_CSS`/`embedUsage`
  entirely; the `.prompt.md` sibling is now the only place a usage note ships.

- **The Claude Design bundle now ships each component's usage notes as a `.prompt.md` sibling of its render card** ([#457](https://github.com/volivarii/actian-ds-knowledge/pull/457)).
  `scripts/render/build-bundle.js` writes `<slug>.prompt.md` next to `<slug>.html` for every rendered
  component with a guideline doc, using the same content as the card's embedded usage section
  (`scripts/render/derive-usage-notes.js`). Confirmed empirically against the live dogfood project
  that Claude Design reads this filename convention as generation grounding, not just human-facing
  docs: two cards already carried hand-pasted `.prompt.md` files from an earlier session's manual use
  of the "Add usage notes" UI, matching this generator's own output shape. Closes what was believed to
  be a manual-paste-only gap; 33 of 35 rendered components now ship notes automatically (2 have no
  guideline doc). See `components/render/README.md`.
- **A graphics asset tier: `components/dist/graphics/graphics.json`** ([#454](https://github.com/volivarii/actian-ds-knowledge/pull/454)).
  A color-preserving sibling to `icons.json` for artwork (illustrations, product logos), derived from
  Figma the same way glyphs are but keeping multicolor fills and gradients instead of rewriting to
  currentColor. Its own namespace (never merged into icons, avoiding the calendar/search slug
  collision), its own derive+bump workflow (or it would never tag and reach a consumer), and its own
  schema and validator. Raster-backed artwork is flagged to a degraded worklist, not shipped. First
  consumers wired in this release: empty-state gains its illustration and the app header gains its logo.
- **`RELATIONS.md`: an author-facing guide to links, connections, and the knowledge graph.** ([#452](https://github.com/volivarii/actian-ds-knowledge/pull/452))
  The Editor surfaces three different ways to connect content in one sidebar, and they are easy to conflate.
  The guide names them (inline links, typed frontmatter connections, and the CI-derived graph), explains that
  backlinks and reverse edges are computed rather than authored, and walks Button through all three. It also
  documents why the Graph group reads "as of last merge" while the other two rescan live. Reference tables for
  the node and edge vocabularies are included, with counts marked as of writing. Linked from `README.md` and
  `editor/README.md`.
- **`digram-item-types`, `digram-topic`, `lineage-individual-node`, `lineage-grouped-node`,
  `metamodel-widget`, and `loader-with-logo` join the hand-authored render tier**, closing 6 of
  the plugin's gray-box fallback slugs. Originally miscategorized as static "diagram/lineage
  graphics" in the 2026-07-13 pictures-vs-components spec; direct inspection of each slug's
  captured anatomy data found real State/Fields variant axes, nested interactive controls, and
  data-driven text content in 5 of the 6, closer in kind to the existing hand-authored
  components than to a static export. Also wires the 6 into `matrix.js`'s `RENDER_SLUGS` so they
  render in the canonical render library, not only the plugin, and de-vacuums the drift gate that
  guards that pairing ([#465](https://github.com/volivarii/actian-ds-knowledge/pull/465)).

### Removed
- **The 35 frozen seed renders and the all-35 oracle** (renderer-relocation phase 3). ([#451](https://github.com/volivarii/actian-ds-knowledge/pull/451))
  `components/render/src/` (15 MB) is gone. The gallery derives entirely from the relocated renderer,
  so the seeds' only remaining jobs were mechanical: the slug list and the card group, both now
  sourced from `matrix.js` and verified equivalent before the switch, plus the page chrome and the
  CEM stylesheet scan, both measured dist-neutral. The all-35 oracle is replaced by
  `tests/render/fragment-invariants.test.js`, which asserts fact-derived structural invariants
  (every cell renders real component markup, no cell degrades to a graceful chip, every cell emits a
  real `ds-` class, the cell count matches the matrix, every slug resolves a real registry group
  rather than silently falling back to `"Components"`, the phase-1b fixes hold)
  rather than comparing against a frozen capture.
  **This ends the manual seed-reclassify step**: a breaking Figma sync that legitimately changed a
  rendered slug used to red the oracle and need a human to reclassify the seed on the sync PR branch
  (#447, and #445/#446 before it). The new gate cannot go stale on a sync.
  Phase 0's byte-identity guard retires with them, for the same reason: it proved the relocated
  assets matched the frozen capture, which is migration safety, and the migration completed and was
  verified end-to-end at phase 2. The three phase-1a byte-identity tests in
  `tests/render/derive-from-renderer.test.js` (button, badge, tag-interactive) retire on that same
  argument; that file's positive marker assertions are untouched.
  `vendor-exclude.json` keeps its declared seam with an empty list: the seeds were the only entry it
  ever had, and the file documents that the exclusion was deliberate rather than lost.

### Changed
- **Three render gates that could not fail were made able to fail** (renderer-relocation phase 3). ([#451](https://github.com/volivarii/actian-ds-knowledge/pull/451))
  Deleting a frozen oracle is only safe if what remains actually bites, so three weak checks were
  repaired in the same change, all mutation-verified. `groupFor` in `matrix.js` ends in
  `|| "Components"` and so can never return a falsy value, which made invariant 5's truthiness
  assertion vacuous; it now fails any slug that lands on that last-resort fallback, meaning every
  slug found a real registry category. This matters more without the seeds, whose `@dsCard` marker
  was an independent second opinion on the group, and while [#428](https://github.com/volivarii/actian-ds-knowledge/issues/428)
  tracks live category drift. Separately, the deleted `validateSeed` was the only thing asserting
  that every `--zen-*` token a render references is actually defined; a test whose title already
  claimed "all defined" only checked the `--zen-` prefix. That test now performs the real resolution
  check over the derived output and reports every unresolved token by name (measured: 66 referenced,
  231 defined, 0 unresolved).
  `validateSeed` enforced a third invariant this note did not originally mention: self-containment,
  that no render carries an external `src=`, `href=`, or `@import`. That is not a coverage gap; it
  remains enforced, transitively over every fragment the derive produces, by the pre-existing "every
  card is self-contained and token-grounded" test in `tests/render/build-bundle.test.js`. Recorded
  here as a relocation note, not a new gate.
  The third repaired check is `tests/render/fidelity-check.test.js`'s first test. `fidelityCheck`'s
  loop only runs over renders carrying `source:"derived"`, and `TEMPLATES` emptied out in phase
  1b-beta, so the loop has examined zero renders since then. The test asserted the real derive's
  result deep-equals `[]`, which passed regardless of any actual color or token regression because
  the code path it claimed to exercise was unreachable. It now asserts the real precondition
  instead, that today's derive has zero `source:"derived"` renders, and is retitled to say so; the
  day a slug is templated again this test fails and tells the reader the gate just went live and
  needs real coverage. `npm run derive:render`'s CLI output now reports that zero renders were
  examined instead of printing a clean result that implies renders were checked.
  `checkBaseCssRules`, which is live today against ds-base.css's tag and checkbox rules, is
  unchanged.

### Added
- **`appearance-render.js` gets the icon injection seam `ds-html-map.js` already had (`setIcons`, `setShadowedSlugs`)** (renderer-relocation phase 3). ([#451](https://github.com/volivarii/actian-ds-knowledge/pull/451))
  Phase 1a gave `ds-html-map.js` this seam and missed `appearance-render.js`, which resolves icons
  independently through the same dual-source idiom (a browser global, or a Node branch that requires
  the vendored `lib/paths`), wrapped in try/catch. `lib/paths` has no counterpart in a vendored
  layout, so that Node branch cannot resolve there, the catch swallows the failure, and a vendored
  consumer silently rendered blank glyphs. Measured impact when unhandled: 2 of 51 anatomy-tier
  slugs lost their glyph. `setIcons`/`setShadowedSlugs` mirror `ds-html-map.js`'s seam exactly;
  precedence is `opts` > injected > module default, so an explicit `opts.iconMap` or
  `opts.shadowedSlugs` (even an explicit `null`) still wins over an injected value.
- **`vendored-source-bump.yml` now also bumps on a change to `components/render/renderer/`, so a renderer-only source change reaches consumers.** ([#451](https://github.com/volivarii/actian-ds-knowledge/pull/451))
  The renderer ships to consumers as source, same as `clients/` and `schemas/`, but
  `render-derive.yml` bumps only when the regenerated `dist/` actually changes. A renderer-only
  change that is inert by design, such as an injection seam with no caller yet, produces no dist
  diff, so `render-derive.yml` never sees it and never bumps. That is the same hole
  `vendored-source-bump.yml` was created to close for `clients/` and `schemas/`, now closed for the
  third directory phase 2 added to that same shipped-as-source class.
- **`validate-manifest` now rejects a collection pattern that cannot resolve, so the mistake fails at PR time instead of at first call.** ([#450](https://github.com/volivarii/actian-ds-knowledge/pull/450))
  Only two `pattern` shapes resolve: one containing `{slug}`, or exactly `{name}`. Anything else
  describes the layout for enumeration and must now declare `"resolvable": false`. This is the
  shift-left for the class of defect behind the `{name}` bug: an unresolvable pattern used to merge
  green and lie dormant, because the resolver answered with a fabricated path or a `null` that read
  as "not found". A realistic typo such as `{slugs}.json` is now a red check.
  Applying the gate to the existing manifest found one collection worth **fixing** rather than
  documenting: `components.icons.dist` declared `{name}.json`, which never resolved, so its
  `icons.json` and `icons.degraded.json` were unreachable through the manifest. Its pattern is now
  `{slug}.json` and both members resolve. `foundations.leaf` and `accessibility.leaf` are genuinely
  descriptive (Pattern H nests arbitrarily deep, which no single pattern addresses) and are marked
  `resolvable: false`, with a note that switching them to `{name}` would make them resolvable if a
  consumer ever needs it. `clients/resolve-paths.js` reports a declared-descriptive collection as
  such rather than repeating the "fix your pattern" advice.
- **`vendored-source-bump.yml`: a change to `clients/` or `schemas/` now bumps the version, so it can reach consumers.** ([#449](https://github.com/volivarii/actian-ds-knowledge/pull/449))
  Consumers pull this repo **by tag**, and `tag-on-merge.yml` only emits a tag when
  `package.json#version` changes. Every bump lived inside a *derive* workflow, gated on whether the
  regenerated `dist/` changed. That covers `src/` to `dist/` domains, but not the two directories
  that ship to consumers as **source** and have no derive at all: `clients/` (the reference readers
  consumers `require` directly, including the plugin's `scripts/lib/paths.js`) and `schemas/`. Both
  are in `vendor-include.json`, so both are shipped, yet a PR touching only them never bumped,
  never tagged, and reached nobody. Such changes had only ever shipped by riding along on an
  unrelated bump, which is luck rather than a pipeline. Surfaced by [#448](https://github.com/volivarii/actian-ds-knowledge/pull/448), a real
  `resolve-paths.js` fix that merged to `main` and was reachable by no consumer. The bump is
  idempotent: it compares the version at the **merge base** rather than at `main` (which moves on
  its own via nightly syncs) and stands down when the branch has already bumped, including via a
  derive on the same PR.

### Fixed
- **`clients/resolve-paths.js`: `{name}` collections now resolve instead of returning `null`.** ([#448](https://github.com/volivarii/actian-ds-knowledge/pull/448))
  A `{name}` collection addresses a member by its path relative to the collection directory
  (`ds-base.css`, `html-renderers/ds-html-map.js`) rather than by a slug with an extension
  appended. The builder only ever substituted `{slug}`, so `{name}` survived, matched the
  leftover-placeholder branch, and fell through to the recursive `<slug>.md` sub-directory walk:
  **every** `components.render.renderer(...)` lookup returned `null`. The collection was declared
  in renderer-relocation phase 0 but had no consumer until the plugin began requiring the vendored
  renderer, so the defect was latent. Verified against the real manifest: all 11 renderer members
  now resolve to real files, and `{slug}` collections are unchanged. Traversal outside the
  collection directory throws rather than resolving.
- **An unresolvable collection pattern now fails loudly instead of returning a fabricated path or a
  null.** ([#448](https://github.com/volivarii/actian-ds-knowledge/pull/448))
  This is the root cause behind the `{name}` bug above: the resolver silently mis-resolved any
  pattern shape it did not recognize, so nothing ever surfaced. Two shapes in the manifest were
  affected. `foundations.leaf` and `accessibility.leaf` declare `<topSlug>/.../<slug>.json`, whose
  angle brackets meant no substitution happened and no braces remained, so the resolver returned
  the pattern **verbatim**: a literal `<repo>/foundations/dist/<topSlug>/.../<slug>.json` for every
  input. `components.icons.dist` declares `{name}.json`, which fell through to the `<slug>.md` walk
  and returned `null` for every input. Both are descriptive patterns that document the layout for
  enumeration and cannot address a member, so calling them now throws a diagnostic naming the
  collection, its pattern, and the two resolvable forms. **No behavior change for any caller:**
  neither repo has a single runtime call site for these three collections (grep confirms only
  manifest declarations, docs, and a test asserting the entry exists), which is precisely why the
  breakage went unnoticed.

### Changed
- **Breaking Figma sync (2026-07-19).** Component or variant changes the nightly sync classified as breaking; the PR body carries the per-component diff summary. ([#447](https://github.com/volivarii/actian-ds-knowledge/pull/447))
- **Render: the whole 35-slug canonical render gallery now derives from the relocated generic renderer, not from frozen seeds (renderer-relocation phase 1b-beta).** ([#444](https://github.com/volivarii/actian-ds-knowledge/pull/444))
  The derive is wired straight to `deriveFragment`, so every slug renders through the one
  relocated renderer instead of passing through captured seeds. Fixed radio-button and toggle to
  emit their real `Selection` state; both carried the same `Selected === "Yes"` bug that checkbox
  had before phase 1b-alpha. tag-default now renders every registry color through the generic
  renderer via a matrix override, so all eight color variants render correctly without a
  dedicated template. The two slice-2 templates (tag-default, checkbox) are retired
  (`TEMPLATES = {}`), while the `TEMPLATES[slug]` escape-hatch hook itself stays in place for a
  future case that needs it. The transient render.css tag/checkbox CSS duplication is gone; that
  styling now lives once, in `ds-base.css`. Manifest `source` gains `"rendered"` (generic
  renderer) alongside `"derived"` (escape-hatch, currently unused) and `"captured"` (legacy). The
  fidelity gate (`fidelityCheck`) is retained for a future escape-hatch template render; with no
  slug currently stamped `source: "derived"`, its appendix check is a no-op today, while
  `checkBaseCssRules` keeps validating the ds-base.css tag/checkbox rules against facts. The
  contact-sheet sign-off page now iterates a fixed list of the four slugs this slice improved
  (tag-default, checkbox, radio-button, toggle) instead of filtering on `source: "derived"`.
  `render-derive.yml` now also triggers on `components/render/renderer/**`, since the committed
  render dist derives from the relocated renderer and a renderer-only change must regenerate it
  too. Known follow-up: the toggle case still references a dead `v["Toggle location"]` axis (the
  real axis is `Toggle position`); inert in the gallery today, to fix later. Same shape in the
  radio-button case: a dead `v.Format === "Card format"` check, since card format is a separate
  Figma component rather than a variant axis on radio-button, also inert today. Also open:
  `checkBaseCssRules` fact-verifies the tag and checkbox color rules but does not yet cover the
  newly live `.ds-radio--checked` / `.ds-toggle--on` colors, a coverage asymmetry to close later.
- **Render: tag-default and checkbox now render correctly in the generic renderer, not only via the slice-2 template override (renderer-relocation phase 1b-alpha).** ([#443](https://github.com/volivarii/actian-ds-knowledge/pull/443))
  `ds-base.css` gains the `.ds-tag--<color>` color variants (value-first from the appearance
  facts) and the `.ds-checkbox--indeterminate` rule; `ds-html-map` emits the tag color class and
  the checkbox `Selection`-based state classes (Checked/Indeterminate/Disabled) with the right
  glyph. The fidelity gate now also verifies the ds-base.css tag/checkbox colors trace to facts.
  The phase-0 byte-identity guard relaxes to a prefix check (the seed stylesheet stays a verbatim
  prefix of the asset base; the fix only appends). Proven via deriveFragment; the derive still
  ships tag/checkbox through the slice-2 templates until phase 1b-beta wires the derive to the
  renderer and retires them.
- **Render: the DS component renderer now lives in knowledge (renderer-relocation phase 1a).** ([#442](https://github.com/volivarii/actian-ds-knowledge/pull/442))
  The plugin's fact-driven renderer (`ds-html-map` plus the appearance/anatomy interpreters) is
  copied into `components/render/renderer/`, structure-preserving, with its `lib/paths` coupling
  severed by dependency injection (anatomy loaders and an icon map are injected from knowledge's
  local facts). A new `scripts/render/derive-from-renderer.js` runs the relocated renderer over a
  component's variant matrix and reproduces the frozen seed byte-for-byte, proving knowledge can
  derive its gallery instead of reading captured seeds. The plugin's own renderer is untouched (it
  vendors knowledge's copy back in a later phase); the captured seeds stay as the byte-diff oracle.
- **Render: knowledge now owns `ds-base.css` (the leaf styling source), and `render.css`
  derives from it (renderer-relocation phase 0).** ([#441](https://github.com/volivarii/actian-ds-knowledge/pull/441))
  The shared stylesheet was previously a concatenated snapshot of the plugin's `ds-base.css`
  baked into the frozen seeds; it is now built from
  `components/render/renderer/{ds-base,ds-fonts}.css` directly (as `tokens.css` + `ds-fonts.css`
  + `ds-base.css`, the render read path's order), guarded byte-identical against the deduped seed
  stylesheet so a drift between the assets and the seeds fails the derive loudly. The assets are
  exposed as the `components.render.renderer` manifest collection, so they are covered and travel
  with the render surface into the vendor snapshot; the plugin will vendor them back and drop its
  own copies. First step of moving the one renderer into the substrate so there is a single owner
  instead of two divergent renderers.
- **Render: tag-default and checkbox are now derived from the resolved-appearance facts, not
  captured verbatim (North Star slice 2).** ([#440](https://github.com/volivarii/actian-ds-knowledge/pull/440))
  A per-component template layer (`scripts/render/templates/`) generates these two renders from
  `components/dist/anatomy/<slug>.json` instead of passing through the plugin's captured seed.
  tag-default's eight color variants and checkbox's four states (including a new `--indeterminate`
  treatment that `render.css` previously lacked) now render correctly, where the capture had lost
  the tag colors (every tag rendered gray) and collapsed every checkbox to an empty box. Each render
  is stamped `source: "derived" | "captured"` in the manifest (2 derived, 33 captured today), so the
  honest split is visible rather than hidden behind a "renders clean" count. Token binding is
  value-first: a `var(--token)` is emitted only when the token round-trips to the fact's resolved
  value, which caught four stale tag background-token attributions that resolved to near-gray
  neutrals.

### Added
- **A two-tooth render fidelity gate (North Star slice 2).** ([#440](https://github.com/volivarii/actian-ds-knowledge/pull/440))
  `scripts/render/fidelity-check.js` is a data-invariant CI check, chained into `derive:render`: for
  every `derived` render, each emitted color must equal a resolved-appearance fact and each emitted
  token must round-trip to a fact value, or the derive fails. `scripts/render/build-contact-sheet.js`
  generates an HTML contact sheet placing each derived card beside its Figma `media/<slug>/*.webp`
  oracle for human sign-off. The manifest schema (`schemas/canonical-render.json`) gains a `source`
  property.
- **The canonical render now ships to consumers, deduplicated (North Star slice 1b).** ([#438](https://github.com/volivarii/actian-ds-knowledge/pull/438))
  `components/render/dist/` is committed and vendorable: one shared `render.css` (inlined once) plus
  a thin `fragments/<slug>.html` per component, alongside the Custom Elements Manifest, the render
  index, the per-component usage notes, and the portable `tokens/dist/tokens.dtcg.json`. The 35
  self-contained seeds compressed from ~15 MB to a ~1 MB dedup dist because every seed inlined the
  same 431 KB stylesheet. `build-bundle.js` reconstructs the self-contained Claude Design `@dsCard`
  cards on demand from the shared css plus each fragment. The `validate-manifest.js` orphan-skip for
  `components/render/` is retired now that the domain is declared.
- **The substrate can now declare vendor exclusions for heavy build intermediates.** ([#438](https://github.com/volivarii/actian-ds-knowledge/pull/438)) A new
  `vendor-exclude.json` at the repo root lists repo-relative sub-paths a consumer's vendor must skip
  even when their top-level directory is included, and the shared vendor client
  (`clients/vendor-snapshot.js`) honors it. The repo declares `components/render/src` (the 15 MB
  captured seed renders, a capture intermediate), so only the ~1 MB deduplicated render dist reaches
  the plugin, not the seeds.
- **Editor: inline reference hover-preview card (and a fix that revives the
  cross-surface highlight).**
  ([#437](https://github.com/volivarii/actian-ds-knowledge/pull/437))
  Hovering an inline typed link now shows a card with the target's type badge,
  cleaned title, and graph context (its category + how many components use it),
  replacing the bare type tooltip, in both the preview and rich mode. The review
  also caught that the controllers (this card and the #435 highlight) were
  installed from a `useEffect([])` reading a ref on a root that renders only
  after a loading spinner, so they never activated in the app; a callback ref
  fixes both. Editor tooling only, view-only: no `dist`/schema/contract change.
- **Editor: a compact neighborhood map beside the note.**
  ([#436](https://github.com/volivarii/actian-ds-knowledge/pull/436))
  The relations rail now shows a compact typed graph of the current file's
  neighborhood (when the file resolves to a graph node). Its nodes carry
  `data-ref`, so the map joins the coordinated highlight: hovering a typed inline
  link, a rail row, or a map node lights the other two. Clicking a neighbor opens
  it; the "you are here" node is inert. Editor tooling only, view-only: no
  `dist`/schema/contract change, so the version lockstep is untouched.
- **Editor: coordinated cross-surface relation highlight.**
  ([#435](https://github.com/volivarii/actian-ds-knowledge/pull/435))
  Hovering or keyboard-focusing an inline typed link now lights the matching
  relations-rail row, and vice versa: a delegated controller on the edit-screen
  root toggles a highlight class on every element sharing a `data-ref` (the
  bare component slug both ends now expose). Completes the inline-reference arc.
  Editor tooling only, view-only: no `dist`/schema/contract change, so the
  version lockstep is untouched.
- **Editor: inline links to a component render as typed references.**
  ([#434](https://github.com/volivarii/actian-ds-knowledge/pull/434))
  A markdown link whose href resolves to a real component node now shows a color
  dot by node kind (from the shared `relationTypes` palette) plus a tooltip
  naming the type, instead of a cryptic bare slug, in both the preview
  (react-markdown) and Milkdown rich mode (a view-only ProseMirror decoration).
  Resolution is honest: external URLs, paths, in-doc anchors, and slugs with no
  matching component stay plain links. The rich-mode decoration never edits the
  doc, so serialization and its round-trip guards are untouched. Editor tooling
  only: no `dist`/schema/contract change, so the version lockstep is untouched.
- **Editor: relations read as typed, human-labeled links, not raw edge keys.**
  ([#433](https://github.com/volivarii/actian-ds-knowledge/pull/433))
  The relations panel's graph section no longer shows a flat list of internal edge-type badges
  (`composed_of`, `uses_component`, `in_category`). Neighbors are grouped under author vocabulary
  (Appears in, Used in patterns, Contains, Category, Meets accessibility criterion), ordered so a
  component's own facets come before the large incoming crowds, and each row carries a color dot
  typed by node kind from a new shared palette (`relationTypes`) that the graph map consumes too.
  The honest "as of last merge" note stays. Editor tooling only: no `dist/`, schema, or contract
  change, so the version lockstep is untouched.
- **The canonical render library now covers 35 components (North Star Step A).** The plugin's
  capture-seed was generalized from Button to all 35 components the plugin renders: each component's
  variant matrix is derived from its registry variant axes (primary axis, capped, plus a disabled
  state), grouped by DS category, and `derive-canonical` now derives each component's Custom Elements
  Manifest from the registry (tag `zen-<slug>`, attributes from the variant axes) when there is no
  hand-authored override. The DesignSync bundle is now 38 cards: 35 component cards across 6 categories
  (Action, Data Display, Feedback, Form, Navigation, Overlays), each with its render matrix + usage
  section, plus the 3 foundations cards. Button keeps a curated Intent x Emphasis override. dist stays
  uncommitted; shipping to consumers is a later slice.
- **Per-component usage notes, derived from the guideline domains (North Star slice 2).**
  `scripts/render/derive-usage-notes.js` composes a concise, honest usage note per component
  (`usageNote(doc, opts)`): it dedupes the "When to use" / "When not to use" bullets, pulls "Style",
  resolves `inherited` domains from the component's category-defaults, and footers a disclosure naming
  any draft/inherited/synthesized source used. `deriveAll` writes `components/render/dist/usage-notes/<slug>.md`
  for every component with guideline prose (65 today). The note is consumer-agnostic markdown: the
  DesignSync bundle embeds it as a "Usage" section on each rendered component card (Button today), and the
  plugin and docs can consume the same file. Permissive by default (approved plus draft, inherited,
  synthesized); an off-by-default `--strict` flag restricts to approved-only (a future gate). dist stays
  uncommitted; shipping is slice 2b.
- **New `components/render/` domain: the canonical component render, seeded on Button (North Star slice 1).**
  ([#430](https://github.com/volivarii/actian-ds-knowledge/pull/430))
  The substrate now owns a self-contained, token-bound HTML render per component plus its standards
  contract. Slice 1 proves the chain end to end on Button:
  - `components/render/src/button.html` seeds the canonical render (the Button variant matrix, Intent x
    Emphasis plus a disabled state, captured from the plugin's hand-authored renderer). This is a SEED;
    slice 2 replaces it with a real derive from the appearance facts.
  - `scripts/render/derive-canonical.js` validates each seed (first-line `@dsCard` marker,
    self-contained, every referenced `--zen-*` token defined) and emits a Custom Elements Manifest
    (tag `zen-button`; attributes intent/emphasis/size/disabled; cssParts label/icon; cssProperties
    scraped from the button's own rules, its real 19-token surface). The emitted CEM is validated
    against the official Custom Elements Manifest schema, vendored at `components/render/schema/`.
  - `scripts/render/derive-dtcg.js` emits a portable DTCG token export (`tokens/dist/tokens.dtcg.json`)
    by cleaning repo-internal provenance and Figma variable keys from the already-DTCG `tokens.json`.
  - `scripts/render/build-bundle.js` composes the DesignSync `@dsCard` bundle (Components render plus
    Colors/Type/Spacing foundations cards from the resolved tokens).
  - New schema `schemas/canonical-render.json` (the render dist manifest envelope).

  Slice 1 runs the derive LOCALLY to prove the chain; `dist/` stays uncommitted and the domain is not
  yet part of the declared distributable surface (`scripts/validate-manifest.js` skips it in the orphan
  guard). The CI render-derive workflow, vendor include, and version bump that ship it to consumers are
  slice 1b.

### Fixed
- **The test glob skipped `tests/render/`, so the render tests never gated CI.** `npm test` ran
  `node --test tests/*.test.js`, which matches only the top level of `tests/`, so the slice-1 and slice-2
  render tests under `tests/render/` never ran in CI (they merged green because CI never executed them).
  Switched to the recursive `find | xargs` form the plugin repo already uses; CI now runs 1100 tests
  (was 1082), including the 18 render tests.
- **A Figma reorg that re-bucketed components red the nightly sync every night, though nothing was lost.**
  Component categories are inferred each night from the Figma Pages panel (a Title-Case header page sets
  the category for the member pages beneath it), so while the file is being reorganized a still-published
  component comes back with its category dropped to null or re-derived to a non-category (its own page
  name). The mass-loss tripwire, keyed on a category COUNT hitting zero, then refused to emit the registry
  (Feedback 11 to 0, Data Display 31 to 0, Form 11 to 0 on 2026-07-15, issue #425), so an additive sync
  could not auto-merge and the vendor queue stalled. But those 53 components were still published in
  Figma; they had only moved pages.
  Two changes let the sync ride the churn. `preserveKnownCategories` carries a survivor's last-known
  category (and its `section`/`group`/`status`) forward, matched by its stable Figma identity, whenever
  this sync fails to attribute a valid one, so it keeps its place in `categories.json`, the docs page
  tree, and the graph instead of falling out. And the mass-loss tripwire is now REMOVAL-based: a category
  counts as a loss only when its members are genuinely ABSENT by identity, not when they were re-bucketed,
  so a page rename can no longer red the nightly. Both self-retire once the file settles (a stable file
  produces zero drift), and every preserved component is named in the sync run log (and the PR body when a
  sync opens one) and raised as a non-blocking, auto-closing `category-drift` issue so a reshuffle still
  reaches a human. (#426)
- **A test about app-context was pinned to the whole graph's size, so every Figma sync went red.**
  `tests/graph-app-context-projection.test.js` asserted the **total** node and edge
  counts (`g.nodes.length === 815`, `@graph.length === 815 + 1072`). Those totals move
  whenever Figma changes a component, which has nothing to do with app-context. So a
  routine sync turned a required check red and a human had to hand-restamp the constants
  (see `test(graph): restamp the pinned counts`, pushed onto sync #415; sync #422 failed
  the same way, on 2 legitimate `composed_of` edges after `search-result-card` gained a
  nested checkbox).
  This was worse than noise. An **additive** sync that trips it goes red, **fails to
  auto-merge, and the vendor queue stalls with nobody told**, which is precisely the
  silent-failure pattern the alarm was supposed to serve. An alarm that fires on the
  system working normally is how the alarm that matters gets scrolled past.
  The assertions now pin the **app-context island** (96 nodes, 245 edges), which is what
  this test is actually about. The island is projected from authored app-context sources,
  not from Figma, so it moves only when someone edits app-context, which is the change the
  test exists to catch. The losslessness assertion beside it (`@graph.length === nodes +
  edges`) is data-derived and already held at any graph size. Verified both ways: the
  suite is green on `main` **and** on the #422 sync branch with no restamp, and adding a
  single app-context term still fails the check by name.
- **Ten components showed no guidance at all, and the plugin was inventing it for them.**
  Consumers resolve a guideline by its **registry key**, not by the slug it was
  authored under. The Card and Tag guidance is written as **family-level** documentation
  (`"This guideline covers the tag family: default, status, stage, catalog, ..."`), but
  only `tag-default` was ever bridged to the family doc. So `Tag, Status`, `Tag,
  Interactive`, `Card for items` and 7 more resolved to **nothing**.
  Two things followed from that, both silent. The docs site rendered those 10 component
  pages with no guidance. Worse, the plugin's `component-brief` treats a missing guideline
  as a cue to **generate replacement content inline** (`_source: "generated"`), so a
  designer asking for a brief on *Card for items* got **LLM-improvised guidance** instead
  of the approved document sitting one directory over, with no warning. Content silently
  replaced by plausible fiction is worse than content missing.
  Fixed by 10 `registryAliases` entries, which put ~1,300 words of already-approved
  guidance onto 10 live pages and stop the fabrication. No content was written; it was
  already there.

### Added
- **A gate: authored guidance must actually reach a consumer.**
  Nothing checked that a guideline's slug existed in the registry, so a document could be
  authored, derived, bundled, advertised in `llms.txt`, and reported **`approved`** in
  `coverage.md` while no consumer on earth could render it. That is how the above went
  unseen: **coverage counted what was authored, not what reached a reader.**
  `tests/guideline-reachability.test.js` now fails when an authored guideline is neither a
  registry key nor the target of an alias. The **6** that genuinely reach nobody today are
  named in it, each with a reason, so they are a reviewed list rather than a silence:
  `combo-box` and `multi-select` (authored ahead of Figma on purpose), `global-toast` and
  `inline-toast` (Figma ships no toast component), `success-state` (superseded by
  `confirmation`), and **`upload-file`**, which needs a design decision.
- **`upload-file` has approved guidance for a component that does not exist.**
  Surfaced by the gate above. There is no **Upload file** component in DS Kit and there
  never was: the `upload-file` key that sat in `dskit.json` until 2026-07-13 was an **icon
  glyph** (page `✍️ Icons`), squatting the component slug under the old flat
  icon-and-component namespace. The icon-namespace split (#418) moved icons out, and that
  is what revealed the guidance had never had a component behind it. Only FM Kit (the
  wireframe kit) has `upload` / `cloud-upload`. Unlike `combo-box` and `multi-select`,
  which were authored ahead of Figma deliberately, this one looks accidental: its content
  is marked `approved`. Either the component gets built in Figma, or the guidance is
  retired. Not folded into #406, which is scoped to deleted **glyphs**.
- **Icons get their own namespace, so a component can never eat a glyph again.**
  A design system may legitimately ship a `calendar` **icon** and a `Calendar`
  **component** — and it does. They are different **kinds** of thing, and the sync
  can tell which is which: an icon comes off an Icons page, so its category says
  so. Forcing them to share one flat slug-keyed map meant one of them had to lose,
  and the loser did not get renamed, it **vanished**. That is how the DS came to
  ship with **no calendar glyph and no search glyph**.
  Renaming the icons in Figma would only have postponed it: `link`, `table`,
  `settings` are all words an icon and a component can reasonably both want, so the
  clash recurs forever. The registry now carries an `icons` map alongside
  `components`, keyed by the icon's own name, where nothing can take its slug. The
  icon pipeline (`export-icons-svg`, `derive-icons-svg`) reads that map instead of
  filtering `components` by category, and therefore stops losing icons to component
  names.
  **Purely additive**: `components` is unchanged (the component still wins that
  map, so no consumer key moves, and every uncontested icon is still there too).
  An icon/component name clash is consequently no longer reported as a loss — it is
  `namespaced`, and reported not at all, because it is the system working rather
  than an anomaly, and an alarm that shouts about a non-problem is how the section
  that catches a **real** loss gets scrolled past. A non-icon losing a slug is
  still a loss and still shouts. ([#418])

### Fixed
- **A component that resolves to NO category is now named, instead of vanishing
  quietly.** A category-less component falls out of `categories.json`, the docs
  site's page tree, and the graph's `in_category` edges — the docs site does not
  generate a page for it at all — and nothing said so.
  `assertNoCategoryMassLoss` only fires when a whole category is **gutted**
  (≥10 members → 0), so exactly one component slipping out was invisible to it.
  That is what happened to **`toggle`**, the only category-less component of 286:
  its Figma page was renamed `Toggle control` → `Toggle` on the canvas, but the
  library was **not republished**. Category inference reads the **live** document
  tree (which said `Toggle`) while each component's page name comes from
  **published** metadata (which still said `Toggle control`), the two stopped
  matching, and the category evaporated in silence. Downstream, the docs build
  went red on an unresolvable `toggle-control` link with no hint as to why.
  The sync now prints it and gives it its own section in the PR body, naming the
  published page that failed to match and pointing at the likely cause. Scoped to
  kits that actually infer categories: FM Kit and Meta Kit have no page-category
  structure at all, so their 315 components are legitimately category-less and
  warning there would bury the one that matters. ([#414])
- **Slug collisions are split by severity, because most of them are not losses.**
  The tripwire's first real run found **ten** collisions — and only **two** were
  losses. Rendering them alike is exactly how a real alarm becomes wallpaper, so
  they now report as two separate sections:
  - 🚨 **LOST from the design system** — two *different* components want one slug,
    so the loser disappears. Real, and there are two: **`calendar`** and
    **`search`**. A component *set* (`Calendar`, `Search`) owns each slug, so the
    **icon** of the same name is dropped and the DS has **no calendar or search
    glyph at all**. That is why the plugin's `renderIcon("calendar-2")` had
    nothing to resolve.
  - ⚠️ **Duplicate master** — the *same* component published from two nodes
    (`add`, `directory`, `export`, `glossary`, `logout`, `process`, `snowflake`).
    The slug still resolves to the survivor, so **nothing is missing**. Expected
    while the icon masters live on two pages during the 2026-07 refactor; Figma
    hygiene, not data loss, and it must not shout like one.

  Discriminator: same name **and** same `importMethod` means one component
  published twice; anything else means two different components want one slug and
  the loser is genuinely gone. ([#413])
- **The sync no longer loses a published component in silence (slug collisions
  are named).** `registry.components` is keyed by **slug**, and when a standalone
  and a component set slugify to the same string the set wins and the standalone
  is dropped. That policy is fine; doing it *silently* was the bug. The loser did
  not lose a name, it **disappeared from the design system** — no error, no diff
  line, nothing in the sync PR, nothing in the run log.
  Nothing downstream could catch it either: `detectSlugCollisions` reads the
  already-slug-keyed `components` map, so by the time it runs the loser is gone.
  It can only ever see **cross-kit** collisions. The transform is the only place
  the loss is knowable, so it now reports it.
  This is what ate the **`calendar` icon**: the Calendar *component* (a set,
  category Action) already owned the slug, and the 2026-07 icon rework renamed the
  glyph from `calendar-2` straight onto that collision — which is almost certainly
  why the old name existed. The plugin's `renderIcon("calendar-2")` (the
  `input-date` calendar affordance) consequently had nothing to resolve, and it
  read as "Figma deleted the icon" when Figma had done no such thing.
  A collision now prints in the run log **and** gets its own 🚨 section in the sync
  PR body, naming both sides with their node ids so the two nodes can be opened and
  one renamed. Warn-loud rather than hard-fail: a hard fail would block every sync
  until Figma is edited, which is the failure mode that already cost three days of
  dead syncs. ([#412])

### Added
- **Usage guidelines: wave 2 completes the domain (38 remaining components).**
  Every component now carries authored Usage guidance: the second wave covers
  navigation and chrome (breadcrumbs, global header, side nav, toolbar,
  sticky footer, link), the search flow (search, its dropdown menu, filters,
  result card), the feedback and loading families (alert banner, notification
  pair, confirmation, the state screens, all five loading indicators), the
  remaining inputs (combo box, multi-select, calendar, date input, rich text,
  upload file) and display containers (avatar, badge, popover, drawer,
  stepper, accordion, scroll bar, segmented control, tag, what's new).
  Same canonical shape and grounding as wave 1 ([#403]); boundary-heavy
  families were authored together so every "use X instead" is symmetric
  (the five-way loading boundary, the four-part search flow, toast vs
  notification vs banner). Fifteen more component-level `a11y_refs` wired
  (loading-patterns, alerts-toasts-banners, empty-states, forms,
  dropdowns-menus-popovers), growing the graph to 1104 edges. Usage
  coverage: 54/54. ([#404])
- **Usage guidelines: first authored wave (15 core components).** The Usage
  domain, until now "not started" across the board, gets its first real
  content: button, modal, text-input, dropdown-select, checkbox,
  radio-button, toggle, table, tabs, card, tooltip, global-toast,
  inline-toast, empty-state and page-header each gain a
  `components/src/<slug>/usage.md` answering when to use, when to reach for
  the alternative (slug-linked), and which variant fits which situation
  (grounded in the synced registry's real variant axes and Figma-authored
  descriptions). All files share one canonical section shape (When to use /
  When not to use / Variant selection / Do-Don't), the de facto usage canon
  for the remaining components. Statuses flipped to `draft` in each
  component's `_meta.yml`; coverage.md reflects the wave after derive. A
  five-lens review pass (grounding, consistency, pipeline, UX/a11y
  correctness, voice) hardened the wave before merge; en route it wired the
  four missing component-level `a11y_refs` (radio-button, tooltip,
  global-toast, empty-state), adding three `a11y_ref` edges to the graph
  (1084 to 1087). ([#403])
- **Editor: calm frontmatter forms + the chrome wears the system's own
  colors.** The frontmatter-form redo's presentation half (research-backed:
  NN/g progressive disclosure, Sanity-style fieldsets): forms now support
  named field groups — expanded groups render under the same quiet uppercase
  label the meta form and sidebar use; system-managed groups collapse into a
  disclosure — and schema descriptions moved from always-on gray paragraphs
  to a keyboard-focusable info glyph beside each label (fields can opt back
  in with `inlineDescription`). App-context and category forms regrouped
  accordingly. Visually, the editor's solid accent now derives from the
  design system's own interactive-blue tokens instead of generic Radix
  indigo, and the Explore dashboards drop their dev jargon (no more
  `_meta.yml` in author-facing copy) and join the page's heading outline.
  ([#402])
- **Editor: outgoing reference rows navigate.** In the relations panel, the
  "References" rows now open their target on click or Enter, the way incoming
  and graph rows already did: a component reference opens its authoring
  workspace, an accessibility or foundations reference opens its source page.
  Rows with nowhere to go (broken refs, motion and content references, which
  have no standalone editable file) stay plain. Resolution reuses the same
  node-id path mapping the graph rows use, so there is exactly one
  place that decides where a reference leads. This closes the last recorded
  gap in the editing-direction's "follow a connection" flow. ([#401])
- **Editor: a live freshness chip.** The header now shows the knowledge version
  and when the substrate last changed ("v0.34.83 · updated 3h ago"), fetched
  live from main rather than baked at build time, since the editor SPA only
  redeploys on editor changes. The oracle is `paths-manifest.json`: it is
  CI-stamped on every substrate change and never hand-edited, so editor-only
  merges don't move the date and dependency edits can't fake a knowledge
  change. The label re-derives every minute, the chip stays silent rather than
  guessing when the probes fail, and it replaces the hero's static "updated at
  every merge" badge with a claim that proves itself. Answers the direction's
  "what's up to date" question (flow 4). ([#399])

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
- **Breaking Figma sync (2026-07-17).** Component or variant changes the nightly sync classified as breaking; the PR body carries the per-component diff summary. ([#439](https://github.com/volivarii/actian-ds-knowledge/pull/439))
- **Breaking Figma sync (2026-07-14).** Component or variant changes the nightly sync classified as breaking; the PR body carries the per-component diff summary. ([#422](https://github.com/volivarii/actian-ds-knowledge/pull/422))
- **Breaking: two component slugs renamed to match Figma (`checkbox-with-label`
  → `checkbox`, `breadcrumbs` → `breadcrumb`).** The 2026-07-12 Figma sync
  ([#408]) renamed both published components. A registry slug is a cross-repo
  contract, not a label: consumers resolve guidelines **by registry key**, so a
  rename orphans the authored content and breaks every hardcoded reference. The
  sync and the rename therefore land **together**, in one PR, so `main` never
  carries a registry that disagrees with the guidelines it points at. On the
  knowledge side: `components/src/breadcrumbs/` becomes
  `components/src/breadcrumb/`; the `checkbox-with-label` → `checkbox` entry in
  `registryAliases` is **deleted**, because this rename *is* the naming
  convergence that alias existed to paper over; and eight curated
  `icons-svg.json` overrides are dropped now that the icon rework deleted the
  components behind them. The rework's dropped glyphs shrink the graph to 814
  nodes / 1060 edges and the cross-registry slug-collision set to 17.
  **Downstream consumers must follow**: the plugin still references
  `checkbox-with-label` in its FM→DS map, its HTML renderer map, and its
  authoring docs, and `actian-ds-docs` must delete the now-inverted `checkbox`
  entry in `SLUG_ALIASES`. ([#410], superseding the sync-only [#408])
- **Editor: sidebar IA refined to Vincent's structure.** The Design system
  half now reads Foundations → **Content** (a nested parent holding Writing
  rules, Patterns, and Product as indented children — the "copy"
  disambiguators became unnecessary once the parent gives context) →
  Accessibility → Components. The second dimension is renamed **Application
  context**, holding **Products** (the apps), **Entities**, and **Features**
  (the name matches what those files actually are: import-wizard,
  lineage-graph, marketplace-browsing). The Content parent collapses as one
  unit and carries the combined count; its children keep their own add and
  collapse affordances. ([#400])
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
- **Losing imagery is now a breaking sync too, and the remaining blind spots are named.** ([#409])
  After the icon incident, every sync phase was audited against one question: *what does loss look like
  here, and would we notice?* The icons bug was not a one-off. It was the house style: three phases
  decided their verdict from "did I write any bytes" rather than from a diff, with **no code path to
  `breaking`** at all.

  `components/dist/media/_index.json` is the sidecar consumers actually resolve imagery through, and it
  is a pure directory listing with **no memory**: 60 slugs disappearing and 60 appearing produced an
  identical verdict. A prune-only night reported *"byte-level maintenance writes only"* on a pull
  request that had deleted images, and auto-merged.

  It is now classified, and classified at the **read surface**, which is the leverage: a loss from any
  upstream media phase has to pass through this index to reach a consumer, so one gate covers the chain
  without instrumenting each phase. Breaking now means a slug losing all its imagery, a slug losing a
  role entirely, or **a role keeping its name while shedding frames**. That last one is the case that
  actually happens: `pruneStaleCaptures` deletes every `<role>-<n>.webp` above the new count and its
  mass-prune guard explicitly exempts shrinks, so a Variations board going from 8 frames to 1 silently
  deleted 7 images while the role key survived.

  An unreadable prior index is breaking too, rather than fatal: the index rewrites itself from the media
  tree (self-healing) and asks a human to confirm nothing vanished. Throwing would have left the corrupt
  file in place and killed every subsequent sync until someone fixed it by hand, which is exactly the
  failure this change exists to prevent.

  Known remaining blind spots, recorded rather than quietly carried: a category with fewer than 10
  members can still vanish silently (`assertNoCategoryMassLoss` has a floor of 10, and `category` is not
  a breaking reason); anatomy detects a **deleted file** but not a file rewritten with **less** in it;
  and neither media phase has a sanity floor, so a component gutted in Figma can overwrite a good
  capture with a near-blank image. That last one matters most: `default.webp` is the oracle for the
  render-fidelity gate, so **a blank oracle would pass everything**.

- **The nightly Figma sync has been dead since 2026-07-10, and the icon library is why.** The 2026-07
  icon rework **moved the icons onto a different Figma page**: 201 of the 237 registry icon components
  are now main components on `✍️ DS Icons: replacement`. That page was added to the `exclude` list in
  `components/src/category-page-overrides.json` on 2026-07-08, back when it was a staging page. So the
  sync was deleting the entire icon library: the `Icons` category went **237 to 0**.

  The category mass-loss tripwire caught it every single time and refused to publish a gutted
  registry, which is exactly its job. The result was a hard sync failure every night for three days,
  and knowledge ingested nothing from Figma in that window. (The failure was reported: the
  sync-failure issue opened on 2026-07-10 and commented each night. Nobody read it.)

  The page now resolves to the `Icons` category instead of being excluded, and a test pins both halves
  so it cannot be re-excluded while the icons live there. The icon-loss gate above is what makes this
  safe to reconnect: whatever the reconnected sync finds, a lost glyph is now a breaking change with
  every casualty named, rather than an auto-merge.

- **Losing an icon is now a breaking sync.** The `icons` phase had no diff at all: its verdict was
  `iconsWrote ? "additive" : "unchanged"`, with no code path to `breaking`. When the Figma icon
  rework made glyphs stop rendering, the sync classified the loss as **additive**, applied the
  `auto-merge` label, and shipped it. That is how the icon set fell from **142 to 113** across two
  syncs, unreviewed: 19 in [#365] (merged two minutes after opening) and 10 more in [#378]. Both PR
  bodies printed the degraded worklist by name; nobody read them, because additive PRs auto-merge.
  Of those 29 lost glyphs, 28 are ghosts (see below) and one (`book-bookmark`) was a genuine
  `multicolor` rejection.

  The sync now diffs the **derived** icon set (`components/dist/icons/icons.json`), which is what
  consumers actually resolve glyphs from. An icon that resolved before and resolves to nothing now
  is breaking: it blocks auto-merge, takes the `review-required` label, and the PR body names each
  lost glyph with the reason it dropped out (`node-missing`, `render-failed`, `multicolor`,
  `gradient-or-image-fill`). A redrawn glyph stays additive (it still resolves), and a brand-new
  icon that lands degraded does not gate the sync (nothing regressed for consumers).
- **Ghost components are detected, and verified rather than assumed.** The root defect behind the
  icon loss: the registry is built from Figma's **published-library** endpoint
  (`/v1/files/:key/components`), which keeps advertising a component after its canvas node has been
  deleted. The registry therefore carries entries that resolve to nothing, and **the entry count
  does not change** when it happens: it sat at exactly 237 icon components throughout, which is why
  `classifyRegistry` reported "unchanged" every night while 28 glyphs died. A ghost is invisible to
  a registry diff by construction.

  `/v1/images` returns no URL for a node it will not render, and that alone cannot distinguish a
  deleted node from a render failure. So the export now **probes `/v1/files/:key/nodes`** before
  claiming a ghost: a node Figma has no record of is `node-missing` (**the registry is stale**, named
  in the sync PR body and the console), while a node that exists but will not render stays
  `render-failed`. A glyph that renders but is unusable stays `multicolor` / `gradient-or-image-fill`
  (a drawing problem). Persistent ghosts are reported loudly but do **not** gate the sync, since a
  standing Figma defect blocking every nightly run would only train us to ignore the gate; **only a
  newly lost icon is breaking.**

  Of the 28 ghosts, 22 are on the design team's own "REMOVED (28)" note in Figma (intentional
  deletions). Six are not, and look like collateral from the icon rework: `expand`, `maximize`,
  `minimize`, `misuse-outline`, `tools`, `view-table`. `misuse-outline` is the glyph inside Tag
  Status's "Fail" variant, so a shipping DS component currently references an icon that no longer
  exists. That is also why the plugin's vendor PRs have been red since 2026-07-07. Restoring the
  glyphs is a Figma-side fix; this change only makes sure the next loss cannot ship in silence.
- **`getImages()` no longer discards Figma's `err` field.** It returned `{ images: merged }`, so an
  HTTP-200 response carrying an error contributed no URLs and was indistinguishable from a batch of
  deleted nodes. It now returns `{ images, errors }` and the icon export **throws** rather than
  recording an outage as icon loss. Note this is defence in depth, not the cause of the icon loss:
  `request()` already threw on any non-2xx, so a render timeout (HTTP 400) always aborted the run.
  The gap was only the 200-with-`err` shape, and it matters now that a URL-less node is treated as
  evidence about the registry.

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
[#400]: https://github.com/volivarii/actian-ds-knowledge/pull/400
[#401]: https://github.com/volivarii/actian-ds-knowledge/pull/401
[#402]: https://github.com/volivarii/actian-ds-knowledge/pull/402
[#365]: https://github.com/volivarii/actian-ds-knowledge/pull/365
[#378]: https://github.com/volivarii/actian-ds-knowledge/pull/378
[#409]: https://github.com/volivarii/actian-ds-knowledge/pull/409
[#410]: https://github.com/volivarii/actian-ds-knowledge/pull/410
[#412]: https://github.com/volivarii/actian-ds-knowledge/pull/412
[#413]: https://github.com/volivarii/actian-ds-knowledge/pull/413
[#414]: https://github.com/volivarii/actian-ds-knowledge/pull/414
[#403]: https://github.com/volivarii/actian-ds-knowledge/pull/403
[#404]: https://github.com/volivarii/actian-ds-knowledge/pull/404
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

[#418]: https://github.com/volivarii/actian-ds-knowledge/pull/418
