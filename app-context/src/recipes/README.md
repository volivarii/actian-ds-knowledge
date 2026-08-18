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

## Status: wired

A recipe is derived per slug to `app-context/dist/recipes/<slug>.json`, validated against
`schemas/app-context-recipe.json`, stamped, and registered in `paths-manifest.json` as the
`appContextRecipes` collection so `validate-manifest` proves the path resolves.

Per slug rather than folded into `app-context.json`, because that file is consumed whole and one
recipe already exceeds 1400 lines. Bundling them would make every consumer pay for every archetype in
order to read one, which is the mistake already on the roadmap for the 497KB `render.css` inlined into
all 61 bundle cards.

Two guards, both proven to fail before they were trusted:

- The derive refuses to emit when a recipe names an app or pattern that does not exist. Verified by
  pointing a recipe at a non-existent pattern: exit 1, no dist leaf written.
- `tests/app-context-recipes.test.js` asserts a recipe actually reached dist, with a positive control
  proving the count can be zero, so the assertion cannot pass over an empty list.

The remaining consumer-side gap is the plugin's, not this repo's: `resolve-patterns.js` lives in the
plugin and resolves patterns only, so nothing there reads a recipe yet. Two separate facts, worth not
conflating: unread here would be a knowledge problem, and this repo now reads them; unresolved there
is a plugin problem.

## Known gap in the pattern set

`faceted-browse` now exists in `../patterns/`, added here because the derive refuses to emit a recipe
whose pattern does not resolve.

Still open, and deliberately untouched: `search-filtered-table` describes the Studio Catalog page as
its own opposite, "no separate filter sidebar... no other facets". That is the substrate being
actively wrong about the product's main screen, and every consumer reading patterns has been reading
it. Correcting it is tracked separately.
