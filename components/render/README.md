# `components/render/`: the canonical render + the Claude Design bundle

`renderer/` is the fact-driven renderer itself (see `renderer/README.md`). This file
documents the other half: `scripts/render/build-bundle.js`, which projects the derived
gallery into a directory of self-contained `@dsCard` HTML files ready to push to a
[Claude Design](https://claude.ai/design) project via the `DesignSync` tool.

## Building the bundle

```
node scripts/render/build-bundle.js --out <dir>
```

Writes one self-contained HTML file per rendered component (grouped by DS category,
e.g. `Action/button.html`), plus three foundations cards (`Colors/palette.html`,
`Type/type.html`, `Spacing/spacing.html`). Output is gitignored
(`components/render/dist/bundle/`); build on demand, not committed.

## The `.prompt.md` sibling: usage notes reach Claude Design's own generation, not just a human reader

Every card that has a guideline doc also gets a `<slug>.prompt.md` file written next to
`<slug>.html` (e.g. `Action/button.prompt.md`), as raw markdown. Content comes from
`scripts/render/derive-usage-notes.js`, which is already fed by the real guideline
domains (`components/dist/guidelines/<slug>.json`); nothing new to author. This is the
only place the note ships: the card's own HTML is a clean component render with no
usage prose baked into the body. An earlier version of this pipeline also embedded the
note as a visible `<section class="ds-usage">` inside the card; that was removed because
it duplicated what Claude Design's own "Add usage notes" panel already surfaces to a
human, and cluttered what should be a clean preview of the component.

This was confirmed empirically, not from Claude Design documentation (none is public):
the dogfood project already had two hand-pasted `.prompt.md` files (`button`, `calendar`)
from an earlier session's manual use of Claude Design's "Add usage notes" UI affordance,
and their content matched this generator's own output shape. The delivery path is
therefore a normal `DesignSync write_files` call, same as the `.html` cards, with no
manual paste required. `derive-usage-notes.js`'s own header comment used to claim this
delivery was impossible; that was wrong and has been corrected in place.

Because the filename is `.prompt.md`, not `.notes.md` or `.readme.md`, treat this as
grounding for Claude Design's *own* AI-driven composition (steering it to use each
component per Actian's real "when to use" / "when not to use" / style rules), not only
documentation for a human browsing the project.

## Pushing to Claude Design

Via the `DesignSync` tool (`list_files` -> `finalize_plan` -> `write_files`),
incrementally: write only the paths that changed, never delete or overwrite
`templates/`, `_ds_manifest.json` (Claude Design compiles this itself from each card's
`@dsCard` marker), or `_adherence.oxlintrc.json` (a Claude-Design-managed adherence-lint
scaffold, currently empty; relevant once a real component/token registry exists to
populate it). The live reference instance is the "Actian Product Design System
(dogfood)" project.
