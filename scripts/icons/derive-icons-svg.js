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

// Pure transform: (src, registry, iconGroups, opts?) -> dist object. Keys sorted
// for stable, idempotent output.
//
// Slug validity is still the gate, but how a violation is handled depends on the
// slug's provenance (opts.curatedSlugs — the set of slugs that came from the
// hand-curated icons-svg.json):
//   - A CURATED-only slug whose Figma component was renamed / removed /
//     recategorized is a dangling override, not a pipeline bug. WARN + SKIP it
//     (drop from output) so one stale icon can't fail the whole multi-domain
//     sync. The fix is to remove it from components/src/icons-svg.json.
//   - Any other invalid slug (auto-exported, i.e. registry-derived) is a genuine
//     inconsistency → THROW, loud as before.
// Without opts.curatedSlugs, every invalid slug throws (back-compat for the bare
// deriveIcons(src, registry, iconGroups) call).
function deriveIcons(src, registry, iconGroups, opts) {
  opts = opts || {};
  const logger = opts.logger || console;
  const curatedSlugs = opts.curatedSlugs || null;
  const comps = registry.components || {};
  const out = {
    _schema_version: 1,
    _meta: { auto_generated: true, source: "components/src/icons-svg.json" },
    icons: {},
  };
  for (const slug of Object.keys(src.icons).sort()) {
    const geo = src.icons[slug];
    const reg = comps[slug];
    const problem = !reg
      ? "not found in dskit registry"
      : reg.category !== "Icons"
        ? `is category "${reg.category}", expected "Icons"`
        : null;
    if (problem) {
      if (curatedSlugs && curatedSlugs.has(slug)) {
        logger.warn(
          `icons-svg: skipping dangling curated slug "${slug}" — ${problem}. ` +
            `Its Figma component was likely renamed/removed; remove it from components/src/icons-svg.json.`,
        );
        continue;
      }
      throw new Error(`icons-svg: slug "${slug}" ${problem}`);
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
  // Curated slugs drive the resilience guard: a dangling override (Figma
  // renamed/removed the component) warns + skips instead of failing the sync.
  const curatedSlugs = new Set(Object.keys((curated && curated.icons) || {}));
  const dist = deriveIcons(merged, registry, iconGroups, {
    curatedSlugs: curatedSlugs,
    logger: opts.logger || console,
  });
  const outDir = path.join(root, "components", "dist", "icons");
  const out = path.join(outDir, "icons.json");
  const serialized = JSON.stringify(dist, null, 2) + "\n";
  // Byte-gated: `wrote` lets the sync verdict distinguish a real icons.json
  // change from an identical re-derive (no-op nights must stay no-op).
  let wrote = false;
  if (!fs.existsSync(out) || fs.readFileSync(out, "utf8") !== serialized) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(out, serialized);
    wrote = true;
  }
  return { dist, wrote };
}

function runCli() {
  const r = deriveAndWrite({});
  console.log(
    (r.wrote ? "Wrote" : "Unchanged") +
      ` components/dist/icons/icons.json (${Object.keys(r.dist.icons).length} icons)`,
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
