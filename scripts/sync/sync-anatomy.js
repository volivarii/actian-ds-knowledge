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

// Mirror of nodeIdToSlugMap on the stable Figma component `key`. A `key` is
// constant across the differing node ids Figma assigns the same published
// component, so this map bridges the registry-node vs instance-node mismatch
// that node-id matching cannot survive. 1:1 over the registry (all components
// carry a unique non-empty key).
function keyToSlugMap(registry) {
  var map = {};
  var comps = (registry && registry.components) || {};
  Object.keys(comps).forEach(function (slug) {
    var k = comps[slug] && comps[slug].key;
    if (k) map[k] = slug;
  });
  return map;
}

// Figma's getNodes response carries a `components` dict per fetched subtree
// (componentId → { key, name, … }) describing every component referenced
// inside it. Merge those dicts across all fetched set payloads into one
// componentId → key map. Pure; no extra API call — the dict rides along in
// the getNodes response already issued for pickDefaultVariant.
function mergeComponentIdToKey(nodes) {
  var map = {};
  Object.keys(nodes || {}).forEach(function (id) {
    var comps = nodes[id] && nodes[id].components;
    if (!comps) return;
    Object.keys(comps).forEach(function (cid) {
      var k = comps[cid] && comps[cid].key;
      if (k) map[cid] = k;
    });
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

// Prune stale per-slug anatomy files AFTER a successful write — delete only `.json`
// files NOT in the freshly-written set (dropped icons, components removed from
// Figma). Runs after writing (never wipe-then-write) and only when called with a
// non-empty kept-set, so a transient empty Figma response can't silently delete all
// anatomy data. `.gitkeep` is preserved (not `.json`); the bundle lives one dir up.
function pruneStaleAnatomy(anatomyDir, keptSlugs) {
  if (!keptSlugs.length || !fs.existsSync(anatomyDir)) return;
  var keep = {};
  keptSlugs.forEach(function (s) {
    keep[s + ".json"] = true;
  });
  var entries;
  try {
    entries = fs.readdirSync(anatomyDir);
  } catch (e) {
    return; // unreadable dir — leave it alone rather than throw
  }
  entries.forEach(function (f) {
    if (f.endsWith(".json") && !keep[f]) {
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
  // Key map (registry-wide) for the instance key fallback — see keyToSlugMap.
  var keyToSlug = keyToSlugMap(registry);
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
  // componentId -> key for every component referenced in the fetched subtrees;
  // feeds the normalizer's key fallback. Rides along in the getNodes response.
  var componentIdToKey = mergeComponentIdToKey(nodes);

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
      // v3: for a COMPONENT_SET, carry its COMPONENT siblings through so
      // buildAnatomyFile can isolate + capture per-variant appearance deltas.
      // No extra API call: doc.children already rode along in the getNodes
      // response fetched above for pickDefaultVariant.
      var variants =
        doc.type === "COMPONENT_SET" && Array.isArray(doc.children)
          ? doc.children.filter(function (c) {
              return c && c.type === "COMPONENT";
            })
          : [];
      var file = buildAnatomyFile(picked.node, {
        slug: slug,
        kit: kit.toLowerCase(),
        syncedAt: syncedAt,
        source: source,
        nodeIdToSlug: nodeIdToSlug,
        keyToSlug: keyToSlug,
        componentIdToKey: componentIdToKey,
        varNameById: varNameById,
        variants: variants,
        defaultVariantName: picked.variant,
      });
      writeJson(path.join(anatomyDir, slug + ".json"), file);
      bundle.components[slug] = file;
      count++;
    } catch (e) {
      failed.push({ slug: slug, error: e.message });
    }
  });
  writeJson(path.join(anatomyDir, "..", "anatomy.bundle.json"), bundle);
  // Prune stale files AFTER the fresh write, and only when we wrote something — a
  // transient empty/partial Figma response (count 0) must never wipe existing data.
  pruneStaleAnatomy(anatomyDir, Object.keys(bundle.components));
  return result(count, failed.length ? { failed: failed } : undefined);
}

module.exports = {
  syncAnatomy,
  nodeIdToSlugMap,
  keyToSlugMap,
  mergeComponentIdToKey,
  fileKeyFor,
  isIconComponent,
  pickDefaultVariant,
};
