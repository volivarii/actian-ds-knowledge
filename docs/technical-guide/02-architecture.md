# Architecture

Where every kind of thing lives, and the two conventions that let you tell them
apart without opening a file.

*Counts in this chapter were read at knowledge v0.34.166 on 2026-09-01. Each is
followed by the command that reproduces it. Counts move; the shapes do not.*

## The two conventions

**The folder name tells you the origin.** `src/` is written by a person. `dist/`
is written by CI and is overwritten on the next run. You never have to open a file
or read its frontmatter to know which you are looking at.

**The manifest tells you the address.** Consumers resolve a logical name through
`paths-manifest.json` and never a file path, so the tree above can be reorganised
without anyone downstream noticing.

Everything else in this chapter follows from those two.

## The four zones

Every top-level entry belongs to exactly one zone. The classification is also
machine-readable, in the `_zones` block of `paths-manifest.json`, so a consumer can
filter by role rather than by guessing from a name.

| Zone | What it is | Where |
| --- | --- | --- |
| **Knowledge** | The design-system content: how to design | `foundations/` `components/` `content/` `accessibility/` |
| **Contract** | The machine-readable consumption surface: the connector | `paths-manifest.json`, `schemas/`, `graph/dist/`, `llms.txt`, `llms-full.txt`, `clients/`, `vendor-include.json` |
| **Metadata** | Product and configuration reference data consumed by tooling | `app-context/`, `tokens/` |
| **Tooling** | Build machinery, read by nobody consuming the substrate | `scripts/`, `tests/`, `editor/`, `auth-worker/`, `.github/` |

The zone block is narrower than this table: it keys on the top-level prefix of
manifest entries, so it classifies `accessibility`, `components`, `content` and
`foundations` as knowledge, `graph` as contract, and the app-context and token
prefixes as metadata. Tooling has no manifest entries at all, which is the point:
it is absent from the contract, so it is structurally absent from every consumer.

```
python3 -c "import json;z=json.load(open('paths-manifest.json'))['_zones'];print(z)"
```

## Three origins, and how each arrives

The `src`/`dist` split names two of them. The third is the one that surprises
people.

| Origin | Written by | Arrives via | You may edit |
| --- | --- | --- | --- |
| **Authored** | A person, in the Editor or a text editor | A pull request | Yes |
| **Derived** | A generator in `scripts/` | A derive workflow on the pull request | No |
| **Synced** | Figma, through the REST API | `sync-from-figma.yml`, nightly at 07:00 UTC | No, edit it in Figma |

Synced data lands in `dist/` and so is covered by the never-edit rule, but the
correction path is different: a derived file is fixed by fixing its source or its
generator, and a synced file is fixed in Figma and republished. Registries,
categories, anatomy trees, media captures, text and effect styles are all synced.

Every generated file says so about itself. JSON carries `_meta.auto_generated`,
`_meta.source` and `_meta.do_not_edit`; markdown carries an auto-generated banner
near the top. A new generator follows the same stamping pattern.

## Exceptions to the never-edit rule

There is exactly one, and it is worth knowing because it looks like a mistake:

- **`components/dist/registries/metakit.json`, the `templates` block only.** It is
  hand-curated and preserved across syncs, flagged by `_meta.hybrid: true`.
  Everything else in that file is regenerated from Figma.

One near-exception that is not in a `dist/` folder but is often mistaken for
generated code:

- **`components/render/renderer/`** is hand-authored source: the canonical CSS and
  the HTML markup map. It carries `origin: human` in the manifest and it sits
  outside a `src/` directory, which is the layout's one real inconsistency. It is
  covered in chapter 05.

## The top-level map

| Entry | Zone | Origin | What it holds |
| --- | --- | --- | --- |
| `foundations/` | knowledge | authored, derived | 7 source sections, ordered by `_order.json`, deriving a hierarchical tree plus a bundle plus a verbatim concat |
| `components/` | knowledge | authored, derived, synced | The largest domain. See the breakdown below |
| `content/` | knowledge | authored, derived | 22 source files across `writing/` (11), `patterns/` (8) and `product/` (3), deriving `global.md`, per-bucket splits and `words-to-avoid.json` |
| `accessibility/` | knowledge | authored, derived | 13 source files carrying 32 anchored WCAG 2.2 AA sections, deriving `a11y-index.json` |
| `app-context/` | metadata | authored, derived | 3 apps, 30 entities, 31 UX patterns, 33 terminology entries, 4 page recipes captured from the running product |
| `tokens/` | metadata | derived (one authored input) | 463 token leaves in W3C DTCG format, the CSS variables and a generated reference, all derived from `foundations/src/`. Only `tokens/src/figma-bindings-raw.json` is hand-maintained |
| `graph/` | contract | derived | The projection: `graph.json`, `graph.jsonld`, a quality report, a collisions report, plus the hand-authored vocabulary and JSON-LD context |
| `schemas/` | contract | authored | 33 JSON Schemas |
| `clients/` | contract | authored | `resolve-paths.js` and `vendor-snapshot.js`: the reference resolver and vendoring client, shipped to consumers as source |
| `paths-manifest.json` | contract | authored, stamped | 124 path entries, 20 collections. The contract |
| `domains.json` | contract | authored | The per-domain authoring contract: for each domain, its source glob, its generator, its frontmatter schema, how its body is treated, and its dist shape |
| `llms.txt`, `llms-full.txt` | contract | derived | The content index for AI surfaces |
| `vendor-include.json` | contract | derived | The distributable top-level surface, computed rather than listed |
| `vendor-exclude.json` | contract | authored | Sub-paths a consumer must not copy even though their parent is included. Currently empty |
| `scripts/` | tooling | authored | 106 tracked JavaScript files across 17 subdirectories |
| `tests/` | tooling | authored | 199 tracked files, run by `npm test` |
| `editor/` | tooling | authored | The Product Knowledge Editor, 188 tracked source files. Chapter 07 |
| `auth-worker/` | tooling | authored | The Cloudflare Worker that brokers the Editor's GitHub OAuth. Chapter 07 |
| `.github/` | tooling | authored | 19 workflows. Chapter 08 |

