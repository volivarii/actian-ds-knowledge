# Contributing to actian-ds-knowledge

The federated knowledge layer for the Actian Design System. It feeds the Actian DS
Claude plugin, the docs site, and any future surface, each taking a pinned
snapshot.

> **Authoring content?** Start at [`AUTHORING.md`](./AUTHORING.md).
> **Working on the machinery?** The full technical guide is
> [`docs/technical-guide/`](./docs/technical-guide/README.md).

## The rule that covers most of it

**Edit only inside a `src/` folder. Never change a version number.**

CI does the rest on your pull request: it regenerates the `dist/` files, bumps
`package.json#version` and `paths-manifest.json#knowledge_version` together, and
commits them back to your branch.

So: edit source, commit, open a pull request. If a check complains about the
version, you edited it by hand. Revert that and let CI bump it.

You need no local toolchain. The GitHub web UI and the Knowledge Editor both work.

## The `src/` and `dist/` convention

The folder name is the signal, so you can tell what is editable without opening a
file or reading its frontmatter.

```
foundations/
├── src/    <- edit here
└── dist/   <- CI-generated, do not edit
```

Anything in a `dist/` folder is rewritten on the next run, sometimes within
minutes. Generated files say so about themselves: JSON carries
`_meta.auto_generated`, markdown carries an auto-generated banner.

**One exception:** the `templates` block of
`components/dist/registries/metakit.json` is hand-curated and preserved across
syncs. Everything else in that file comes from Figma.

## Where to edit what

| To change | Edit |
| --- | --- |
| A foundation token, rule or scale | `foundations/src/<slug>.md`, ordered by `_order.json` |
| Per-component guidelines | `components/src/<slug>/`: `_meta.yml` plus `content.md`, `usage.md`, `design.md`, `behavior.md`, `tokens.yml` |
| Category defaults, shared by every component in a category | `components/src/categories/<slug>.md` |
| Global content guidance: voice, tone, words to avoid, UX-pattern topics | `content/src/{writing,patterns,product}/<slug>.md` |
| Accessibility guidance | `accessibility/src/<slug>.md`, ordered by `_order.json` |
| App context, personas, terminology | `app-context/src/{apps,entities,patterns}/<slug>.md` and `terminology.yml` |
| A token value | `foundations/src/color-primitives.md` (a palette base or the shade formula) or `foundations/src/tokens.md` (a semantic mapping). `tokens/tokens.json` and `tokens.css` are generated from them and edits there are overwritten |
| Canonical render styling or markup | `components/render/renderer/`: `ds-base.css` for styling, `html-renderers/ds-html-map.js` for markup |
| Component registry data: keys, variants, properties | **Not here.** Edit in Figma; the nightly sync brings it in |
| Component preview images | **Not here.** Edit the `Preview` frame in Figma and republish |

Which workflow regenerates what, and what each gate asserts, is in
[`docs/technical-guide/08-pipelines.md`](./docs/technical-guide/08-pipelines.md).
The render tier's two ratchets, and how to land a deliberate coverage loss, are in
[`docs/technical-guide/05-render-and-fidelity.md`](./docs/technical-guide/05-render-and-fidelity.md).

## Per-domain authoring guides

- [`foundations/src/AUTHORING.md`](foundations/src/AUTHORING.md)
- [`components/src/AUTHORING.md`](components/src/AUTHORING.md), the per-component layout and slug naming
- [`content/src/AUTHORING.md`](content/src/AUTHORING.md)

## Consumer indirection

Consumers reference logical names from [`paths-manifest.json`](paths-manifest.json),
never physical paths. When this repo restructures, only the manifest changes and
consumer code keeps working. Consumers pull by tag through a semver range, so
structural changes do not auto-propagate: a consumer bumps its range when it is
ready.

Details in [`CONSUMING.md`](CONSUMING.md) for the consumer side, and
[`docs/technical-guide/03-contract.md`](./docs/technical-guide/03-contract.md) for
the producer side.

## Changelog and docs, in the same pull request

On every **notable** change (a new capability, a schema or contract change, a
breaking sync, anything a consumer must know), update in the same pull request:

1. [`CHANGELOG.md`](CHANGELOG.md), under `## [Unreleased]`, following [Keep a Changelog](https://keepachangelog.com/), linking the pull request.
2. [`README.md`](README.md) if the change alters what it states.
3. Any other doc the change touches, including the technical guide.
4. A plain-language summary into `actian-ds-ecosystem`, per the standing ecosystem-sync rule.

Routine automated Figma-sync patch bumps are not listed individually.

Never hand-edit a version field. CI owns them.

## Governance

Every change runs through the eight principles and the pass/fail checklist in
[`GOVERNANCE.md`](GOVERNANCE.md). Additive changes pass freely. Removing, renaming
or retyping anything a consumer can observe is governed: a major bump, an
expand-contract migration, a deprecation window, and confirmed consumer awareness.

## Roles

- **Plugin lead**: orchestration, plugin maintenance, knowledge-repo CI, schemas
- **Design system lead**: foundations, component anatomy, design conventions
- **Content lead**: content guidelines, voice, UI copy

## License

UNLICENSED. Internal Actian use only.
