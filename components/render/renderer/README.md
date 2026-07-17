# components/render/renderer/

The relocated **styling source of truth** for the canonical render. Knowledge owns
these assets; the shared `render.css` in `components/render/dist/` is DERIVED from
them (see `scripts/render/derive-canonical.js`), not hand-written and not a snapshot
baked into the frozen seeds.

- `ds-base.css`: the leaf component styling (the `.ds-*` rules, `--zen-*` token surface).
- `ds-fonts.css`: the offline font embeds.

`render.css` is built as `tokens/tokens.css` + `ds-fonts.css` + `ds-base.css`, in that
order (the same order the render read path uses). The derive keeps a loud byte-identity
cross-check against the deduped seed stylesheet: if these assets ever drift from the
frozen seeds, the derive fails rather than shipping a mismatch.

Do **not** edit the generated `components/render/dist/`. Edit the source here.

This is the first step of the renderer-relocation program (phase 0): knowledge owns the
styling source. Later phases move the renderer JS in and have the plugin vendor it back.
