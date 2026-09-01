# How to author

Task recipes for changing what the substrate says. Every one of these assumes the
golden rule: **edit only inside a `src/` folder, and never touch a version field.**
CI regenerates the dist, bumps both version fields, and commits the result back to
your branch.

If a check complains about the version, you almost certainly edited it by hand.
Revert that and let CI do it.

## Write guidance for a component

1. Find or create `components/src/<slug>/`.
2. Write `_meta.yml`. Only `component` and `domains` are required:

```yaml
component: Button
category: action
domains:
  content:  { status: approved }
  usage:    { status: draft }
  design:   { status: inherited }
  behavior: { status: inherited }
  tokens:   { status: not-started }
```

3. Add a file per domain you are authoring: `content.md`, `usage.md`, `design.md`, `behavior.md`, `tokens.yml`. Every one is optional.
4. Open a pull request. `guidelines-derive.yml` regenerates `components/dist/guidelines/<slug>.json`, the bundle and `coverage.md`, then commits them back.

**The status and the file must agree.** `approved` and `draft` require the file to
exist; `inherited` and `not-started` require it to be absent. A domain omitted from
`domains` is omitted from the derived object entirely.

Optional fields worth using: `section` (the Figma section), `related` (slugs, for
"see also"), `examples` (labelled `figmaNode` references), `lastReviewed`.

## Add a cross-domain reference

Use the transversal shape, never a quoted name:

```yaml
a11y_refs:
  - { ref: focus-keyboard, note: "must be operable with Enter and Space" }
  - { ref: color-contrast }
motion_refs:
  - { ref: state-transitions, note: "stays within the 100-200ms band" }
foundations_refs:
  - { ref: tokens }
```

The slug must exist in the target taxonomy's dist, and the derive fails fast if it
does not. Put the ref on the **category** when it applies to everything in that
category: one edit then covers every component in it.

Slugs survive renames; display names do not. That is principle P6, and it is the
whole reason for the `{ref, note}` shape.

## Edit a foundation or an accessibility section

Both are per-section markdown ordered by a sibling `_order.json`.

1. Edit or add `foundations/src/<slug>.md` or `accessibility/src/<slug>.md`.
2. If you added a file, add its slug to `_order.json`. A section not listed there falls back to alphabetical, which is almost never what you want.
3. In accessibility, give every heading a stable `{#slug}` anchor. **Never let an anchor be derived from the heading text.** An editorial rename would then silently break every consumer that references it.

## Edit content guidance

| Bucket | Goes to |
| --- | --- |
| `content/src/writing/` | Concatenated verbatim into `content/dist/global.md` |
| `content/src/product/` | Same |
| `content/src/patterns/` | Parsed into sections and **fanned out into component guideline records** |

The third one surprises people: editing a content pattern changes files under
`components/dist/`, because `fanout-patterns.js` appends its sections into the
component records that reference it.

## Markdown rules that apply everywhere

These exist because of the Editor's rich-text round-trip, and they are enforced by
a fail-closed drift guard.

- **No empty table cells.** An empty cell round-trips to `<br />` and the guard rejects it. Use an explicit no-entry marker.
- **No Jekyll or Kramdown attribute lists** such as `{: .do-dont-table}`. They are a docs-renderer concern, which principle P1 keeps out of source, and they corrupt the round-trip.
- **Wrap literal values in backticks.** Identifiers, filenames, URLs, emails, placeholders. Left bare they get escaped or autolinked on the round-trip: it renders identically and differs byte for byte, which trips the strict guard.
- **Do not name a new content field with a leading underscore.** That prefix is reserved for system-managed fields such as `_schema_version` and `_meta`.

## Add a manifest entry

Additive and safe, but four things have to move together.

