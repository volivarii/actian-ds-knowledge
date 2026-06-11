// scripts/sync/sync-anatomy.js
"use strict";
var fs = require("node:fs");
var path = require("node:path");
var { buildAnatomyFile } = require("./normalize-anatomy");

// Resolve the Figma file key the SAME way syncRegistry does: opts.keys[kitId].
// Production .figma-keys.json maps kit id → file-key STRING (e.g. {dsKit: "abc"});
// tolerate an {fileKey} object shape too.
function fileKeyFor(keys, kit) {
  var v = (keys || {})[kit];
  if (v == null) return undefined;
  return typeof v === "string" ? v : v.fileKey || v;
}

function nodeIdToSlugMap(registry) {
  var map = {};
  var comps = (registry && registry.components) || {};
  Object.keys(comps).forEach(function (slug) {
    var nid = comps[slug] && comps[slug].nodeId;
    if (nid) map[nid] = slug;
  });
  return map;
}

// Icons are vector wrappers with no layout structure and live in the curated icon
// set — they don't belong in the anatomy (layout-structure) domain. (v2 quality)
function isIconComponent(comp) {
  return !!comp && comp.category === "Icons";
}

// A variant SET's registry nodeId points at the whole COMPONENT_SET grid. Normalize
// the DEFAULT variant instead — conventionally the first COMPONENT child (Figma
// orders the default top-left). Returns { node, variant } (variant = its name, or
// null when the input isn't a set). (v2 quality)
function pickDefaultVariant(doc) {
  if (!doc || doc.type !== "COMPONENT_SET" || !Array.isArray(doc.children)) {
    return { node: doc, variant: null };
  }
  var variants = doc.children.filter(function (c) {
    return c && c.type === "COMPONENT";
  });
  if (variants.length === 0) return { node: doc, variant: null };
  return { node: variants[0], variant: variants[0].name || null };
}

// Remove stale per-slug anatomy files before a fresh write so dropped components
// (e.g. icons under the v2 filter, or components removed from Figma) don't linger.
function cleanAnatomyDir(anatomyDir) {
  if (!fs.existsSync(anatomyDir)) return;
  fs.readdirSync(anatomyDir).forEach(function (f) {
    if (f.endsWith(".json")) {
      try {
        fs.unlinkSync(path.join(anatomyDir, f));
      } catch (e) {
        /* best-effort */
      }
    }
  });
}

async function varNameByIdFor(rest, fileKey) {
  if (!rest || typeof rest.getLocalVariables !== "function") return {};
  try {
    var resp = await rest.getLocalVariables(fileKey);
    var vars = (resp && resp.meta && resp.meta.variables) || {};
    var map = {};
    Object.keys(vars).forEach(function (id) {
      var v = vars[id];
      if (v && v.name)
        map[id] =
          "--" +
          String(v.name).replace(/\//g, "-").replace(/\s+/g, "-").toLowerCase();
    });
    return map;
  } catch (e) {
    return {};
  }
}

async function syncAnatomy(opts, kit) {
  var rest = opts.rest;
  var registriesDir = opts.registriesDir;
  var anatomyDir = opts.anatomyDir;
  var writeJson = opts.writeJson;
  var syncedAt = opts.syncedAt;
  var fileKey = fileKeyFor(opts.keys, kit);

  // Every sync phase must return { fileLabel, verdict:{category, changelog} } —
  // aggregateVerdict + buildChangelog read those. A new artifact class is "additive".
  function result(count, extra) {
    return Object.assign(
      {
        kind: "anatomy",
        kit: kit,
        count: count,
        fileLabel: "anatomy:" + kit,
        verdict: {
          category: "additive",
          changelog: "- Wrote " + count + " anatomy file(s).",
        },
      },
      extra || {},
    );
  }

  var regPath = path.join(registriesDir, "dskit.json");
  if (!fs.existsSync(regPath)) {
    return result(0, {
      skipped: "no registry",
      verdict: { category: "unchanged", changelog: "- skipped (no registry)." },
    });
  }
  var registry = JSON.parse(fs.readFileSync(regPath, "utf8"));
  // nodeIdToSlug stays FULL (all components, incl. icons) so nested icon instances
  // inside structural components can still resolve to their icon slug.
  var nodeIdToSlug = nodeIdToSlugMap(registry);
  var varNameById = await varNameByIdFor(rest, fileKey);

  var comps = registry.components || {};
  // v2 (B): skip icons — they have no layout anatomy.
  var slugs = Object.keys(comps).filter(function (s) {
    return !isIconComponent(comps[s]);
  });
  var ids = slugs
    .map(function (s) {
      return comps[s].nodeId;
    })
    .filter(Boolean);
  var resp = await rest.getNodes(fileKey, ids);
  var nodes = (resp && resp.nodes) || {};

  // Drop stale files (e.g. icon artifacts from a pre-v2 sync) before writing fresh.
  cleanAnatomyDir(anatomyDir);

  // Bundle is a slug→file MAP under a `components` envelope — keeps it off the top
  // level so writeJson's _schema_version injection never appears as a phantom slug.
  var bundle = { _schema_version: 1, components: {} };
  var count = 0;
  var failed = [];
  slugs.forEach(function (slug) {
    var nid = comps[slug].nodeId;
    var payload = nid && nodes[nid];
    var doc = payload && payload.document;
    if (!doc) return;
    // Isolate per-component failures — one malformed component must not abort the
    // whole anatomy phase (runWithGuard's catch is per-kit, not per-component).
    try {
      // v2 (A): for variant sets, normalize the default variant, not the grid.
      var picked = pickDefaultVariant(doc);
      var source = { fileKey: fileKey, nodeId: nid };
      if (picked.variant) source.variant = picked.variant;
      var file = buildAnatomyFile(picked.node, {
        slug: slug,
        kit: kit.toLowerCase(),
        syncedAt: syncedAt,
        source: source,
        nodeIdToSlug: nodeIdToSlug,
        varNameById: varNameById,
      });
      writeJson(path.join(anatomyDir, slug + ".json"), file);
      bundle.components[slug] = file;
      count++;
    } catch (e) {
      failed.push({ slug: slug, error: e.message });
    }
  });
  writeJson(path.join(anatomyDir, "..", "anatomy.bundle.json"), bundle);
  return result(count, failed.length ? { failed: failed } : undefined);
}

module.exports = {
  syncAnatomy,
  nodeIdToSlugMap,
  fileKeyFor,
  isIconComponent,
  pickDefaultVariant,
};
