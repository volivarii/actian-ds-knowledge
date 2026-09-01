# The contract

What consumers are allowed to depend on, the file that declares it, and the gate
that keeps it true.

*Counts read at knowledge v0.34.166 on 2026-09-01.*

The consumer-facing half of this is [`CONSUMING.md`](../../CONSUMING.md), which
ships inside every vendor bundle. This chapter is the producer's half: what the
contract is made of, what enforces it, and what breaks when you extend it
carelessly.

## `paths-manifest.json`

The one file a new reader should open first. It maps a **logical name** to a file,
and every consumer resolves through it rather than through the directory tree. That
indirection is principle P7, and it is what makes internal reorganisation a
non-event.

It carries 124 `paths` entries and 20 `collections`.

### A `paths` entry

```json
"accessibility.index": {
  "path": "accessibility/dist/a11y-index.json",
  "type": "json",
  "origin": "ci",
  "generator": "scripts/accessibility/derive-a11y-index.js",
  "description": "Slug to WCAG mapping for accessibility sections."
}
```

`path`, `type`, `origin` and `description` are required. `origin: ci` additionally
requires `generator`, so every derived artifact names the script that produces it.
That field is how you answer "where does this come from" without searching.

### A `collections` entry

A collection addresses a set of files rather than one:

```json
"appContextRecipes": {
  "dir": "app-context/dist/recipes",
  "pattern": "{slug}.json",
  "type": "json",
  "origin": "ci",
  "generator": "scripts/app-context/derive-app-context.js",
  "description": "Per-slug page recipe JSONs."
}
```

`dir`, `pattern`, `type`, `origin` and `description` are required.

### The two resolvable pattern shapes

`clients/resolve-paths.js` can turn a slug into a path for exactly two shapes:

| Pattern | Behaviour |
| --- | --- |
| contains `{slug}` | The resolver substitutes the slug |
| exactly `{name}` | The caller supplies the whole path relative to `dir` |

Anything else describes a layout for enumeration and **must** declare
`"resolvable": false`. This is not pedantry. An unresolvable pattern used to be
silent: the resolver returned a fabricated path or a null that read as "not found",
so a typo like `{slugs}.json` stayed dormant until some consumer happened to call
it. `components.render.renderer` stayed broken through three phases of the renderer
relocation that way.

The rule lives in one place. `isResolvablePattern` is exported from
`clients/resolve-paths.js` and imported by `scripts/validate-manifest.js`, so the
gate and the runtime can never disagree about what resolvable means. That
single-sourcing is itself an instance of "replace the list with the read".

### Leaf exclusive-or namespace

Every key in `paths` and `collections` is a leaf **or** a namespace, never both. A
key cannot resolve to a file and also be the prefix of nested children. To add a
sibling under an existing leaf, rename the leaf into a sub-key first:
`accessibility.guide` plus `accessibility.index`, not `accessibility` plus
`accessibility.index`.

Enforced by `tests/manifest-convention.test.js`. The reason is the resolver: it
dot-walks the names into a nested object, and a leaf that is also a namespace makes
that object impossible to build.

### `_zones`

Classifies each top-level key prefix as `knowledge`, `contract` or `metadata`, so a
consumer can filter by role. `_pendingEviction` lists prefixes that are
consumer-specific and are leaving; it is currently empty. A prefix that appears in
`paths` and in no zone fails the gate.

### The identity ledger

`components/dist/identity.json` maps a retired slug to the slug that now carries
it, and `clients/resolve-paths.js` reads it. A consumer still addressing a
component by the name it had before a Figma display-name change resolves through
the ledger instead of breaking. That is what stops a rename from being a
simultaneous migration across three repositories.

Two properties that matter:

- A slug that is **current** for some component is never treated as retired, even
  if a different component used to carry it. A name can be freed and reused, and
  the live component has to win.
- The ledger absorbs a rename only where something actually calls the slug. It is
  not a general-purpose alias table, and chapter 11 covers what it does not cover.

Both maps are built with a null prototype, so a slug colliding with an
`Object.prototype` name cannot resolve through the prototype.

### `registryAliases`

Seven entries mapping a Figma registry key to the guideline slug it is authored
under (`read-only-tag` to `tag`, `card-for-perimeter` to `card`, and so on). It
exists because authoring slugs and Figma component keys evolved separately.

It is explicitly **interim**, hand-maintained, and the long-term fix named in the
manifest's own notes is naming convergence rather than a growing map. Treat every
addition to it as debt you are choosing.

## Schemas

33 JSON Schemas in `schemas/`, validated in CI by Ajv with inline annotations on
the pull request's Files Changed view.

Every property carries `description` and `examples`, so an IDE configured for JSON
Schema gives autocomplete and hover documentation. That is opt-in and nothing
depends on it.

