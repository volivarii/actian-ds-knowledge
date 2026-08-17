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

- **`components/dist/identity.json`: the slug is now a label and the stable Figma identity is the
  record, so a rename stops being a migration.** Every registry entry already carried a rename-proof
  Figma `key` and a `nodeId`, and the sync already used them to tell a rename apart from a
  delete-plus-add. Nothing downstream did: the slug, which is a slugified *display name*, is the
  address in 15 of 18 manifest collections, in the manifest keys themselves
  (`components.guidelineDoc.<slug>`), in the media and anatomy filenames, and in the authored
  `components/src/<slug>/` directories. So renaming one Figma component cost about 90 references
  across three repositories, and two display-name changes stalled the nightly sync for four nights
  while it discarded 241 icon updates alongside them (#526).

  The ledger records `identity -> { slug, nodeId, previousSlugs }` for all **637** identities across
  the three registries, and **`clients/resolve-paths.js` reads it**, so a consumer holding a slug a
  component was renamed away from now resolves it instead of breaking on it. That is one change at
  the single place every `{slug}` collection resolves through, rather than a fix per collection. A
  slug that is *current* for some component is never treated as retired, so a freed-and-reused name
  resolves to the live component and not to the renamed one. An absent or unreadable ledger means
  "no renames" rather than an error, so snapshots vendored before this keep resolving.

  Identity precedence is deliberately the same as `identityOf()` in the sync (`key`, then `nodeId`):
  if the two disagreed, a rename the sync paired by key would look like a new entry here and the
  previous slug would be lost. History starts empty by construction, so the ledger cannot resolve a
  rename that landed before it existed; it records from its first run forward. A component that
  leaves the registries drops out rather than being tombstoned, because a retired slug should stop
  resolving rather than resolve to something that no longer ships.

  It carries no authoring surface, so it registers no `domains.json` unit (`INFRA_DERIVES`), and that
  exemption is paid for the same way llms' is: a re-derive-and-diff drift guard in
  `validate-manifest.yml` plus a test that the committed ledger is what a fresh derive produces.

### Changed

- **A rename is breaking only when the slug it renamed away from stops resolving.** The classifier
  pushed a breaking reason for every rename, and any single reason makes the whole sync breaking,
  which commits nothing. Two consequences, both now fixed:

  - A change to a component's **display name that leaves the slug alone** is no longer breaking. The
    differ reports a rename when the slug *or* the name changes, so editing a status emoji in a name
    could stall a night's sync on its own (#512). No consumer addresses a component by display name.
  - A **slug** change the identity ledger has absorbed is additive, because the old slug still
    resolves. Absorption is checked by target and not merely by presence: a ledger naming the wrong
    successor still classifies as breaking, so a stale ledger cannot launder a real break into an
    auto-merge.

  The changelog still reports every rename either way. Absorbed does not mean invisible.

- **`components/render/dist/render-contract.json`: what the renderer actually implements, per slug,
  so consumers stop restating it.** Each entry carries the content props that slug's branch reads,
  the fallback literal each prop has, and, per registry variant axis, which values the renderer
  renders distinctly. Consumers had been keeping their own copies and drifting: the plugin's
  flow-authoring reference opens with *"the following 19 slugs have real HTML leaf renderers"* while
  the renderer has **58**, and documents **45** `(slug, prop)` bindings against the **177** the
  renderer exposes. The visible cost is that 39 built components are invisible to flow generation,
  and a documented one can still be short (`empty-state` is described with 3 props and reads 7, so an
  author is told they may use it and then cannot set its title, its illustration, or either action).
  This is the same failure that cost three repos two weeks in July, so the fix is the relation rather
  than a better list.

  `rendersAs` is **measured, not read**: each variant value is rendered and compared, because textual
  analysis cannot answer this honestly (a generic `"is-" + v.State.toLowerCase()` handles values it
  never names). It self-corrects the moment the renderer learns a difference it did not have, and it
  is how the alert defect fixed below shows up as data. Regenerating against the pre-fix renderer
  records `alert-banner.Type.rendersAs = {"Error": "Info"}`; against the fixed one it is empty.

  Also the prerequisite for a real content layer: `default-props.json` exists to give each render
  example content, has 3 entries and no reader in this repository (a consumer reads it from the
  vendored tree), and nothing knew which props needed values. The
  `props` array is that list. Schema `schemas/render-contract.json`, manifest key
  `components.render.contract`, generated by `npm run derive:render`.

- **The canonical render now declares which authority it serves: design first, production once
  engineering's web components are consumable.** ([#518](https://github.com/volivarii/actian-ds-knowledge/pull/518)) The render inherits production values (a
  token resolves through the OKLCH formula in `color-primitives.md`) while the fidelity gate judges it
  against design values (Figma hand-picked hex), and nothing said which is right where they disagree, so
  every fidelity number was measuring a seam rather than a quality. This extends doctrine that already
  existed for tokens (*"always defer to the Figma file for design decisions and engineering code for
  production output"*) to the render tier. Consequences: the gate's comparison against Figma is
  legitimate today and raising its coverage is worth doing; when the web components exist, the CEM
  contract carries authority and the design-versus-development drift measure replaces fidelity as the
  number that matters; and the shades where computed OKLCH disagrees with Figma hex now need a
  correction or a named exception rather than standing as an accepted divergence.

- **The render fidelity gate now blocks on a coverage regression, because its own subject had been
  eroding for eighteen days and nothing said so.** ([#516](https://github.com/volivarii/actian-ds-knowledge/pull/516)) When #487 landed on
  2026-07-24 the gate reported that the Figma capture could confirm 14.6% of the colors the canonical
  renders paint. Measured again on 2026-08-11 it was **11.8%**, and the held 2026-08-11 tag sync would
  take it to **9.1%**, blinding two more components. `mismatch` was 0 at every one of those points, so
  the gate was correct and silent while the thing it measures lost a third of its reach. The cause is a
  single point: the tag family is where the oracle lives, and each step of the tag redesign retires
  exactly the bordered treatment the capture could compare, so `tag-default` and `tag-stage` fall from
  7 confirmed declarations each to **0**.

  The gate now reads the committed `fidelity-report.json` before it overwrites it and fails when this
  run can confirm fewer declarations than that baseline could, naming the slugs that lost and the ones
  that went blind. **The blocking condition is the absolute count, not the ratio**, deliberately: losing
  a declaration the capture used to confirm is unambiguously worse, whereas a new component the capture
  is blind to also lowers the ratio while losing nothing, and blocking on that would red an ordinary
  additive Figma sync every time a component lands, which is how a gate becomes noise and stops being
  read. The ratio is always printed for direction.

  **A per-slug loss blocks even when the total holds level.** Gating on the total alone let a slug go
  fully blind whenever another gained as many declarations in the same change, which is exactly the
  motivating shape: a redesign retiring the tag borders can easily coincide with a token-name gain
  elsewhere.

  **On a blocking loss the run leaves `fidelity-report.json` untouched.** Writing the new report before
  evaluating the regression made the gate self-erasing: it failed once, and the next run compared the
  new value against itself and passed, so an author who re-ran to confirm, or who simply committed the
  regenerated dist, landed the regression with no reason recorded. That is the laundering path the gate
  exists to close, and the first version of the gate reopened it.

  A loss can be legitimate, since a redesign can retire the very treatment the oracle was reading. It
  may not be silent, and it cannot be waved through from CI, which invokes the gate with no arguments:
  run `npm run derive:render -- --accept-coverage-loss="<why>"` locally and commit the regenerated
  report, and put the same sentence in that change's CHANGELOG entry, because the commit is the only
  place the reason is recorded. A bare flag with no reason accepts nothing and now says so instead of
  reprinting the same wall of text. A corrupt baseline blocks rather than silently skipping the
  comparison, and `render-derive.yml` now watches `components/dist/anatomy/**`, the gate's own oracle
  input and the path a coverage loss actually arrives by.

### Changed

- **BREAKING SYNC 2026-08-12: the tag family folded from eight components into three, and carrying it
  through raised oracle coverage from 11.8% to 17.8% instead of costing the eight declarations it
  looked like it would.** ([#522](https://github.com/volivarii/actian-ds-knowledge/pull/522)) The registry goes 323 → 322 components.
  Five components are **removed**: `tag-catalog`, `tag-shared`, `tag-stage`, `tag-status`,
  `tag-glossary-item-type`, and they are not deleted so much as **re-axised**: `tag-default` now
  carries a single `Type` axis with 14 values (`Default`, `Catalog`, `Shared`, `Stage-1`..`Stage-8`,
  `Status-error`, `Status-warning`, `Status-success`), and four of the five retired components'
  treatments live there. The fifth, `tag-glossary-item-type`, went instead to `tag-item-type` as its
  `Glossary-1`..`Glossary-5` values. `tag-catalog-item-type` is **renamed** `tag-item-type`, `radio-button-card` is **renamed**
  `radio-card`, and `arrow-up`, `datasets` and the two Actian Data Intelligence horizontal logos are
  added.

  **The renderer renders the Type axis from the anatomy capture, not from a hue table.** Each Type's
  background and border come from `anatomy/tag-default.json`'s `root.appearance.variants[]`, and the
  leading icon's slug swaps per Type from the same capture (`folder` for Catalog, `error-filled` /
  `success-filled` / `warning-filled` for the Status values). That is why the result is verifiable
  rather than merely plausible, and it is what moved the numbers: **checkable declarations 49 → 78,
  oracle coverage 11.8% → 17.8%, examined 415 → 438, `mismatch` still 0.** This reverses the erosion
  #516 documented (14.6% on 2026-07-24 → 11.8% on 2026-08-11), and the gain is understated, because
  the old 49 double-counted the seven shared `.ds-tag--<hue>` declarations against both `tag-default`
  and `tag-stage`, whereas the tag family's 51 of the new 78 (`tag-default` 24 + `tag-item-type` 27)
  are each charged to a single owner. One declaration moved the other way: `.ds-tag-stage__dot`
  survives for `search-result-card` but no slug now claims the `ds-tag-stage` prefix, so it left the
  measured population entirely (worth 0.04pp, and no slug was invented to reclaim it).

  Two facts were taken from the capture rather than smoothed over. **`Stage-1` renders exactly as
  `Default`**, because the capture holds no override group for it; no hue was invented for it.
  And **`Type=Shared` renders no leading icon**, because `quality.structuralVariants` flags it
  `childCount:2!=1`, so the component has no icon child, which the retired `tag-shared` renderer also
  reflected by rendering label-only. That second one is worth naming: the fidelity gate compares
  colors, so a wrongly-added icon keeps `mismatch` at 0 forever and no measurement could ever have
  caught it.

  **Accepted per-slug coverage loss**, in the gate's own words: the tag fold-in retires `tag-stage`
  and `tag-glossary-item-type` and renames `tag-catalog-item-type` to `tag-item-type`; their verified
  declarations move into `tag-default`'s new Type axis and into `tag-item-type`, taking the repo-wide
  checkable count from 49 to 78. The three slugs each drop 7 → 0, 1 → 0 and 7 → 0 under their old
  names, which is what the per-slug floor fires on, and it fires correctly: a rename moves coverage,
  it does not lose it, but only a human can say which of the two happened.

  **What consumers must do.** The plugin needs #273's repoint repeated for `radio-button-card` →
  `radio-card`. Anything resolving the five removed slugs by name will stop finding them, which is
  the point: this repo was publishing them as ghosts with fossil anatomy until this sync, per #517.

  **Two gaps named rather than papered over.** `radio-card`, `tag-item-type` and the two new Data
  Intelligence logos have **no media capture**, because the media phases cannot run outside CI (they
  fetch the full file subtree and the response terminates on a normal uplink); the predecessors' July
  captures were deleted rather than renamed forward, since a stale image that looks current is worse
  than a missing one. The next successful CI sync captures all four. Separately,
  `derive-canonical.js` writes a fragment per rendered slug but **never prunes one whose slug has
  disappeared**, unlike `derive-guidelines.js`, which pruned six stale files unprompted in this same
  migration; twelve orphaned fragments and usage-notes were removed by hand here, and the missing
  prune remains.

### Changed

- **The category taxonomy now matches the DS Kit's own, and the four page-name categories are gone.**
  ([#535](https://github.com/volivarii/actian-ds-knowledge/pull/535)) A hand-carried `--phase registries` sync landing #534's fixes.
  Categories go from **15 to 11**: `Form (input & selection)` becomes `Form`, and
  `Base: label, message, field, textfield buttons`, `Checkbox, checkbox card, checkbox group`,
  `Radio, radio card, radio group` and `Text area, text input` disappear, because they were never
  categories at all, only Figma page names preserved by a fallback. Category drift falls from **21
  components to 2**, and the two that remain (`identification-key`, `sticky-footer`) genuinely have no
  category in Figma.

  `field`, `label`, `message`, `textfield-buttons`, `checkbox-group`, `radio-group` and `text-area`
  return to `section: Components`, having been marked `Foundations` by the same fallback. That is what
  filed them under FOUNDATIONS in the docs sidebar. **Brand Assets groups** are now `Logos`,
  `Product logos`, `Graphics` and `Illustrations`: `Group 42` and `Group 43`, which held 90 partner
  logos between them, are gone.

  **Carried by hand for a reason worth recording.** A breaking sync commits nothing: its
  `Open pull request` step is gated on `category == 'additive'`, so every regenerated dist dies with
  the runner (#519, verified). The four lost media on #526 still make a full sync breaking, so
  dispatching one would have produced no dist and landed nothing. Running the `registries` phase alone
  returns `verdict=additive`, which is the scope this fix needs and it excludes the media phases that
  cannot run outside CI anyway.

- **The graph joined category docs to category nodes by FILENAME, so renaming a category dangled nine
  edges.** ([#535](https://github.com/volivarii/actian-ds-knowledge/pull/535)) A category node is built
  by slugifying the registry's category value, while its transversal-ref edges were sourced from the
  `<slug>-defaults.json` filename. Those two agreed only while the filename happened to match the
  category name, so the rename left `a11y_ref`, `foundations_ref` and `motion_ref` edges pointing at a
  `category:form-input-selection` node that no longer existed, and `validate-graph` correctly refused
  the result. The edges now join on the doc's own `label`, which is the same value the node is built
  from, so both sides agree by construction and the **filename stays put**: it is a manifest logical
  name, and therefore a consumer contract that should not move because a display name changed. A new
  test asserts the invariant directly (no edge may point at a category node that does not exist),
  because `npm test` passed against the broken graph while only CI caught it.

- **The curated category stopgap retired itself, exactly on its stated condition.**
  ([#535](https://github.com/volivarii/actian-ds-knowledge/pull/535)) `components/src/category-overrides.json` said it should be deleted
  once Figma created member pages under the Form header and a re-sync restored the categories. That
  has now happened, and all seven slugs are attributed natively. Two things this exposed: the entries
  had been inert for some time, since the registry always wins, and **`input` had gone stale in a way
  nothing would have caught**, pinning to a form category a slug the registry publishes as an **icon**.
  The file stays with an empty override map, which is the honest expression of "nothing needs curating
  today", and its test now asserts the outcome (a real `in_category` edge) rather than the mechanism.

### Fixed

- **A thirteenth optional slot was still carrying a literal fallback, and the test that was supposed
  to catch it could only check slots somebody had remembered to list.**
  ([#PR](_PR link added at open_)) `chat-with-ai-steward`
  initialised its context-chip label to *"Dataset Customer Orders"* instead of guarding the element
  on the prop, so the chip rendered whether or not the caller scoped the session to anything. It
  survived the #544 sweep because it wears a different shape: a variable initialised to the literal
  rather than the `props.X ? el : ""` conditional the other twelve used. The consumer had already
  recorded it: the plugin's `stewardAnswered` golden supplies `Title`, `Insight`, `Source` and
  `Confidence` and deliberately no `Context`, and its rendered text gained *"Dataset Customer
  Orders"* between v0.34.132 and v0.34.134. The initialiser goes back to `""` and the string moves
  to `SPECIMEN_PROPS` with its provenance, so the gallery keeps the chip and a caller can render a
  steward panel without one. Both accepted `Context` forms are unchanged: the object `{type, name}`
  and the bare string.

- **The sparse render ratchet: a component must not invent content the caller did not ask for.**
  ([#PR](_PR link added at open_)) (`tests/render/sparse-render-ratchet.test.js`) The omission test
  added with #544 iterates `SPECIMEN_PROPS`, so a slot missing from that map is a slot nothing
  checks, which is exactly how the thirteenth shipped. This gate keeps no list of slots: its
  subjects come from the render contract and its answers are read off the rendered markup rather
  than the source, so within the scope stated below, the fallback can be written any way at all. It
  measures two things:

  1. **every slug rendered with no props whatsoever**, counting the elements that carry visible
     text. Blocks when that count rises, per slug and across the components present at both points.
     What it catches, precisely, is a fallback that adds a **new** text-bearing element. What it
     does not catch, stated plainly because a gate believed to cover more than it does is worse
     than no gate: text injected into an element that **already** carries text (an element is
     counted once), a fallback carried by an **attribute** such as `placeholder=`, and text inside
     `<svg><title>`.
  2. **every `(slug, prop)` pair rendered twice**, empty and with a sentinel in that prop, asking
     whether supplying the prop **removed** anything. A prop may add to the markup; the moment it
     takes something away, the renderer was carrying content of its own for it. Because it compares
     raw HTML, this closes measure 1's three blind spots and only those. It is a set that must not
     **grow**, not one that must be empty: 99 pairs have a designed fallback today.

  **What neither measure reaches**, stated because the first version of this entry claimed more than
  it should. Both render one cell per slug, with no variant and no props, and the pair check
  examines only contract-listed props whose value actually reaches the markup: today that is 132 of
  the 177 pairs the contract lists, across 58 of the 200 cells in the variant matrix. So three real
  invented-content defects still land unmoved: a fallback reachable only under another variant or
  State (a literal in the steward's `Welcome` branch, or in `collapse-accordion` when expanded), a
  prop the contract's regex cannot see (`props["Sc" + "ope"]`), and a listed prop whose value never
  reaches the markup. Two of those three gaps are published as ratios in the artifact's `totals`,
  measured on every run rather than described in a comment that ages: `pairsProbed` against
  `pairsInContract` for the props that never echo, and `cellsRendered` against `matrixCells` for the
  unrendered variants. The third has no number at all, and cannot have one: a prop the contract
  cannot see is absent from both sides of a count derived from the contract, so `props["Sc" + "ope"]`
  is named here and nowhere counted. Closing the first two is a coverage extension and is tracked as
  follow-up, not claimed here.

  Verified by mutation, twice. A literal fallback reintroduced for `chat-with-ai-steward.Source` in
  its own element reds measure 1 with `chat-with-ai-steward: 8 -> 10` while the list-based omission
  test stays green. The same fallback injected into the existing `New chat` button (the reviewer's
  exploit) moves measure 1 by **zero** and reds measure 2 with
  `["chat-with-ai-steward.Source"]`, `GREW: 99 -> 100`.

  The measurement is published as `components/render/dist/sparse-render.json` (schema
  `schemas/sparse-render.json`, manifest key `components.render.sparse`, generated by
  `npm run derive:render`), and the baseline is that file **as it stood at the merge base**, the
  same resolution `variant-collapse-ratchet` uses, because CI regenerates the dist before the suite
  runs and a working-tree comparison would be new against new. That resolution now lives in
  `tests/render/helpers/merge-base.js` instead of in two copies, and the single fallback to the
  committed copy is gated on this branch genuinely **adding** the file: `render-derive.yml` checks
  out the PR head repo, so on a fork PR `origin` is the fork, and an ungated fallback would let a
  contributor with a stale fork compare a fresh derive against its own output on a green run.
  Rises can be legitimate, so both measures have an escape hatch (`ACCEPTED_RISE`,
  `ACCEPTED_INVENTED`). Each waiver requires a non-empty reason, and a count waiver also names the
  exact `from`/`to` it covers, so it cannot go on waiving later, different rises on the same slug.
  Failure messages name the subject with both counts and state the direction in its own terms, and
  never advise regenerating anything. Current state, for orientation rather than as a target: 44 of
  58 slugs render some text with nothing supplied, 176 text-bearing elements, 99 invented slots.

  The omission test also gained the half it was missing: every prop in `SPECIMEN_PROPS` must be a
  prop the render contract says that slug actually reads, so a typo or a retired prop fails instead
  of silently testing nothing.

- **#543 filled twelve empty gallery slots by giving the renderer a literal fallback for each, and
  in doing so removed the ability to render those components without their optional parts.** The
  fill turned `props.Description ? '<p class="ds-page-header__desc">' + ... : ""` into a paragraph
  that always renders, so every generated page-header grew a *"Support text"*, every toggle and
  radio a *"Description"*, every date input a *"Use MM/DD/YYYY."*, with no way to turn them off.
  The gallery looked right and the capability was gone. The plugin's suite said so within a day:
  1997 passing at v0.34.132, 13 failures at v0.34.133, three of them behavioural rather than stale
  snapshots, and all three of the same shape as
  `render({ dsSlug: "page-header", props: { Title: "Only title" } })` asserting no
  `ds-page-header__desc` in the output.

  **Specimen content belongs to the variant matrix, not to the renderer's runtime fallbacks.** The
  renderer says what a component DOES with the props it is given, and an optional part being absent
  when its prop is absent is part of that answer. The matrix says what the GALLERY should SHOW, and
  an empty slot there is a poor specimen. Those are two questions, and answering the second inside
  the renderer answered the first wrongly. The twelve strings move to a new `SPECIMEN_PROPS` map in
  `components/render/renderer/matrix.js`, each with the provenance comment it carried in the
  renderer, and merge into every cell `variantMatrix()` derives for that slug. Merge, not replace:
  `MATRIX_OVERRIDES` would have been the wrong home because an override substitutes a slug's whole
  cell list, which silently changes variant coverage, and a per-cell prop still wins over the
  specimen value. The other thirteen fills from that PR are untouched: they render their element
  either way, so a literal took no capability away.

  **Consumer-visible contract change.** `components/render/dist/render-contract.json` loses the
  `default` entry for eleven props, because the renderer genuinely no longer states one for them:
  `account-dropdown.Email`, `dropdown-select-default.Description`, `dropdown-select-default.Helper`,
  `input-date.Helper`, `modal.Body`, `notification.Action`, `page-header.Description`,
  `popover.Body`, `radio.Helper text`, `stepper.Body`, `toggle.Helper text`. A twelfth changes
  rather than disappears: `popover.Title` now publishes `"Popover"`, the literal the renderer still
  falls back to for the dialog's `aria-label`, in place of `"Interaction guide"`. That is not a loss
  of information but a correction of it: a `default` on an optional prop claimed a value the caller
  would not get. The gallery's content is unchanged, and the popover fragment improves in passing,
  since its `aria-label` now reads the same *"Interaction guide"* the title element shows instead of
  a generic *"Popover"*. Repo-wide empty text slots stay at 1 (`alert-banner.Title`, exempted), and
  oracle coverage is unchanged at 17.8%.

  **The gate that would have caught it** is `tests/render/optional-slot-omission.test.js`: for every
  slot in `SPECIMEN_PROPS`, rendering the slug without that prop must produce no element for it. The
  slot list is read from `SPECIMEN_PROPS` and the element's class is derived by probing the prop with
  a sentinel, so neither is written out a second time, and a slot whose class cannot be derived is
  reported rather than skipped.

- **#541 swept two of three copies of the category slug, and 16 components silently lost their
  published category guidance.** A guideline doc carries its own `meta.category`, hand-authored in
  `components/src/<slug>/_meta.yml`, and `derive-usage-notes.js` resolves
  `components/dist/categories/<that>.md` to append the category's inherited design and behavior
  guidance. That is a **third** independent copy of the same slug, after the registry's
  `categorySlug` and the defaults file's own `slug`. The Form components kept
  `form-input-selection`, so their usage notes lost the entire *"Category guidance (inherited: design,
  behavior)"* section: real published paragraphs, gone from 16 files and shipped in v0.34.131 to both
  consumers, with every gate green because the gate added in #541 checks only the registry join.

  The 15 sources are swept and the notes regenerate **byte-identical to v0.34.129**, the last version
  before the loss. The gate is extended to the join it missed: every guideline's `meta.category` must
  resolve to a category source, asserting a non-zero examined count for the same reason its sibling
  does. Found by review of the consumer PRs carrying the tag, not by anything in this repo.

- **19 components resolved to no category defaults at all, and every gate stayed green.** The
  registry derives `categorySlug` by slugifying the Figma category's display name, while the
  category's defaults file declares its own authored `slug`. Those two agreed only for as long as the
  display name happened to slugify to the authored slug, and nothing asserted the agreement, so it
  was a coincidence rather than a contract. Renaming the Figma page `Form (input & selection)` to
  `Form` ([#534](https://github.com/volivarii/actian-ds-knowledge/pull/534)) broke it: the registry
  began publishing `form` for all 19 Form components while the only defaults file still declared
  `form-input-selection`, so any consumer resolving defaults by `categorySlug` found nothing for the
  whole category. The source category is renamed to `form.md` with `slug: form`, which moves the
  manifest key `components.categoryDefaults.form-input-selection` to `components.categoryDefaults.form`
  (no consumer referenced it by name; they resolve through `byKey(slug)`, which is exactly the call
  that was returning nothing).

  The reason it was invisible is the more useful half. The only test on this relationship asserted
  the slugify **function** against a fixture, never that its output resolves to a file, and the
  fixture still named the retired category, so it passed while describing a category that no longer
  exists. There is now a gate asserting that every `categorySlug` the registry publishes resolves to
  a defaults file, reported per category with its component count. Two hand-written lists that would
  have needed editing for any future rename are derived instead: the bundle roll-up test now reads
  the authored slugs from their own frontmatter, and the fixture names a live category.

  Found by wiring a consumer rather than by inspection: the plugin's nightly vendor PR had been red
  since the taxonomy change landed, failing inside a PR nobody reads.

- **The error alert rendered as an info alert, and screen readers announced it politely.** Figma
  publishes `alert-banner.Type` as `Info | Success | Warning | Error`, while the renderer's severity
  lookup was keyed `primary | success | warning | danger`. `Error` missed the lookup and hit the clamp
  that exists to stop a crafted variant value escaping the class attribute, so it fell back to
  `primary`: the info background, the info glyph, and `role="status"` where an error needs
  `role="alert"`. The renderer now maps the published vocabulary onto the styled one
  (`info → primary`, `error → danger`) while the clamp keeps its original scope, so unknown values
  still fall back and nothing new reaches the class attribute. Both spellings keep resolving because
  `v.Type` is flow data as well as registry data, so a flow authored against the older spelling would
  otherwise degrade the same silent way. No gate could see any of this: a clamp is indistinguishable
  from a deliberate default, which is precisely what the render contract added below now states as
  data.

- **A renamed Figma category could never take effect, because the guard that protects categories
  during a reorg treats "not in the previous dist" as malformed.** ([#534](https://github.com/volivarii/actian-ds-knowledge/pull/534))
  Figma renamed its `Form (input & selection)` header page to `Form`. `preserveKnownCategories` builds
  its `established` set from the **previous** dist, so a newly reported name is by definition not
  well-formed and gets reverted, every night, forever. That is a ratchet: a deliberate rename can
  never establish itself. The visible cost was in the docs sidebar, where nine Form member pages lost
  their attribution and 21 components fell back to a last-known value carrying a Figma **page name**
  as the category and a stale `section: Foundations`, so `Field`, `Label`, `Message` and
  `Textfield buttons` rendered under FOUNDATIONS beneath a heading reading
  `BASE-LABEL-MESSAGE-FIELD-TEXTFIELD-BUTTONS`.

  A category is now well-formed if it is in the previous dist **or** declared in `KNOWN_CATEGORIES`,
  which is the repo's statement of the taxonomy. A page name is in neither, so it is still reverted:
  that case is covered by its own test. `KNOWN_CATEGORIES` now reads `Form`, mirroring the DS Kit's
  own header, and the category doc's label follows. ~~**The slug stays `form-input-selection`**: it is
  a manifest logical name and therefore a consumer contract, so renaming it is a parallel-change
  migration and deliberately not bundled here.~~ **Superseded the same week**: that decision rested on
  the slug being a load-bearing consumer contract, and it is not. No production code in any consumer
  names the key; plugin and docs both resolve through `byKey(slug)`, and the slug they pass is the
  registry's `categorySlug`, which this very rename had just moved to `form`. So the decision to hold
  the slug still is what left 19 components resolving to nothing in both consumers. Reversed with the
  measurement attached, below.



  **Verified against the category mass-loss tripwire**, which was the real risk of a rename: it keys
  on components ABSENT by stable identity, not on a category emptying, so an 11-component rebucket
  passes while a genuine loss still throws. Confirmed with a positive control rather than by reading
  the comment.

- **Figma's auto-generated frame names were shipping as public documentation navigation.**
  ([#534](https://github.com/volivarii/actian-ds-knowledge/pull/534)) `deriveGroup` took `containing_frame.name` verbatim for non
  Components sections, so `Group 42` and `Group 43` became Brand Assets nav sections holding **90
  partner logos** between them. They carry no meaning, and the proof is that they overlap
  alphabetically (`adlsgen1..snowflake` and `db2-database-1..xml`), which is canvas layout rather than
  taxonomy. A frame whose name matches Figma's auto-naming pattern now falls back to the page, the
  real bucket. A real frame name such as `Logos` or `Illustrations` is untouched.

- **Five components were publishing another component's guidelines imagery, because a page that
  documents a family carries one `Design guidelines` wrapper per component and the sync always took
  the first.** ([#533](https://github.com/volivarii/actian-ds-knowledge/pull/533))
  `findFrameByNameRecursive` returns the first match of a depth-first walk, and role sources were
  keyed by page id, so on a family page one component got
  its own boards by luck of ordering and the rest got someone else's. Live and shipping, unlike the
  losses tracked in #526: `message`, `field` and `textfield-buttons` each showed **Label**'s four
  boards, `checkbox-card` showed **Checkbox**'s preview, and `tag-interactive` showed the
  **Read-Only / Item Type** boards across five images. 18 images in total. Verified rather than
  inferred: every wrapper-derived role of `tag-interactive` was byte-identical to `tag-default`'s,
  and the real Interactive board had never been captured.

  **The mapping is derived, not configured.** Each wrapper's `.local - section header` instance names
  what it documents, so a component is matched to the wrapper whose title carries its name. Matching
  compares **significant words as a set**, because neither ordering is trustworthy: the Text page's
  first wrapper documents Text *input*, and the registry says `Tag, Interactive` where Figma says
  "Interactive Tag". A wrapper may legitimately serve several members, so a title containing all of a
  component's words also matches, which is how `tag-item-type` resolves to "Read-Only and Item Type
  Tag" and gains five images it never had. No hand-maintained slug-to-wrapper list is introduced:
  such a list would drift silently, which is the failure mode the standing rule about hand-maintained
  gates exists to prevent.

  **The load-bearing half is that it never falls back to the first wrapper.** When a component on a
  family page cannot be matched unambiguously, nothing is captured for it and the sync summary names
  it on its own line with the titles it saw. A missing image is honest; a confident wrong one is not,
  and because the artefact is an image no downstream gate can ever contradict it. That rule was
  mutation-proved: restoring the fallback reds both guard tests.

  **Measured against the live file**, the resolver assigns 13 of the 20 components across the six
  family pages, and Checkbox, Radio and Text resolve completely.

  **Honest limits, all of them Figma-side.** `message` does not resolve because its header reads
  "Massage (form base)", a typo. `tag-default` does not resolve because the guidelines call that
  component Read-Only while the registry publishes `Tag, Default` (the #517 and #521 naming drift).
  The five grids do not resolve because their two wrapper titles name no component; they had no
  wrapper-derived media to begin with, so nothing is lost there. An unmatched component keeps
  whatever files it already has rather than having them pruned, since it is absent from the prune
  count map, so `message` goes on shipping Label's images until the typo is corrected. A page with
  **no** wrapper at all is unchanged, still treated as a page-wide outer-wrapper rename that keeps
  its mass-prune refusal.

- **An icon that Figma still draws was reported as lost, because ticking "Clip content" on its frame
  was enough to fail a guard that is supposed to be about paints.**
  ([#530](https://github.com/volivarii/actian-ds-knowledge/pull/530)) The 2026-08-13 sync classified `lifecycle-policy` under **Lost
  icons: BREAKING**, whose text tells consumers they now render an empty box. Nobody had touched the
  artwork. Ticking "Clip content" on the icon's Figma frame makes the export wrap the glyph in
  `<g clip-path="url(#id)">` plus a `<defs>` clipPath whose rect is 24x24 at `scale(2)`, exactly the
  48x48 viewBox, so it crops nothing at all. `normalize-svg.js` degraded on `/url\(#/i`, and that
  guard's own comment says it exists because *"gradients / pattern / image / url(#...) **paints**
  can't become currentColor"*. A `clip-path` reference is not a paint, so the regex was broader than
  the rule it enforces.

  **The fix is narrow on purpose.** SVGO normalizes any clip shape to an axis-aligned rect path, so
  "covers the whole viewBox" is decidable rather than guessed: only a clip matching
  `d="M0 0h<W>v<H>H0z"` with W and H equal to the viewBox is dropped, and a follow-up SVGO pass
  collects the orphaned def. A clip that genuinely crops keeps its reference and still degrades,
  because shipping it unclipped would ship a glyph Figma does not draw. Both behaviours are tested
  against the verbatim Figma export, and the crop test was confirmed to fail against a blanket-strip
  mutation rather than being taken on trust.

  **Evidence the artwork never moved:** normalizing the live export now produces a body byte-identical
  to the one already in `components/dist/icons/icons.json` from the 2026-07-23 sync.

  **Two things this does not do.** No dist changes here (the icons dist is written by the nightly
  sync), so the correction reaches consumers with the next sync, which is also when #526 stops
  reporting an icon loss. And `data-product-input-port` stays degraded, but its reason moves from
  `gradient-or-image-fill` to the accurate `multicolor`: it is genuinely two-tone, and the clip was
  only masking why. The `cursor-arrow` and `cursor-hand` pair keep degrading correctly on real
  drop-shadow filters.

- **Every released tag carried an `llms.txt` index describing content other than its own, because the
  index regenerated after the tag had already been cut and never bumped the version.**
  ([#PR](_PR link added at open_)) `llms.txt` and `llms-full.txt` both ship to consumers
  (`vendor-include.json`) and consumers resolve by tag, but `llms-txt.yml` ran on push to `main`: the
  content PR merged, `tag-on-merge` cut the release tag there with the index still stale, and the
  follow-up regen PR then merged carrying no bump, so no tag was cut for it either. Verified at
  `v0.34.124`, whose `llms-full.txt` still named the retired `radio-button-card` heading three days
  after the fold-in that replaced it. The failure hid behind the repo's own release cadence: with
  several patch bumps a week a regenerated index usually caught a ride on the next unrelated bump,
  which made the state eventually consistent and never consistent at any given tag. This matters more
  than a cosmetic drift because `llms.txt` is the first thing an AI consumer reads to find anything
  else, so a retired heading left inside it is the ghost-reference problem of #517 reintroduced by
  release mechanics rather than by Figma.

  **The fix is an assertion first and a workflow move second.** The required
  `Validate manifest schema + coverage` check now re-derives the index and fails on any drift, naming
  the drifted file and the command that refreshes it, which is what makes staleness un-mergeable
  regardless of which workflow regenerates; `tests/llms-txt-freshness.test.js` covers the
  cascade-independent half in the suite. `llms-txt.yml` then becomes an ordinary PR-event derive like
  every sibling, auto-bumping and auto-committing with the bot App token so the fresh index lands in
  the same merge commit `tag-on-merge` tags. No tag is emitted from the derive: `tag-on-merge.yml`
  remains the single source, because a tag cut on a PR branch is orphaned when the PR squash-merges.

  Two consequences worth naming. The freshness guard lives in the required check rather than in
  `npm test` on purpose: the sibling derives run the suite *before* their auto-commit step, so an
  assertion there would fail mid-cascade on an index that is legitimately stale for another few
  seconds and block those workflows from committing the dist they exist to produce, which would cost
  the "authors need no local toolchain" guarantee. And the derive's trigger list now mirrors the
  generator's real inputs: `components/dist/**` and `paths-manifest.json` are gone, the latter because
  it was being parsed into a variable nothing read, which made the derive look manifest-dependent when
  it never was.

- **The renderer stamped a `ds-tag--with-icon` modifier that no stylesheet has ever carried a rule for,
  so it painted nothing and broke a consumer's exact match on the way past.**
  ([#PR](_PR link added at open_)) The class landed on 13 of `tag-default`'s 14 `Type` cells and on
  `card-for-items`' category pill, and a search for it across every stylesheet the renderer emits or
  vendors returns nothing at all: `ds-base.css` has rules for `.ds-tag`, `.ds-tag__icon` and each
  `.ds-tag--<type>` hue, and none for this one. It only restated what the `.ds-tag__icon` span beside it
  already says. `ds-html-map.js` states the doctrine against exactly this shape elsewhere in the same
  file, where `search-result-card`'s `App=Studio` renders the base card with no root modifier because
  *"there is no built CSS delta for it, and a modifier class must not be emitted without one (no no-op
  namespace-hook markers)"*, and the same 2026-08-12 fold-in dropped `.ds-tag--gray` on that reasoning.
  It is distinct from the deliberately ruleless `.ds-tag--default` and `.ds-tag--stage-1`, which name
  real published `Type` values and so each carry a capture fact; this one named no axis value at all.

  What turned a style nit into a real defect is that the class was not free. A consumer's exact-match
  test is what surfaced it: the plugin's renderer test asserts the adjacency `indexOf("ds-tag
  ds-tag--with-icon") !== -1`, and the fold-in began appending the `Type` modifier first, so the output
  became `ds-tag ds-tag--default ds-tag--with-icon` and the match failed on a class that had never
  painted anything. The icon span itself is untouched, since it is the capture fact and the modifier was
  only ever a marker for it. The fidelity gate cannot see this change and should not: verified 75,
  examined 438, oracle coverage 17.8% before and after, because removing a class removes no color
  declaration. The test that pinned the old class was rewritten rather than deleted, because its subject
  (the capture's `quality.structuralVariants` is what suppresses the icon, which is why `Shared` renders
  no glyph) is load-bearing. Asserting the absence of a class that can no longer exist would have left a
  guard that passes even if suppression broke completely, so it now checks the absent wrapper **and** the
  absent glyph, plus that the pill keeps its own `Type` modifier and its label.

- **The coverage gate shipped in #516 was disabled by the first change it ever faced, and it was the
  change it exists to measure.** ([#522](https://github.com/volivarii/actian-ds-knowledge/pull/522)) `fidelity-check.js` hand-listed the
  slugs whose anatomy it reads and called `readAppearance` per entry with no `try`/`catch`, so when the
  2026-08-12 sync deleted five tag components' anatomy the gate died with an uncaught `ENOENT` and
  `npm run derive:render` produced no number at all. That same list had also been copied into four test
  fixtures, so the one set of facts had to be kept true in five places at once. The fact sources are now derived, and a missing capture is
  **reported** rather than thrown, reported specifically, because a rule silently dropped out of the
  check reads identically to a rule that passed.

- **A CSS rule was attributed to its owner by NAME, so a rule whose owner had been retired passed on a
  different component's evidence.** ([#522](https://github.com/volivarii/actian-ds-knowledge/pull/522)) `.ds-tag--catalog` resolved by
  splitting its modifier to the key `tag-catalog`; once that slug left the renderer entirely the lookup
  fell through to `tag-default`, whose capture happens to contain the same `#d0efed`, and the rule
  passed with zero violations. The per-slug floor could not catch it either, because a vanished slug is
  charged `after = 0` and those slugs were already at 0. Rules are now attributed to the slug that
  **produces** them: every slug's variant matrix is rendered and its classes read back, so a rule with
  no producer is an orphan violation and a rule with several is checked against each producer's own
  capture. A strictly-additive role pass was added alongside it, because attribution alone did not
  close the hole: a value the capture holds but in a different role (a border color painted as a
  background) now reports instead of matching by set membership.

- **The coverage gate reported the wrong direction when a slug lost coverage but the repo gained it.**
  ([#522](https://github.com/volivarii/actian-ds-knowledge/pull/522)) Its headline read `ORACLE COVERAGE REGRESSED: 49 -> 78 (11.8% ->
  17.8%)`, a loss framing on a 60% gain. The message now states the two facts independently: which
  slugs lost, which still blocks whichever way the total moved, and separately whether the repo-wide
  total rose, fell or held level. A gate that misstates direction teaches its readers to discount it,
  and the next time it says "regressed" about something real, nobody believes it.

- **The tracker fix from #510 could create its issue but not update it, so the first breaking night
  after it went red and raised a false alarm.** ([#PR](_PR link added at open_)) #510 made the marker
  dedupe work, which routed the second night down the `gh issue edit` path for the first time. That
  path failed with `GraphQL: Resource not accessible by integration (updateIssue)`: the step ran on the
  **App token**, and the `actian-ds-bot` App can create an issue but not modify one.
  This is also the complete explanation for #494, which had been open as a mystery. The same missing
  permission silently dropped the label on `gh issue create --label`, which left the old dedupe key
  unset, which is why five duplicate trackers accumulated. One permission gap, both symptoms. Verified
  by hand: a normal token applied `sync-breaking` to #511 on the first attempt.
  The step now uses `secrets.GITHUB_TOKEN`, like every sibling issue step in this workflow, all of
  which have always worked. The App token stays where its purpose actually applies: opening the
  additive pull request so downstream `pull_request` workflows fire against its head SHA.
  The postcondition assertion added in #510 is deliberately unchanged. It failed the job within a day
  of shipping, on a real permission defect that had been masked for weeks by the duplication it was
  written to catch, which is the behaviour that was wanted.
- **A failure in the workflow's own bookkeeping announced itself as "Figma sync is failing".** On
  2026-08-11 the sync completed and reported no errors, the tracker step then failed, and the notify
  step opened `🔴 Figma sync is failing` about a sync that had just succeeded. It now distinguishes the
  two: when the orchestrator produced a verdict and reported no errors, the issue says the sync itself
  was fine and points at the workflow step that broke, instead of sending a reader to look for a Figma
  or content problem that does not exist. A tracker that cries wolf about the wrong thing is how a real
  signal stops being read, which is the failure this whole area exists to leave behind. An early
  failure with no verdict at all (checkout, dependency install) still reports as a sync failure, which
  is what it is; all four branches are exercised against a stubbed `gh`.
- **An expired Figma token read as a content failure for 11 nights, and the breaking-sync tracker
  duplicated itself for 5.** ([#PR](_PR link added at open_)) Two independent reporting defects, both
  of the same shape: a step that says what it did rather than what it achieved.
  - The Figma PAT expired on 2026-07-30. Every phase then failed at its first request with 401
    `Token has expired` / 403 `Token expired`, which `aggregateVerdict` reported as a bare `error` —
    the same word a dangling curated override earns. The tracking issue duly advised checking for a
    renamed icon slug, so the actual remedy (rotate the credential) was reachable only by reading the
    run log, and the sync stayed red for 11 nights. The sync now classifies its own failure:
    `failureKind()` returns `auth` when **every** error is a credential rejection, `content`
    otherwise. A mixed run stays `content` on purpose, because an auth-only diagnosis would send a
    reader to rotate a token and stop while a real defect went unobserved. The kind is written to
    `/tmp/sync-failure-kind.txt` (same handoff shape as the existing drift count), and the notify step
    titles and explains the issue from it, including the part that matters most after a credential
    outage: the quiet days were **unobserved**, not unchanged.
  - The breaking-sync tracker deduped on its `sync-breaking` label, and from 2026-07-25 the label
    silently stopped applying: `gh issue create --label sync-breaking` returned success while creating
    an unlabelled issue, so the next night's lookup found nothing and opened another. Five duplicates
    (#504-#508) accumulated while the step printed "Opened rolling breaking-sync issue." every time.
    Dedupe now keys on a marker the workflow writes into the body itself, which cannot half-apply, and
    the step **asserts its own postcondition**: exactly one open tracker must exist when it finishes,
    or it fails loudly and names the duplicates. The label stays, as a convenience for filtering
    rather than as the mechanism. The lookup scan is bounded (500 open issues) and now says so when
    it reaches the bound, because an unreported cap is how this would fail again: the tracker sits
    past the horizon, the lookup finds nothing, and a duplicate opens while every message still reads
    like success. Both the marker lookup and the assertion were exercised against a stubbed `gh`
    across four states (tracker present, absent, already duplicated, and 500 open issues).

  Note for whoever rotates the token: the five breaking syncs of 2026-07-25 to 2026-07-29 were
  detected but never carried through, and nothing has been observed since. Those legacy trackers
  carry no body marker, so the new dedupe will not adopt them; they want closing by hand.

- **A failing editor test could take the whole machine down, and did, four times.** With the rich
  editor opt-in, a test asked for the source pane by *clearing* storage. That encoded the default
  rather than stating a choice, so the moment the default moved the same line began requesting the
  opposite surface and the assertion failed with a live DOM element as `actual`. `node:assert`
  renders `actual` with `{ depth: 1000, sorted: true, getters: true }`, which on a DOM node walks a
  cyclic graph, fires every getter and never terminates: measured at ~850 MB/s, and `node --test`
  runs ten files at once. A full `npm test` exhausted a 17 GB machine in seconds and left a forced
  power-off as the only way out. Tests now state which surface they exercise
  (`setWysiwygFlag` in `editor/tests/helpers/editorSurface.ts`) and assert absence on a boolean
  rather than on the node (`assertNoElement`), so a genuine failure prints one readable line. The
  suite also runs under `--test-timeout=60000`, so a hung file fails instead of holding a parallel
  worker forever. `npm test` went from unbounded to 1118 tests in 42 s at a 2.43 GB peak.
  ([#502](https://github.com/volivarii/actian-ds-knowledge/pull/502))

- **Components whose CSS class is not `ds-<slug>` ship a real token surface again.** The
  custom-elements manifest guessed each component's selector from its slug, so for the 27
  components where the class differs (`alert-banner` is `.ds-alert`, `text-input` is `.ds-field`,
  `global-header` is `.ds-header`) the scan matched nothing and the component published an empty
  `cssProperties`: schema-valid, and wrong. Ownership is now declared explicitly (`CSS_OWNERS` in
  `components/render/renderer/matrix.js`) and checked against both the rendered markup and the
  stylesheet, so a renamed class fails loudly instead of silently emptying a component's token
  surface. All 63 declarations now carry one, up from 36.
  ([#474](https://github.com/volivarii/actian-ds-knowledge/issues/474),
  [#487](https://github.com/volivarii/actian-ds-knowledge/pull/487))
- **Four components were painting the wrong color.** Turning the new fidelity gate on real renders
  (see "Added") caught genuine defects, not just gaps in the gate itself: `lineage-grouped-node` and
  `segmented-control` filled a surface with `bg-subtle` where Figma renders it white; the critical
  button's background was bound to a text-error token instead of a fill token; and `tag-stage` was
  reusing `tag-default`'s orange and yellow modifier rules even though Figma gives the two
  components different borders for the same color name, something one shared rule cannot serve, so
  `tag-stage` now carries its own modifier scale for those two colors.
  ([#487](https://github.com/volivarii/actian-ds-knowledge/pull/487))
- **A feature referencing a component that does not exist now fails the graph derive instead of
  vanishing.** `components[]` on an application-context feature is hand-authored, and an unresolvable
  slug used to be dropped behind a `console.warn`: the `uses_component` edge simply disappeared, and
  the feature went on claiming a component it was not connected to, with nothing in CI to notice. It
  is an error now, listing every offending reference at once. All 93 references resolve today, so
  this fails only on real drift (a renamed or removed component, a typo, a display name used where a
  slug belongs). ([#484](https://github.com/volivarii/actian-ds-knowledge/pull/484))

- **Components whose CSS class is not `ds-<slug>` ship a real token surface again.** The
  custom-elements manifest guessed each component's selector from its slug, so for the 27
  components where the class differs (`alert-banner` is `.ds-alert`, `text-input` is `.ds-field`,
  `global-header` is `.ds-header`) the scan matched nothing and the component published an empty
  `cssProperties`: schema-valid, and wrong. Ownership is now declared explicitly (`CSS_OWNERS` in
  `components/render/renderer/matrix.js`) and checked against both the rendered markup and the
  stylesheet, so a renamed class fails loudly instead of silently emptying a component's token
  surface. All 63 declarations now carry one, up from 36.
  ([#474](https://github.com/volivarii/actian-ds-knowledge/issues/474),
  [#487](https://github.com/volivarii/actian-ds-knowledge/pull/487))
- **Four components were painting the wrong color.** Turning the new fidelity gate on real renders
  (see "Added") caught genuine defects, not just gaps in the gate itself: `lineage-grouped-node` and
  `segmented-control` filled a surface with `bg-subtle` where Figma renders it white; the critical
  button's background was bound to a text-error token instead of a fill token; and `tag-stage` was
  reusing `tag-default`'s orange and yellow modifier rules even though Figma gives the two
  components different borders for the same color name, something one shared rule cannot serve, so
  `tag-stage` now carries its own modifier scale for those two colors.
  ([#487](https://github.com/volivarii/actian-ds-knowledge/pull/487))
- **A feature referencing a component that does not exist now fails the graph derive instead of
  vanishing.** `components[]` on an application-context feature is hand-authored, and an unresolvable
  slug used to be dropped behind a `console.warn`: the `uses_component` edge simply disappeared, and
  the feature went on claiming a component it was not connected to, with nothing in CI to notice. It
  is an error now, listing every offending reference at once. All 93 references resolve today, so
  this fails only on real drift (a renamed or removed component, a typo, a display name used where a
  slug belongs). ([#484](https://github.com/volivarii/actian-ds-knowledge/pull/484))

### Changed

- **The rich text editor is the default authoring surface; raw markdown is now the opt-out.** The
  Sidebar switch reads "Rich text editor" rather than "WYSIWYG editor (alpha)", and an author who
  has never touched it lands on the rich surface. Turning it off *writes* the opt-out rather than
  removing the key, because an absent key means "never chose", which is on: removing it would have
  quietly undone the choice on the next reload. Being on by default is only safe because it is not
  the only gate. `shouldUseWysiwyg` still intersects the flag with the CI-derived rich-safe set, so
  a file whose Milkdown round-trip is unproven keeps opening in the source pane no matter what the
  flag says. ([#503](https://github.com/volivarii/actian-ds-knowledge/pull/503))

### Added

- **The body toolbar stays put, and all three surfaces share one reading column.** The toolbar
  renders inside the same scrolling container as the document, so in a long file it used to scroll
  out of reach and formatting meant scrolling back to the top; it is pinned now. The rendered
  preview, the rich edit surface and the source pane also read their measure and gutter from one
  pair of custom properties (`--md-measure`, `--md-gutter`) instead of three copies kept in step by
  a comment, and a test fails if a `--md-*` name referenced in `src/` is not declared. The rich
  surface previously inherited only table borders, so prose ran edge to edge with user-agent
  paragraph margins that stacked inside table cells and made rows read as enormous.
  ([#503](https://github.com/volivarii/actian-ds-knowledge/pull/503))

- **Every canonical render is now actually checked, and the report says how much of it we can check
  at all.** The fidelity gate filtered renders on a `source: "derived"` marker that no render
  carries, so it examined zero of the 63 canonical component renders while printing a green
  "fidelity: OK". It now classifies every color declaration in each render's owned CSS against the
  Figma appearance capture: 445 examined declarations land in verified, verified via token name,
  mismatch, or unverifiable, and a further 2 are overridden by a later, more specific rule in the
  same slug's own CSS and sit outside that examined set entirely, since an overridden declaration is
  not paint. It writes `components/render/dist/fidelity-report.json`. Two numbers come out of it.
  Verified fidelity, currently 96.9%, is the 63 declarations that matched the capture by a direct hex
  comparison, as a share of the 65 declarations the capture could confirm one way or another (the
  other 2 of those 65 verified via token name instead of a direct hex match, and are correct too,
  just counted on their own line rather than folded into the headline number). Oracle coverage,
  currently 14.6%, means: how much of what the renders paint the capture can speak to at all, with 37
  of the 63 components entirely blind to it. Oracle coverage is the number that matters here: it says
  the constraint on render quality is now the depth of the Figma capture, not the renders, and it
  sizes that work per component. It is not a claim that the design system is 96.9% correct. Mismatches
  now block the build; unverifiable never does, because absence of a captured fact is not evidence of
  a wrong color.
  ([#487](https://github.com/volivarii/actian-ds-knowledge/pull/487))
- **The editor can finally answer what belongs to which product.** Opening a product now shows the
  entities and features that are part of it; opening an entity or a feature shows the products it
  belongs to, kept separate from what it depends on (a feature lists the design-system components it
  is built from). The data was always there: application-context files were the one part of the
  substrate that never resolved to a node in the knowledge graph, so the relations panel sat empty on
  exactly the records whose purpose is expressing belonging. Editor-only, version-neutral.
  ([#479](https://github.com/volivarii/actian-ds-knowledge/pull/479))
- **Create an entity or a feature in the editor, and join one that already exists.** The Entities and
  Features sections now carry their own "+", so an app team can bring the things their product works
  with and the things people do in it, not just the product itself. Because entity and feature names
  are a single flat namespace shared by every product, a name that is already taken is treated as the
  normal case rather than an error: the dialog shows the record that exists and the products using
  it, and offers to add your product to that record instead of forking a second one. A feature can
  also declare the design-system components it is built from, which is the link between a product's
  context and the shared core. Editor-only, version-neutral.
  ([#478](https://github.com/volivarii/actian-ds-knowledge/pull/478))
- **Create a product in the editor (application context).** The Products section now carries a
  "New product" affordance, so an app team can bring its own context into the knowledge layer instead
  of only editing what already exists. The dialog writes a schema-valid
  `app-context/src/apps/<slug>.md` and, for each existing feature or entity the product reuses,
  appends the product to that record's `apps:` list in the same batch, so it all lands as one
  reviewable pull request. Records other products already depend on are labelled as shared and named
  in a disclosure before you confirm, because that write edits a file those products rely on. Records
  that could not be joined are reported rather than dropped. Editor-only, version-neutral.
  ([#477](https://github.com/volivarii/actian-ds-knowledge/pull/477))
- **Cross-domain search in the editor header.** A single search in the top bar (also `Cmd/Ctrl-K`)
  now spans components, foundations, content, accessibility, and the products, entities, and features
  that use the system, with grouped, typed, author-language results that open the thing directly. It
  replaces the thin command-palette modal (its actions moved into the same search). The home hero was
  simplified. Editor-only, version-neutral. ([#476](https://github.com/volivarii/actian-ds-knowledge/pull/476))
- **Gray-box to zero: 22 hand-authored render leaves across 5 component families** ([#472](https://github.com/volivarii/actian-ds-knowledge/pull/472)).
  Continues the #465 slice. Real DS-fidelity HTML render cases (in `ds-html-map.js` + `ds-base.css`) now
  exist for 22 curated components, wired into **both** the plugin renderer (`BUILT_SLUGS`) and the
  canonical render library (`RENDER_SLUGS` in `matrix.js`), so they no longer render as gray placeholder
  chips: feedback states (`error-state`, `maintenance-state`, `confirmation`); tags (`tag-shared`,
  `tag-catalog`, `tag-stage`, `tag-status`, `tag-glossary-item-type`, `tag-catalog-item-type`); cards
  (`card-for-perimeter`, `card-for-grouped-content`, `search-result-card`); dropdowns/overlays
  (`notification-dropdown`, `search-dropdown-menu`, `whats-new-dropdown`, `drawer-side-panel`); primitives
  (`spinner`, `loading-skeleton`, `scroll-bar`, `link`, `avatar`, `collapse-accordion`). `BUILT_SLUGS`
  41 → 63. Colors and spacing are taken from captured Figma anatomy, with per-slug BEM classes and
  `MATRIX_OVERRIDES` where the gallery would otherwise drop identity values. Nine further curated
  gray-box slugs were triaged as not-yet-buildable and deferred with reasons (no registry entry or no
  captured structure). Also scopes `scripts/render/fidelity-check.js`'s `checkBaseCssRules` to validate
  each `.ds-tag--<modifier>` rule against only its owning fact source (not a union of all tag facts) and
  harvests captured text colors, fixing a false positive without weakening the gate.
- **Safe anchor rename in the editor.** Renaming a heading anchor (`{#slug}`) now updates the
  same-file links that point at it and honestly discloses which other files reference it (rather than
  silently breaking them). Click the anchor chip (rich) or the "Rename anchor" toolbar button
  (source). Cross-file references are disclosed, not auto-rewritten (a slug is file-scoped and
  substrate links are often logical), and the submit-time anchor-preservation check remains the safety
  net. Editor-only, version-neutral. ([#471](https://github.com/volivarii/actian-ds-knowledge/pull/471))
- **Anchor authoring helper in the editor.** Heading anchors (`{#slug}`) are now first-class: a
  toolbar action derives a unique, leading-letter slug for you (both the source and rich editors), and
  in the rich (WYSIWYG) editor a heading's anchor renders as a quiet chip instead of raw `{#slug}`
  text. Additive only for now (create + display); safe rename/remove with in-repo reference rewriting
  is the planned follow-up. Editor-only, version-neutral. ([#470](https://github.com/volivarii/actian-ds-knowledge/pull/470))
- **In-editor domain status toggle.** A component's prose domain file (`content` / `usage` /
  `design` / `behavior`) now carries a `draft ⇄ approved` control in the Knowledge Editor header;
  clicking stages the `_meta.yml` `domains.<domain>.status` change into the submission cart and it
  ships on the next PR (the merge is the approval). Self-serve for now, routed through a single
  `setDomainStatus` choke-point so a future reviewer/permission gate slots in without a surface
  change. Editor-only, version-neutral. ([#464](https://github.com/volivarii/actian-ds-knowledge/pull/464))
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

### Changed

- **Editor: app-context records are edited as YAML, not as a generated form.** The frontmatter pane
  now edits the file's own text with schema-driven key completion and inline schema errors, so an
  untouched record round-trips byte-identically and `relationships` / `apps` are no longer typed into
  a generic key/value widget. Other domains keep the existing form until the remaining slices land.
  One behavior change: staging to the batch no longer blocks on schema validity. Under the old
  RJSF form, "Add to batch" only fired once the record validated against its schema; the YAML pane's
  button stages unconditionally, so a record with a schema error can now be added to the batch (the
  inline lint squiggle still shows it while editing, and `validate-app-context.js` still catches it
  in PR CI before merge). The pane also documents itself: hovering a key shows its schema
  description, type, required status, and any example values straight from the same schema
  (`schemaHover.ts`), and a one-line caption above the pane surfaces the schema's own root
  description plus a hint to hover a key, so an author who has never seen the file type has
  somewhere to start. ([#497](https://github.com/volivarii/actian-ds-knowledge/pull/497))

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
- **Merging the breaking sync with the render fidelity gate found five more wrong colors.**
  ([#475](https://github.com/volivarii/actian-ds-knowledge/pull/475))
  The sync predates the gate that now blocks on a wrong color ([#487](https://github.com/volivarii/actian-ds-knowledge/pull/487)),
  so bringing the two together was the gate's first real test against a live Figma sync. It failed the
  build on five declarations whose values the sync's own captured anatomy contradicted:
  `tag-catalog-item-type`'s data-product, output-port and use-case fills, and `tag-stage`'s lime and
  orange. Corrected against the captures, binding a token where one round-trips (`success-50`,
  `warning-50`) and a commented literal where none exists. `tag-default` and `tag-stage` turn out to
  disagree on the shared lime and orange fills as well as the borders #487 already separated, so
  `tag-stage` keeps its own scoped rules and the shared ones stay `tag-default`'s. The redesign
  retired tag borders outright, so #487's `.ds-tag-stage--orange`/`--yellow` border overrides go with
  them. Three further consequences of the two changes meeting: `CSS_OWNERS` drops its `radio-button`
  entry, because the rename to `radio` makes the plain `ds-<slug>` fallback correct again (28 entries
  to 27); three application-context features still listed `search-filters` in their components, which
  [#484](https://github.com/volivarii/actian-ds-knowledge/pull/484)'s gate correctly refused to drop
  silently, and the references are removed after confirming a genuine removal rather than a rename (no
  component in the new registry carries its Figma key); and `tag-status`'s curated gallery override
  still named all eleven Status values after the axis was cut to five, so the gallery drew six
  components the design system no longer contains. That override is trimmed, and a new invariant fails
  the build on any override cell naming a variant the registry lacks, so a curated list can no longer
  outlive the facts it copies.

- **Breaking Figma sync (2026-07-23).** Component or variant changes the nightly sync classified as breaking; the PR body carries the per-component diff summary. ([#475](https://github.com/volivarii/actian-ds-knowledge/pull/475))
- **The tag family is re-grounded on a DS redesign, and three of its contracts changed.** ([#475](https://github.com/volivarii/actian-ds-knowledge/pull/475))
  The 2026-07-23 capture replaced the tag treatment: the old pale fill plus tinted border became a
  single flat fill, and the fill IS the tint the border used to carry (Pink was background `#fff5f6`
  with a `#ffd6d8` border, it is now `#ffd6d8` with no border, and every hue follows). Verified as a
  real redesign rather than a degraded capture before encoding it: same Figma key, node id and page,
  undegraded quality, coherent new values throughout. `ds-base.css` still encoded the old palette, so
  shipped tags were visibly wrong against the DS and the fidelity gate correctly red with 22
  violations. Note `Gray` deliberately gets no rule of its own: it is still a live `tag-default`
  Color, it simply resolves to the same value as `Default` now, which is why it carries no delta.
  `tag-stage`'s Gray, Lime and Orange did diverge and get scoped rules.
  Three consumer-visible contract changes ride along:
  - **`radio-button` is now `radio`.** Upstream renamed the component, and the anatomy capture lands
    at `radio.json`, so `readAppearance("radio-button")` threw and hard-failed `derive:render`. The
    slug is followed through the renderer, `components/src/`, content patterns, the manifest, the
    editor's generated safe-path list and the tests. This changes a docs URL and the plugin's
    `BUILT_SLUGS`.
  - **`tag-status` lost six of its eleven Status values** (Maintenance, Queued, Scheduled, Offline,
    Sleeping, Stopped) and the neutral colour family with them; Pending moved into info. A Status the
    map no longer knows renders with no family modifier and falls back to base `.ds-tag`, rather than
    the previous `|| "error"` default: painting a retired value red would assert a failure the DS
    never described. `.ds-tag--status-neutral` is deleted rather than kept against an invented swatch.
  - **`search-filters` left the registry**, so the `forms` pattern no longer lists it as a related
    component. Its authored guideline stays and is now guidance-only, the same state `success-state`
    already occupies. Whether it was deleted upstream or only unpublished is still open.
- **Four icon slugs were retired upstream and followed through by Figma key, not by name.**
  ([#475](https://github.com/volivarii/actian-ds-knowledge/pull/475))
  `ai` to `stars-filled`, `chevron-left` to `arrow-left` and `directory` to `catalog` are the same
  glyphs under new names, each confirmed by a matching `dsKey`. `chevron-up` has no successor by key:
  the rework deleted it outright, like the six already tracked in #406. Its eight call sites are
  carets, so they move to `arrow-down`, which survived the rework byte-identical and is precisely
  `chevron-up` rotated, with the rotation flags inverted accordingly. `collapse`/`expand` were
  rejected as substitutes despite the suggestive names: they are diagonal fullscreen glyphs and would
  have masked the loss.
- **The fidelity gate could not see a wrapped `var()`.** ([#475](https://github.com/volivarii/actian-ds-knowledge/pull/475))
  `checkRuleBody` matched `var\((--zen-[a-z0-9-]+)\)` with the token name flush against both
  parentheses, but Prettier wraps a long declaration across three lines, so every wrapped reference
  was skipped and its rule read as clean. Found because a deliberately wrong `tag-stage` colour
  passed. The matcher is now whitespace-tolerant, and `checkBaseCssRules` resolves a rule's owner
  from the whole selector so a member-scoped hue (`.ds-tag-stage.ds-tag--lime`) is checked against
  that member's capture instead of `tag-default`'s. Mutation-verified both ways: a fabricated literal
  and a fabricated wrapped `var()` are each caught.
- **`RENDER_SLUGS` is derived from the renderer's own switch instead of restating it.**
  `matrix.js` already documented where the truth lived ("the render slugs are the `case "<slug>":`
  branches in `ds-html-map.js`") and then listed all 63 by hand anyway, so adding or renaming a
  component took three coordinated edits across two files. #465 shipped a slug that never reached the
  canonical render library for exactly that reason: the case existed, `BUILT_SLUGS` listed it, and
  this list did not. `matrix.js` is node-only, so it now parses the sibling source, and throws if it
  finds no cases rather than letting an empty list silently skip every render.
  `ds-html-map.js` keeps its `BUILT_SLUGS` literal because that module is browser-capable and cannot
  read its own source, which leaves one hand-written list where there were two. Invariant 8 changes
  meaning as a result: it used to compare two hand lists, so forgetting both passed silently, and it
  now compares the derived set against `BUILT_SLUGS` and catches a case added without a matching
  entry. Mutation-verified. **The regenerated canonical manifest is set-identical but reordered**,
  because the derive sorts, so the output cannot shift depending on where a case is inserted.
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

### Fixed

- **Empty text slots across 18 components.** 83 of the 358 visible text cell-slots in
  the canonical renders, one rendered matrix cell times one content prop, were
  rendering an element with no text, so the design bundle and generated flows showed
  components missing a part the design file gives them. Those 83 empty cell-slots
  collapse to 26 distinct component-and-prop pairs across the 18 components, because
  the same prop is empty in more than one cell for several of them. 25 of the 26 pairs
  now carry a value, each with a comment naming where it came from: 14 are quoted
  directly from the Figma capture, naming the layer; 3 initials values are derived
  from the component's own vocabulary, `metamodel-widget`'s from each cell's own Type
  value, since its Type axis is the item-type vocabulary itself; 7 are authored,
  `chat-with-ai-steward`'s context and insight, `table`'s rows, `modal`'s body,
  `input-date`'s helper, `toggle`'s helper text and `stepper`'s title, because those
  Figma components hold no usable text for those slots. `account-dropdown`'s email is
  the 1 substituted value, deliberately replaced because the capture holds what reads
  as a real person's address at an external domain. The remaining pair,
  `alert-banner`'s title, stays empty by design and is exempted with that reason.
  One consumer-visible consequence of deriving those initials: `metamodel-widget`'s
  `Item type initials` no longer publishes a `default` in `render-contract.json`,
  because the value is now computed per variant rather than written as a literal the
  contract extractor can read, and a single published default would in any case have
  been wrong for four of the five cells.

  `stepper`'s title is the one place a captured string was deliberately not used. The
  capture reads `Complete`, which is the name of one value of the State axis, so
  quoting it made three of the four State cells display "Complete" while rendering as
  something else. A step's title is its name and does not vary by state, so the
  authored `Connect source` reads correctly in every cell, and the code comment says
  so and names the value it declined.

  **Behaviour change for consumers who suppressed a part by passing an empty value.**
  Twelve of these slots, across ten components, were conditional-omit: the element
  rendered only when the consumer supplied a value, and now it always renders. Those
  twelve are `account-dropdown` (email), `dropdown-select-default` (description and
  helper), `input-date` (helper), `modal` (body), `notification` (action button),
  `page-header` (description), `popover` (title and body), `radio` (helper text),
  `stepper` (body) and `toggle` (helper text). They resolve their value as
  `props.X || "literal"`, so a consumer that passed `Description: ""` to drop the
  element previously got no element and now gets the default text; an empty string no
  longer suppresses the part. `radio` and `toggle` keep an explicit opt-out through
  their `Show Helper text` prop.

  `table` (rows) and `modal` (actions) are the exception: they test
  `props.X === undefined`, so an empty value still suppresses their part. The two
  idioms are deliberately left as they are rather than unified, since unifying them
  would be a second behaviour change in the same release.

- **`components/render/renderer/default-props.json` is retained, and its README description
  corrected.** The file has no reader in this repository, and it was briefly deleted on that
  basis, but it does have a consumer: the plugin's fidelity harness
  (`scripts/lib/renderer.js`) reads it out of the vendored tree at module load and unguarded,
  and 48 plugin files require that module, so removing it upstream would land as a red plugin
  PR on the next nightly vendor snapshot. The plugin also has a test forbidding it from keeping
  its own copy, so reading this one is deliberate. What was wrong was the README line claiming
  the variant matrix falls back to this file, which was never true. The README, the
  `paths-manifest.json` collection description and `scripts/render/derive-contract.js` now all
  say the same accurate thing: no reader here, retained for the plugin, and content defaults
  for rendering live in `ds-html-map.js` and reach consumers as `props[].default` in the render
  contract. `tests/render/renderer-relocation.test.js` asserts the file's presence again,
  because that assertion is what guards the vendored contract.

### Added

- **A gate on empty text slots**, covering all 58 render slugs. It injects a sentinel per
  prop per matrix cell and fails when removing it leaves the cell's text unchanged.
  `fragment-invariants.test.js` had said in its own header that a fragment could render
  every cell as an empty string and every gate would stay green; this closes that.
  Exemptions require a reason and must still name a real slot.
- **A ratchet on variant collapse.** `derive-contract.js` already measured how many variant
  values render identically to a sibling (57 of 236 identity-axis values) and recorded it
  without enforcing it. An increase now fails, per component and in total, compared against
  the contract at the merge base.

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