1. Add the entry to `paths-manifest.json`. `path`, `type`, `origin` and `description` are required; `origin: ci` also requires `generator`.
2. Keep the key **leaf exclusive-or namespace**. A key cannot resolve to a file and also be the prefix of nested children. To add a sibling under an existing leaf, rename the leaf into a sub-key first.
3. If it is a collection, make the pattern resolvable (containing `{slug}`, or exactly `{name}`) or declare `"resolvable": false`. Anything else fails the gate, which is the point: an unresolvable pattern used to fail silently at a consumer months later.
4. If the entry introduces a **new top-level directory**, regenerate the vendor surface in the same pull request:

```
npm run derive:vendor-include
```

That changes what every consumer vendors. It is an additive contract change, so it
is a minor bump rather than a patch.

Then check your work the way CI will:

```
npm run validate:manifest
```

It fails on a path that does not resolve, on an orphan file that no entry claims,
on a name collision between `paths` and `collections`, and on a prefix missing from
`_zones`.

## Add a whole domain

Rare, and it touches more than you expect:

1. The source directory, with a `src/` and `dist/` split.
2. A generator in `scripts/<domain>/`.
3. A unit in `domains.json`: `src`, `generator`, `frontmatterSchema`, `body`, `distShape`. Checked by `scripts/validate/validate-domains.js`.
4. A schema in `schemas/`.
5. Manifest entries, and `_zones` classification for the new prefix.
6. A derive workflow, with a `paths:` filter covering **everything that can change its output**, not just its own directory.
7. `vendor-include.json`, regenerated.
8. `CONTRIBUTING.md`, `llms.txt`, and the README content table.
9. A CHANGELOG entry.

If the domain ships to consumers as **source** and has no derive, it also needs a
bump trigger, or nothing about it will ever reach a consumer. That is what
`vendored-source-bump.yml` does for `clients/`, `schemas/` and the renderer.

## Land a breaking change

Removing, renaming or retyping anything a consumer can observe is governed, not
merged. Principle P5 requires four things:

1. **A semver major bump.**
2. **Expand and contract.** Add the new shape alongside the old one and ship that first. Do not delete the old path in the same change that introduces the new one.
3. **A deprecation window.** Long enough that a consumer can move on its own schedule.
4. **Confirmed consumer awareness** before the removal, not after.

Two failure modes to avoid by name:

- **Do not accept a plan as evidence.** One migration shipped a new path, deleted the fallback in the same pull request, and declared acceptance from the plan rather than from a run. The new path was never exercised and the fallback was gone.
- **Do not assume absence means retirement.** A slug missing from a registry is a rename, an unpublish, or a retirement, and the correct response to each is different. Read the producer's commit with `git log -S<slug>` before deciding.

## Check your work before you push

```
npm run validate:manifest    # schema, resolution, orphans, zones
npm test                     # the full suite
npm run derive:graph && npm run validate:graph
```

**`validate:manifest` fails on a clean local checkout.** It walks the filesystem,
and `tokens/src/figma-export/` is a gitignored local-only directory that CI's fresh
clone never sees. Check that every orphan error is under that path, then ignore
them:

```
npm run validate:manifest 2>&1 | grep "orphan file" | grep -v "tokens/src/figma-export"
```

And if you are changing anything the required gate re-derives, run the derive and
confirm a clean tree the way CI does, with `git status` rather than `git diff`:

```
npm run derive:foundations && git status --porcelain --untracked-files=all -- foundations/dist
```

`git diff` reports nothing for a file git does not yet track, so a newly added
derived leaf is invisible to it. Chapter 11.

## Changelog and docs, in the same pull request

On any **notable** change (a new capability, a schema or contract change, a
breaking sync, anything a consumer must know), update in the same pull request:

1. `CHANGELOG.md`, under `## [Unreleased]`, linking the pull request.
2. `README.md` if the change alters what it states.
3. Any other doc the change touches, including this guide.
4. A plain-language summary into `actian-ds-ecosystem`, per the standing ecosystem-sync rule.

Routine automated sync patch bumps are not listed individually.
