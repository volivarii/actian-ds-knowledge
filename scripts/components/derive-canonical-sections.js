"use strict";

// derive-canonical-sections — wraps the hand-authored design-section canon
// (components/src/canonical-sections.json) into the consumer-facing dist
// artifact (components/dist/canonical-sections.json) with provenance _meta,
// and registers the manifest key. The dist is what the editor + docs read.
//
// Idempotent: byte-stable output (sorted via JSON.stringify of a fixed shape,
// no timestamps). Manifest written via manifest-io for canonical key order.

const fs = require("node:fs");
const path = require("node:path");
const { writeManifest } = require("../lib/manifest-io");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(REPO_ROOT, "components", "src", "canonical-sections.json");
const DIST = path.join(REPO_ROOT, "components", "dist", "canonical-sections.json");
const MANIFEST = path.join(REPO_ROOT, "paths-manifest.json");

// Pure: src object → dist object. No I/O. Tested directly for freshness.
function buildCanonicalSections(src) {
  return {
    _schema_version: 1,
    _meta: {
      auto_generated: true,
      source: "components/src/canonical-sections.json",
      do_not_edit:
        "Edit the src JSON, then run `npm run derive:canonical-sections`. CI validates.",
    },
    design: src.design,
  };
}

function serialize(obj) {
  return JSON.stringify(obj, null, 2) + "\n";
}

function writeCanonicalSections(repoRoot) {
  const srcPath = path.join(repoRoot, "components", "src", "canonical-sections.json");
  const distPath = path.join(repoRoot, "components", "dist", "canonical-sections.json");
  const manifestPath = path.join(repoRoot, "paths-manifest.json");

  const src = JSON.parse(fs.readFileSync(srcPath, "utf8"));
  const next = serialize(buildCanonicalSections(src));
  const current = fs.existsSync(distPath) ? fs.readFileSync(distPath, "utf8") : "";
  let wrote = false;
  if (next !== current) {
    fs.mkdirSync(path.dirname(distPath), { recursive: true });
    fs.writeFileSync(distPath, next, "utf8");
    wrote = true;
  }

  // Register the manifest entry (idempotent; writeManifest canonicalizes order).
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.paths["components.canonicalSections"] = {
    path: "components/dist/canonical-sections.json",
    type: "json",
    origin: "ci",
    generator: "scripts/components/derive-canonical-sections.js",
    description:
      "Canonical design-guideline section list (heading, stable anchor, aliases, media role) — single source for the editor stub scaffolder and the docs design-section renderer.",
  };
  writeManifest(manifestPath, manifest);

  return { wrote };
}

if (require.main === module) {
  const { wrote } = writeCanonicalSections(REPO_ROOT);
  console.log(
    `canonical-sections: ${wrote ? "wrote" : "unchanged"} ${path.relative(REPO_ROOT, DIST)}`,
  );
}

module.exports = { buildCanonicalSections, writeCanonicalSections, serialize, SRC, DIST, MANIFEST };