```
git ls-tree --name-only HEAD
```

### Inside `components/`

It carries five different kinds of thing, which is why it is over a thousand files (1066 at the version above; `find components -type f | wc -l`).

| Path | Origin | What it is |
| --- | --- | --- |
| `src/<slug>/` | authored | 54 components, each `_meta.yml` plus the domain files you choose to write: `content.md`, `usage.md`, `design.md`, `behavior.md`, `tokens.yml` |
| `src/categories/` | authored | 7 category files carrying the defaults a component inherits, including the transversal refs |
| `dist/guidelines/` | derived | 61 per-component documents plus a bundle. 54 have authored source; the other 7 are registry slugs that resolve entirely to inherited guidance |
| `dist/registries/` | synced | 3 registries: `dskit.json`, `fmkit.json`, `metakit.json` |
| `dist/anatomy/` | synced | 179 per-component geometry trees |
| `dist/media/` | synced | 198 slugs' captures: a `preview.webp` from the component's Preview frame, and a `default.webp` of the default variant in isolation |
| `dist/icons/`, `dist/graphics/` | synced | 146 icons, plus color-preserving artwork, each with a `.degraded.json` sibling recording what could not be captured |
| `render/` | authored, derived | The canonical render tier: hand-authored `renderer/`, generated `dist/`, and its schema. Chapter 05 |

## The domain registry

`domains.json` is the piece most people miss, and it is the fastest way to
understand any domain you have not seen before. For each of its 12 domains it
declares the source glob, the generator that reads it, the frontmatter schema that
validates it, whether the markdown body is parsed or mirrored verbatim, and the
shape of what comes out.

It is hand-authored, governed by `schemas/domains.json`, and checked by
`scripts/validate/validate-domains.js`. When you add a domain, this is one of the
files that has to change, and chapter 09 lists the rest.

## What ships to consumers

A consumer vendors by inclusion, not exclusion, which means tooling is absent by
construction rather than by an exclude list somebody has to maintain.

`scripts/derive-vendor-include.js` computes the distributable surface as the unique
first path segment of every manifest `paths` and `collections` entry, unioned with
a fixed contract set: `paths-manifest.json`, `schemas`, `clients`, `llms.txt`,
`llms-full.txt`, `CONSUMING.md`, `ARCHITECTURE.md`, and `vendor-include.json`
itself. A drift test inside the required `validate-manifest` gate keeps the
committed file fresh.

Two consequences worth holding on to:

- **`ARCHITECTURE.md` and `CONSUMING.md` travel inside every vendor bundle.** They
  are consumer-facing contract, not contributor documentation, and they cannot be
  reduced to pointers at documents consumers never receive.
- **Adding a manifest entry under a new top-level directory changes what every
  consumer vendors.** It is an additive contract change, and chapter 09 covers it.

```
npm run derive:vendor-include && git diff --stat vendor-include.json
```

## The boundaries that are load-bearing

Four lines in this layout are doing real work, and moving any of them costs more
than it looks.

**`src` against `dist`.** It is the only reason a contributor can tell what is
editable without reading a file. Blurring it once, by putting a hand-edited block
inside a generated file, already produced the one exception above.

**The manifest against the tree.** Consumers address logical names, so the tree is
free to change. The moment a consumer hardcodes a path, that freedom is gone and
nothing will tell you until a reorganisation breaks them.

**The substrate against its consumers.** The Editor is in this repository and edits
this repository only. It never opens a pull request against a consumer. An
authoring tool that reaches from the substrate into a consumer blurs exactly the
line that keeps the substrate agnostic.

**Facts against interpretation.** This repository owns the facts and the canonical
drawing code. What a component means in a given screen, and which components a
screen should use, belong to the consumer. Chapter 05 is where that line is easiest
to cross by accident.
