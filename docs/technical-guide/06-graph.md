# The graph

A typed, validated projection of what the other domains already say. Nobody draws
it, nobody edits it, and every edge in it is derived from something a person
authored somewhere else.

*Counts read at knowledge v0.34.166 on 2026-09-01 from `graph/dist/graph.json`.*
*Every number in this chapter is a reading of that revision, not a contract. They all
move with each Figma sync — an additive nightly is enough to change the component
count — and no exact count is pinned anywhere, by design: the gates that once
did were replaced with a union join against the registries plus order-of-magnitude
bounds, because a hand-kept count blocks a clean sync without being able to say what
changed. Wide bounds and the join will still stop a collapse or a mass ingestion. Re-read them with
`node -e` against the dist rather than trusting the value here.*

## What it is for

Every domain in this repository knows about its own neighbours. Only the graph
knows how a component reaches an accessibility criterion, a motion pattern, a
product entity and a UX pattern in one query. It exists so a consumer can traverse
the substrate rather than reassemble it.

It holds **847 nodes across 10 types** and **1176 edges across 11 types**.

## Where the edges come from

Three sources, and none of them is the graph itself:

| Source | Contributes |
| --- | --- |
| Frontmatter connections | `a11y_refs`, `motion_refs`, `foundations_refs` on categories and components; `relationships` on app-context entities; `components[]` on UX patterns |
| Figma registries | Component identity, category membership, and structural composition |
| App-context dist | Apps, entities, patterns, terminology |

The rule that follows: **to get a new edge into the graph, author the frontmatter
field it derives from.** There is no way to add one directly, and that is what
keeps the graph queryable rather than a pile of ad-hoc links.

Prose links are the deliberate exception. A markdown link in a body is live in the
Editor's relations panel and never reaches the graph, because it is prose rather
than typed data and there is nothing structured to carry.

## Node types

| Type | Count | What it is |
| --- | --- | --- |
| `component` | 614 | Every registry entry across the three kits, not only the 54 with authored guidance |
| `foundation_section` | 76 | Leaves of the foundations tree |
| `terminology_term` | 33 | Product vocabulary |
| `a11y_criterion` | 32 | WCAG 2.2 AA sections, carrying their criterion numbers |
| `ux_pattern` | 31 | Recurring product patterns |
| `app_entity` | 30 | Product concepts |
| `category` | 12 | Component categories |
| `content_topic` | 8 | Content guidance topics |
| `motion_pattern` | 8 | Anchored motion patterns |
| `app` | 3 | Studio, Explorer, Administration |

That component count is the number that surprises people. It counts every entry in
`dskit`, `fmkit` and `metakit`, including icons, not the 54 components someone has
written guidance for. Read it as the registry's size, never as coverage — and read
it from the dist rather than from here, since an additive nightly moves it.

## Edge types

| Type | Count | From | To |
| --- | --- | --- | --- |
| `composed_of` | 383 | component | component |
| `in_category` | 324 | component | category |
| `uses_component` | 110 | ux_pattern | component |
| `in_app` | 95 | app_entity, ux_pattern | app |
| `a11y_ref` | 79 | category, component | a11y_criterion |
| `narrower` | 73 | foundation_section | foundation_section |
| `entity_related` | 42 | app_entity | app_entity |
| `related` | 26 | content_topic | component |
| `foundations_ref` | 14 | category, component | foundation_section |
| `motion_ref` | 13 | category, component | motion_pattern |
| `term_about` | 17 | terminology_term | app_entity, app, ux_pattern |

`graph/vocabulary.json` is a **closed** vocabulary: each edge type permits only
specific source-to-target type pairs, and a violation fails `npm run validate:graph`.
That constraint is why the graph can be queried with confidence rather than
inspected with suspicion.

## Edge shape

```json
{
  "source": "category:action",
  "target": "a11y:alerts-toasts-banners",
  "type": "a11y_ref",
  "scope": "category",
  "confidence": "asserted",
  "provenance": {
    "source_file": "components/src/categories/action.md",
    "deriver": "derive-graph.js",
    "method": "a11y_refs"
  }
}
```

Every edge carries its provenance: the file it came from, the deriver that made it,
and the method. So any edge can be traced back to the line of source that produced
it, which is what makes "the graph says X" an answerable claim rather than an
assertion.

