# clients/ — the substrate's reference reader

Single source of truth for the *generic* consumption mechanics, so consumers
don't re-implement them (and drift). Travels into every consumer's `vendor/`
via `vendor-include.json`. See [`../CONSUMING.md`](../CONSUMING.md).

- **`resolve-paths.js`** — `buildPaths(vendorRoot)` → the dot-walked `PATHS`
  object from `<vendorRoot>/paths-manifest.json` (leaves = file paths,
  collections = `(slug)=>path` functions). **Adopt by IMPORTING the vendored
  copy** (`require('<vendor>/clients/resolve-paths.js').buildPaths(VENDOR)`) and
  layering your own overlays on the result. Single source, refreshed every
  vendor pull → zero drift. Safe to import-from-vendor (read-only runtime code).

- **`vendor-snapshot.js`** *(coming — Phase 1b)* — `runSnapshot(config)`
  (range-resolve → fetch tarball → include-select → copy → write
  `vendored.json`). **Adopt by COPYING this core** into your repo (a build tool
  must not depend on the bundle it produces, and it bootstraps an empty
  `vendor/`); keep a drift-guard test comparing your copy to the vendored
  canonical.

Promotes to a published npm package when the repo moves to the Actian org / OSS.
