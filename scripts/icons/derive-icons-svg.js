"use strict";

// Derives components/dist/icons/icons.json — the vendored icon-geometry
// read-surface — from the hand-curated components/src/icons-svg.json.
//
// The src holds geometry only ({viewBox, body}). This derive JOINS provenance
// by slug: dsKey + nodeId from the dskit registry (the single source for
// Figma keys), and the primary `group` from icon-groups.json. It FAILS loudly
// if a slug is absent from the registry or isn't category "Icons" — that is
// the slug-validity gate, enforced at derive time. Registry is SoT; the join
// is one-way, so geometry and keys can't drift apart.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const SRC = path.join(ROOT, "components", "src", "icons-svg.json");
const REGISTRY = path.join(
  ROOT,
  "components",
  "dist",
  "registries",
  "dskit.json",
);
const ICON_GROUPS = path.join(ROOT, "components", "src", "icon-groups.json");
const OUT_DIR = path.join(ROOT, "components", "dist", "icons");
const OUT = path.join(OUT_DIR, "icons.json");

// First key-order group in icon-groups.json whose array contains the slug.
// Key order is specific-first (e.g. Cursor before Common); meta keys (_*) skipped.
function primaryGroup(iconGroups, slug) {
  for (const key of Object.keys(iconGroups)) {
    if (key.startsWith("_")) continue;
    const arr = iconGroups[key];
    if (Array.isArray(arr) && arr.includes(slug)) return key;
  }
  return null;
}

// Pure transform: (src, registry, iconGroups) -> dist object. Keys sorted for
// stable, idempotent output. Throws on an invalid slug.
function deriveIcons(src, registry, iconGroups) {
  const comps = registry.components || {};
  const out = {
    _schema_version: 1,
    _meta: { auto_generated: true, source: "components/src/icons-svg.json" },
    icons: {},
  };
  for (const slug of Object.keys(src.icons).sort()) {
    const geo = src.icons[slug];
    const reg = comps[slug];
    if (!reg) {
      throw new Error(`icons-svg: slug "${slug}" not found in dskit registry`);
    }
    if (reg.category !== "Icons") {
      throw new Error(
        `icons-svg: slug "${slug}" is category "${reg.category}", expected "Icons"`,
      );
    }
    out.icons[slug] = {
      viewBox: geo.viewBox,
      body: geo.body,
      group: primaryGroup(iconGroups, slug),
      dsKey: reg.key,
      nodeId: reg.nodeId,
    };
  }
  return out;
}

// Merge the auto-exported base with the curated override. Curated wins on a
// slug conflict (protects hand-fixed output from export regressions).
function mergeIconSources(auto, curated) {
  const a = (auto && auto.icons) || {};
  const c = (curated && curated.icons) || {};
  return { _schema_version: 1, icons: Object.assign({}, a, c) };
}

// Read auto (optional) + curated from disk under `root`, merge, derive, write
// dist/icons/icons.json. Shared by the CLI and the sync `icons` phase.
function deriveAndWrite(opts) {
  opts = opts || {};
  const root = opts.pluginDir || ROOT;
  const curatedPath = path.join(root, "components", "src", "icons-svg.json");
  const autoPath = path.join(root, "components", "src", "icons-svg.auto.json");
  const curated = JSON.parse(fs.readFileSync(curatedPath, "utf8"));
  const auto = fs.existsSync(autoPath)
    ? JSON.parse(fs.readFileSync(autoPath, "utf8"))
    : null;
  const registry =
    opts.registry ||
    JSON.parse(
      fs.readFileSync(
        path.join(root, "components", "dist", "registries", "dskit.json"),
        "utf8",
      ),
    );
  const iconGroups =
    opts.iconGroups ||
    JSON.parse(
      fs.readFileSync(
        path.join(root, "components", "src", "icon-groups.json"),
        "utf8",
      ),
    );
  const merged = mergeIconSources(auto, curated);
  const dist = deriveIcons(merged, registry, iconGroups);
  const outDir = path.join(root, "components", "dist", "icons");
  const out = path.join(outDir, "icons.json");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(out, JSON.stringify(dist, null, 2) + "\n");
  return dist;
}

function runCli() {
  const dist = deriveAndWrite({});
  console.log(
    `Wrote components/dist/icons/icons.json (${Object.keys(dist.icons).length} icons)`,
  );
  return 0;
}

module.exports = {
  deriveIcons,
  mergeIconSources,
  deriveAndWrite,
  primaryGroup,
  runCli,
};