**What is deliberately unschematized.** The one-shot roll-ups (`*.bundle.json`) and
`foundations-index.json` have no dedicated schema, because they are composed from
per-item shapes that are already validated. A schema gets added when a consumer
starts reading one programmatically, not before. Per-item dist is schema-validated:
sections, guidelines, words-to-avoid, the a11y index.

## `llms.txt` and `llms-full.txt`

The content index for AI surfaces, derived from `foundations/src/**`,
`accessibility/src/**` and `content/dist/global.md`. Both ship to consumers.

A stale index is not cosmetic. It is the first thing an AI consumer reads in order
to find anything else, so a retired heading left in it reintroduces the
ghost-reference problem at the release layer. The freshness assertion lives in the
required gate rather than in `npm test`, because the workflow that regenerates it
fires mid-cascade when another domain's dist can still be stale.

## Versioning

Semver, in two files that move in lockstep:

| File | Field |
| --- | --- |
| `package.json` | `version` |
| `paths-manifest.json` | `knowledge_version` |

`knowledge_version` is **derived**, stamped from `package.json` by
`scripts/lib/sync-knowledge-version.js` (`npm run sync:version`). Never hand-edit
either. The required gate stamps and auto-commits the corrected value before it
validates anything, so a pull request cannot land with the two out of sync.

| Bump | Means |
| --- | --- |
| **Patch** | Figma sync data and CI-derived artifacts: registries, guidelines, media |
| **Minor** | Additive contract change: a new manifest entry, a new sidecar, a new sync phase |
| **Major** | Breaking manifest contract: path renames, schema shape changes |

Consumers pin a semver range in their `vendored.json` and resolve it against the
git tags that `tag-on-merge.yml` creates. The chain from a bump to a consumer, and
the ways it silently breaks, are chapter 08.

## What the required gate actually asserts

`validate-manifest.yml`, the check named **Validate manifest schema + coverage**,
is the one required gate. It runs on every pull request with no `paths:` filter, on
purpose: a required check with a path filter leaves unrelated pull requests
permanently pending.

In order:

1. **Stamp** `knowledge_version` from `package.json`, and auto-commit the drift back to the branch before anything is validated.
2. **`scripts/validate-manifest.js`**: entry schema, every path resolves to a file that exists, no orphan files (a file under a covered domain that no entry claims), no name conflicts between `paths` and `collections`, every pattern resolvable or explicitly opted out, every prefix classified in `_zones`.
3. **Seven re-derive-and-compare drift guards**: graph, foundations, app-context (including its manifest entries), accessibility, the llms index, the identity ledger, and `tokens/token-reference.md`. Each regenerates and fails if the committed artifact differs.
4. **`npm test`**, the full suite.
5. **A report-only tag-gap notice**: if the pull request changes vendorable content without a version bump, it says so in the job summary. It never fails the check.

Three details of those guards are load-bearing, and each is there because the
absence of it shipped a false green:

- They use `git status --porcelain --untracked-files=all`, not `git diff`. **`git diff` reports nothing for a file git does not yet track**, so a brand-new derived leaf is invisible to it. On a fork pull request the derive workflow's commit step is skipped, so the new leaf stays untracked, and a `git diff` guard reports clean while the leaf is absent from the merge.
- They capture the command's output into a variable and check git's own exit status, rather than testing `[ -n "$(git ...)" ]` inline. The inline form sees only stdout: if git itself fails, it prints nothing, the test is false, the guard body is skipped, and the step exits 0. That is a silent green on a required check.
- The app-context guard takes `paths-manifest.json` in its pathspec as well as the dist, because that derive writes both. Guarding only the dist lets a committed broken manifest pass, because the derive silently repairs it in the workspace.

## What consumers may depend on

State it plainly, because Hyrum's Law says that with enough consumers every
observable behaviour becomes a commitment whether you meant it or not.

| Depend on | Do not depend on |
| --- | --- |
| Logical names in `paths-manifest.json` | Physical file paths |
| Fields documented in `schemas/` | Field ordering |
| Slugs and anchors declared in source | Slugs derived from heading text |
| `knowledge_version` and the tag it corresponds to | A branch |
| The `{ref, note}` cross-reference shape | The internal directory layout |

And the obligation that comes back the other way: read only the fields you need,
ignore unknown fields rather than failing, use defaults for absent optional fields,
and own a version floor guard. The docs site's `MIN_SUPPORTED_KNOWLEDGE` is the
pattern to copy.

## Extending the contract

Adding an entry is additive and safe. Two things to get right, both covered
step by step in chapter 09:

- **A new top-level directory in the manifest changes what every consumer vendors**, because `vendor-include.json` is computed from manifest path prefixes. Regenerate it in the same pull request.
- **A new directory that ships as source and has no derive gets no version bump**, so it never tags and never reaches a consumer. `clients/` and `schemas/` are in that position, which is why `vendored-source-bump.yml` exists.