`scope` distinguishes a ref asserted on a category (and therefore inherited by
every component in it) from one asserted on the component itself.

## The linked-data sibling

`graph/dist/graph.jsonld` is the same nodes and edges wrapped with
`graph/context.jsonld`, with node `@type`s and reified edges. It reuses schema.org,
SKOS, PROV-O and WCAG vocabularies, and it is structurally lossless: every node and
every edge field carries through.

`graph.json` stays canonical. Full RDF and SPARQL round-tripping needs a stable IRI
base and source-file provenance as dereferenceable IRIs, and that is deferred until
the IRI base domain is chosen.

## The quality report

`graph/dist/quality-report.json` carries 14 metrics in three dimensions.

| Dimension | Metric | Value | Read it as |
| --- | --- | --- | --- |
| integrity | `schema_errors` | 0 | Must stay 0 |
| integrity | `dangling_edges` | 0 | Must stay 0 |
| integrity | `typed_edge_violations` | 0 | Must stay 0 |
| coverage | `a11y_ref`, `foundations_ref`, `motion_ref`, `overall` | 1 | Every category carries each transversal ref |
| connectivity | `orphan_nodes` | 268 | Nodes with no edge at all |
| connectivity | `components_without_category` | 290 | Registry entries Figma has not categorised |
| connectivity | `categories_without_a11y` | 6 | Categories carrying no accessibility ref |
| connectivity | `criteria_unreferenced` | 13 | WCAG sections nothing points at |
| connectivity | `composition_edges` | 383 | Structural nesting |
| connectivity | `pattern_component_edges` | 110 | Patterns tied to real components |
| identity | `slug_collisions` | 25 | One slug claimed by more than one kit |

Two honest readings of that table:

- **The connectivity numbers are dominated by the registry, not by authoring debt.** 268 orphans and 290 uncategorised components are mostly icons and kit entries that were never meant to carry guidance. Quoting either as a documentation gap overstates it by an order of magnitude.
- **Every `timestamp` in the report is `null`.** The report says what is true now and gives no direction, so nothing in it can answer "is this getting better". The render tier's `quality-trend.json` is the pattern that fixes it, and doing the same here is roadmap item 22 under the outcome about reporting health with dated numbers.

## Collisions

`graph/dist/collisions.json` records the 25 slugs claimed by more than one kit, with
the candidates and which one won:

```json
{
  "slug": "arrow-down",
  "resolved_to": "dskit",
  "candidates": [
    { "kit": "dskit", "key": "43009d0b...", "nodeId": "7207:2839" },
    { "kit": "fmkit", "key": "4caaf6d4...", "nodeId": "8:20590" }
  ]
}
```

This file is the record of an ambiguity that was resolved silently, written down so
it can be argued with. It is also the first place to look when a consumer resolves
a slug and gets a component it did not expect.

## Freshness

The graph is derived from other domains' **dist**, so `graph-derive.yml` triggers on
their auto-commits and not only on its own inputs. The required check re-derives it
and fails if the committed `graph.json`, `quality-report.json`, `collisions.json` or
`graph.jsonld` differs. Before that guard it runs
`scripts/validate/validate-graph-registry-union.js`, which compares the committed
registries against what was derived from them — the graph's component nodes, and
the collisions sidecar — and names the slug that diverged, where the guard can only
say the artifact is stale. Those comparisons are steps rather than tests because a
sync commits registries before the regenerated dist, so the pair is transiently
unequal on every registry-changing PR, and the sibling derive workflows run
`npm test` before their own auto-commit.

The consequence for anyone reading the Editor: the graph reflects the last merged
state, not what you just typed. Frontmatter refs and prose links are rescanned live;
the graph updates after your pull request merges and the pipeline re-derives. The
Editor labels this "as of last merge" for exactly that reason.

## Known gaps

- **No direction.** All 14 quality metrics are undated snapshots.
- **The IRI base is unchosen**, so the JSON-LD is a valid document that no linked-data reader can dereference into.
- **Content is un-anchored.** Content topics point at components through `related`, but nothing points into content as a transversal taxonomy, so principle P8's symmetry is one-sided.
