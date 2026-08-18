# Recipes

A **pattern** in `../patterns/` names a page shape and says in prose what it is. A **recipe** here
gives that shape a composition: the node tree a consumer renders to produce the page.

Patterns answer "what shapes exist". Recipes answer "what is this shape made of".

## Where recipes came from, and why they moved

Recipes lived in the plugin (`recipes/flow/`) and were generic SaaS archetypes written from
imagination: `table-list`, `form-create`, `dashboard`. That is the wrong owner and the wrong source.
Consumers that keep their own copy of a shared fact drift from it, and a page shape invented rather
than observed describes a product nobody ships.

The evidence, gathered 2026-08-18 by composing the Studio Catalog page and comparing it against a
screenshot of the running product.

**The robust finding, measured across the whole kit.** Rebuilding the page correctly required **no new
FM components**. `fmSlider`, `fmCheckbox`, `fmToggle`, `fmProgressBar`, `fmTag`, `fmChip` and
`fmMultiSelectDropdown` all already shipped. Across all twelve plugin recipes they were used five
times in total (`fmBadge` four, `fmCheckbox` once), with zero uses of slider, toggle or progress bar.
The vocabulary existed and the compositions did not reach for it. That is a count over the entire
recipe set, not an impression.

**The single-page observation.** Asked for Catalog, the generator selected `table-list` at tier
`recognized`, confidence 0.93, and produced a two pane CRUD table. The real page is a three pane
faceted browse over 24,160 items. On that page, the parts sourced from the substrate were right
(sidebar labels, entity properties, entity relationships) and the parts a recipe invented were wrong.

That contrast is suggestive, not established. **It is one page.** Treat it as a single datapoint until
a second archetype is composed the same way and either confirms or breaks it. It should not be quoted
as a general law about substrates versus consumers.

## Authoring a recipe

Derive it from the product, not from an idea of the product. Take a screenshot of the real page,
compose it, render it, and compare. A recipe that has never been rendered next to the screen it
claims to describe is a guess.

Carry a `renderNotes` array. It records the renderer behaviours an author must know to make the
composition draw correctly, so the next recipe does not rediscover them by looking at a broken page.

## Status: INERT

**These files are INERT. They ship, and nothing reads them.** `app-context/` is vendored whole, so consumers receive
this directory, but `scripts/app-context/derive-app-context.js` reads only `apps`, `entities` and
`patterns`. A recipe is therefore not folded into `dist/app-context.json` and does not reach
`resolve-patterns.js`.

Wiring is deliberately a separate change, because it alters the derived consumer contract. Until it
lands, a recipe is a checked-in reference a human reads, not something a generator resolves.

**Do not record a recipe as delivered while this section still says INERT.** A file that is vendored,
greppable and reviewable looks finished, and that appearance is the known failure mode here: usage
guidance was once 54 of 54 authored, derived, vendored and live on 56 pages while rendering on zero
of them, with every upstream check green. The rule that came out of it is to measure at the surface
and prefer the metric that ends at a human. Presence in the tree is not effect on a page.

## Known gap in the pattern set

There is no `faceted-browse` pattern in `../patterns/`. The nearest, `search-filtered-table`,
describes the Catalog page as its own opposite: *"no separate filter sidebar... no other facets"*.
Adding the pattern and correcting that description changes derived output, so it is tracked
separately rather than folded in here.
