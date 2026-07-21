"use strict";

// Derives components/dist/graphics/graphics.json, the vendored color-preserving
// artwork read-surface, a sibling of components/dist/icons/icons.json for the
// artwork asset tier (brand illustrations, the pyramid mark, partner logos).
//
// Layers the hand-curated components/src/graphics-svg.json (may not exist yet;
// absent is treated as empty) OVER the auto-exported
// components/src/graphics-svg.auto.json (produced by
// scripts/graphics/export-graphics-svg.js), curated winning on a slug conflict.
// Mirrors scripts/icons/derive-icons-svg.js's layering + _meta stamping pattern.
//
// Unlike icons, this tier does not join a registry for provenance (group,
// dsKey, nodeId): slice-1 artwork nodes are addressed by an explicit
// artworkMap at export time, not swept from a registry category, so
// deriveGraphics stays a plain geometry pass-through.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const CURATED_SRC_REL = path.join("components", "src", "graphics-svg.json");

// Pure transform: srcMap (slug -> {viewBox, body}, already merged by the
// caller) -> { graphics, count }. Keys sorted for stable, idempotent output.
function deriveGraphics(srcMap) {
  srcMap = srcMap || {};
  const graphics = {};
  for (const slug of Object.keys(srcMap).sort()) {
    const geo = srcMap[slug] || {};
    graphics[slug] = { viewBox: geo.viewBox, body: geo.body };
  }
  return { graphics: graphics, count: Object.keys(graphics).length };
}

// Merge the auto-exported base with the curated override. Curated wins on a
// slug conflict (protects hand-fixed output from export regressions),
// mirroring mergeIconSources in derive-icons-svg.js.
function mergeGraphicsSources(auto, curated) {
  const a = (auto && auto.graphics) || {};
  const c = (curated && curated.graphics) || {};
  return Object.assign({}, a, c);
}

// Read auto (optional) + curated (optional, may not exist yet) from disk
// under `root`, merge, derive, write dist/graphics/graphics.json.
function deriveAndWrite(opts) {
  opts = opts || {};
  const root = opts.pluginDir || ROOT;
  const curatedPath = path.join(root, CURATED_SRC_REL);
  const autoPath = path.join(
    root,
    "components",
    "src",
    "graphics-svg.auto.json",
  );
  const curated = fs.existsSync(curatedPath)
    ? JSON.parse(fs.readFileSync(curatedPath, "utf8"))
    : null;
  const auto = fs.existsSync(autoPath)
    ? JSON.parse(fs.readFileSync(autoPath, "utf8"))
    : null;

  const merged = mergeGraphicsSources(auto, curated);
  const derived = deriveGraphics(merged);

  const dist = {
    _schema_version: 1,
    _meta: {
      auto_generated: true,
      source: "scripts/graphics/derive-graphics-svg.js",
      do_not_edit:
        "Edit components/src/graphics-svg.json; CI regenerates this file.",
    },
    graphics: derived.graphics,
  };

  const outDir = path.join(root, "components", "dist", "graphics");
  const outPath = path.join(outDir, "graphics.json");
  const serialized = JSON.stringify(dist, null, 2) + "\n";
  // Byte-gated: `wrote` lets a sync verdict distinguish a real graphics.json
  // change from an identical re-derive (no-op nights stay no-op).
  let wrote = false;
  if (
    !fs.existsSync(outPath) ||
    fs.readFileSync(outPath, "utf8") !== serialized
  ) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, serialized);
    wrote = true;
  }

  return { dist: dist, count: derived.count, wrote: wrote };
}

function runCli() {
  const r = deriveAndWrite({});
  console.log(
    (r.wrote ? "Wrote" : "Unchanged") +
      ` components/dist/graphics/graphics.json (${r.count} graphics)`,
  );
  return 0;
}

if (require.main === module) {
  process.exit(runCli());
}

module.exports = {
  deriveGraphics,
  mergeGraphicsSources,
  deriveAndWrite,
  runCli,
};
