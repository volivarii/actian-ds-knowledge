# Authoring guide

How to change what the Actian Design System says. Written for the person writing
the guidance, not for the person maintaining the machinery.

> **No local setup needed.** Edit through the [Knowledge Editor](https://volivarii.github.io/actian-ds-knowledge/editor/)
> or the GitHub web UI. CI validates, regenerates and versions everything for you.

## The one rule

**Edit only inside a `src/` folder, and never touch a version number.**

A `dist/` folder is built by a machine and rewritten on the next run, so an edit
there disappears. The folder name is the only signal you need.

## What you can author, and where

| Domain | You edit |
| --- | --- |
| **Foundations**: color, type, spacing, motion, elevation, icons | `foundations/src/<slug>.md`, ordered by `_order.json` |
| **Components**: per-component guidance | `components/src/<slug>/`: `_meta.yml` plus `content.md`, `usage.md`, `design.md`, `behavior.md`, `tokens.yml` |
| **Category defaults**: shared by every component in a category | `components/src/categories/<slug>.md` |
| **Content**: voice, tone, words to avoid, UX-pattern topics | `content/src/{writing,patterns,product}/<slug>.md` |
| **Accessibility** | `accessibility/src/<slug>.md`, with stable `{#slug}` anchors |
| **App context**: products, entities, features, terminology | `app-context/src/{apps,entities,patterns}/<slug>.md` and `terminology.yml` |
| **Tokens** | `foundations/src/color-primitives.md` for a palette base or the shade formula, `foundations/src/tokens.md` for a semantic mapping. Everything in `tokens/` is generated from these |

**Not authored here:** component registry data (keys, variants, properties) and
preview images. Both come from Figma through the nightly sync. If a token or a
component's structure needs to change, that happens in Figma first.

Each domain has a deeper guide beside its source:
[`foundations/src/AUTHORING.md`](foundations/src/AUTHORING.md),
[`components/src/AUTHORING.md`](components/src/AUTHORING.md),
[`content/src/AUTHORING.md`](content/src/AUTHORING.md).

## Markdown conventions

These apply to every domain, because every body round-trips through the Editor's
rich-text mode and a strict guard rejects a lossy round-trip.

- **No empty table cells.** An empty cell round-trips to `<br />` and is rejected. Put an explicit no-entry marker in the cell.
- **No Jekyll or Kramdown attribute lists**, such as `{: .do-dont-table}`. Styling is the reading surface's job, not the source's.
- **Wrap literal values in backticks.** Identifiers, filenames, URLs, emails, placeholders. Left bare they get escaped or autolinked, which looks identical and differs byte for byte.
- **Do not start a new field name with an underscore.** That prefix is reserved for system-managed fields such as `_schema_version` and `_meta`.

## Cross-references

Point at other domains by **slug**, never by quoted name. Slugs survive a rename;
display names do not.

```yaml
a11y_refs:
  - { ref: focus-keyboard, note: "must be operable with Enter and Space" }
motion_refs:
  - { ref: state-transitions }
foundations_refs:
  - { ref: tokens }
```

The slug has to exist in the target domain, and the build fails immediately if it
does not. Put a reference on the **category** when it applies to everything in
that category: one edit then covers every component in it.

What each reference means, and how they assemble into the knowledge graph, is in
[`RELATIONS.md`](RELATIONS.md).

## Adding something new

- **A component's guidelines:** create `components/src/<slug>/_meta.yml` plus the domain files you want to write. Every domain file is optional. See [`components/src/AUTHORING.md`](components/src/AUTHORING.md).
- **A foundation section:** add the file under `foundations/src/` and add its slug to `_order.json`. A section missing from that file falls back to alphabetical order.
- **A category default:** edit `components/src/categories/<slug>.md`.
- **A whole new domain:** rare, and it touches nine other things. See [`docs/technical-guide/09-how-to-author.md`](./docs/technical-guide/09-how-to-author.md).

## What happens after you submit

Your edits become one pull request. Automated checks validate the change, the
derived files are regenerated and added to it, and once a reviewer merges it every
surface picks it up on its own schedule. Under a day on the automatic schedule,
about ten minutes if someone triggers it by hand.

Submitting is not publishing. The honest way to tell whether your change has
landed is to follow the pull request from open to merged.

## Roles

- **Design system lead**: foundations, component anatomy, design conventions
- **Content lead**: content guidelines, voice, UI copy
- **Plugin lead**: orchestration, CI, schemas, consumer integration

## Where to go next

| You want | Read |
| --- | --- |
| The connections between things | [`RELATIONS.md`](RELATIONS.md) |
| To contribute code or change the machinery | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| How any of it actually works | [`docs/technical-guide/`](./docs/technical-guide/README.md) |
| To build a surface that reads this | [`CONSUMING.md`](CONSUMING.md) |
| What may and may not change | [`GOVERNANCE.md`](GOVERNANCE.md) |
