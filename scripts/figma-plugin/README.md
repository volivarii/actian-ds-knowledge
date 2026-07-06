# Zen Variable Id Export (P2 name layer)

A minimal, local-only Figma plugin that exports the map from this file's
local variable ids (`VariableID:*`, the same ids the REST `/nodes` payloads
carry in `boundVariables`) to their **stable library keys**. The nightly sync
joins those keys against `tokens/src/figma-bindings-raw.json` and the
published names in `tokens/tokens.css` to emit `var(--zen-*, <value>)`
render facts — key-based end to end, no name matching.

## Run it (once, and after new variables get used in the kit)

1. In the Figma **desktop** app, open the dskit file.
2. Menu → Plugins → Development → **Import plugin from manifest…** and pick
   `scripts/figma-plugin/manifest.json` from a local checkout of this repo.
3. Run **Zen Variable Id Export**. It walks all pages (takes a few seconds),
   then shows the JSON.
4. **Copy**, paste over `tokens/src/figma-variable-ids.json`, commit via the
   normal PR flow.

## Staleness model

The export is tolerant by design: ids are stable per file, so the file only
needs re-running when NEW variables start being used (a binding whose id is
missing from the export simply captures value-only, never a wrong name).
Deleting a variable in Figma likewise degrades that binding to value-only on
the next sync — nothing breaks.
