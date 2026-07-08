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
// mode (opts.curatedSlugs, passed by the sync):
//   - RESILIENCE MODE (curatedSlugs provided, i.e. the sync path): ANY invalid
//     slug is a Figma-side change (rename / removal / recategorization), not a
//     pipeline bug. WARN + SKIP it (drop from output) so one stale icon can't fail
//     the whole multi-domain sync. Covers a dangling curated override AND an
//     auto-exported slug the registry no longer categorizes as Icons; the warning
//     distinguishes the two so the operator knows where to look.
//   - STRICT MODE (no opts.curatedSlugs, the bare deriveIcons(src, registry,
//     iconGroups) call): every invalid slug THROWS, loud, so direct callers/tests
//     get strict validation.
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
      // Resilience mode (the sync passes curatedSlugs): an invalid slug is a
      // Figma-side change (rename / removal / recategorization), not a pipeline
      // bug, so WARN + SKIP it (drop from output) rather than fail the whole
      // multi-domain sync. This holds for BOTH a dangling curated override and an
      // auto-exported slug the registry no longer categorizes as Icons: one stray
      // icon must never block unrelated anatomy/registry/token changes. The bare
      // 3-arg call (no curatedSlugs) has no resilience mode and still throws, so
      // direct callers/tests get loud validation.
      if (curatedSlugs) {
        const curatedFix = curatedSlugs.has(slug)
          ? `Its Figma component was likely renamed/removed; remove it from components/src/icons-svg.json.`
          : `Its Figma component was likely renamed/removed/recategorized; it returns automatically once Figma is corrected.`;
        logger.warn(
          `icons-svg: skipping slug "${slug}": ${problem}. ` + curatedFix,
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
  // Aggregate resilience bound: per-slug warn-skip absorbs a FEW stray icons
  // (a rename / recategorization), but the whole library collapsing is a
  // systemic Figma-side break, not a point failure. Refuse to emit a
  // near-empty icons.json so a mass loss fails the sync loud (throw -> the
  // icons phase records an error -> exit 2, no PR). Resilience mode only; the
  // absolute floor keeps the tiny all-dangling cases (single/2-icon) resilient.
  if (curatedSlugs) {
    const total = Object.keys(src.icons).length;
    const emitted = Object.keys(out.icons).length;
    const skipped = total - emitted;
    if (skipped >= 10 && emitted <= total * 0.5) {
      throw new Error(
        `icons-svg: mass category-loss - ${skipped}/${total} icons skipped ` +
          `(only ${emitted} valid). Refusing to emit a near-empty icons.json; a Figma ` +
          `page rename likely stripped category "Icons". Fix the icon page category ` +
          `(components/src/category-page-overrides.json) and re-sync.`,
      );
    }
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
