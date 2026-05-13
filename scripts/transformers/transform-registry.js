"use strict";

// Transforms Figma REST payloads into a kit registry JSON, matching the shape
// produced by the existing /sync-design-system Phase 1 (sync-phases.md).
//
// Pure function — no I/O, no globals. The orchestrator (sync-from-figma.js)
// is responsible for fetching REST data and writing the registry file.
//
// Input shape:
//   {
//     library:            "ds" | "fm" | "meta-kit",
//     fileKey:            string,
//     componentSets:      Array<RestComponentSet>      // from /v1/files/:key/component_sets meta.component_sets
//     componentSetNodes:  Object<nodeId, NodePayload>  // batched /v1/files/:key/nodes?ids=…
//     standalones:        Array<RestComponent>         // pre-filtered standalones (parent !== COMPONENT_SET, not internal)
//     standaloneNodes:    Object<nodeId, NodePayload>  // batched /nodes for standalones
//     documentChildren:   Array<CanvasNode>            // OPTIONAL — file's pages tree for category inference (DS Kit only)
//     guidelinesSlugSet:  Set<string>                  // OPTIONAL — slugs with guideline files at components/src/guidelines/<slug>.json
//   }
//
// Output: registry JSON, same shape as components/registries/{dskit,fmkit,metakit}.json.

var inferCategoryMap = require("./transform-categories.js").inferCategoryMap;
var statusParser = require("./component-status-emoji.js");

function slugify(name) {
  // Lowercase + hyphenated. "Button" → "button"; "Tab Bar" → "tab-bar".
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isInternalName(name) {
  return typeof name === "string" && name.startsWith(".");
}

function pageNameFromContainingFrame(cf) {
  // REST returns page names with Figma's indent prefix (whitespace marking
  // hierarchy depth). Trim to match the existing registry shape.
  if (!cf) return "unknown";
  var raw = cf.pageName || cf.name || "unknown";
  return String(raw).trim();
}

function trimDescription(s) {
  s = s || "";
  // Normalize whitespace-only strings to empty string so callers can do a
  // simple truthiness check: `entry.description || fallback`.
  if (s.trim() === "") return "";
  return s;
}

// Convert REST `componentPropertyDefinitions` into our two output shapes:
//   variants: { axisName: [values, …] }   (VARIANT-typed entries only)
//   properties: { hashKey: { type, default } }   (everything else)
function splitVariantAndProperties(definitions) {
  var variants = null;
  var properties = {};
  if (!definitions || typeof definitions !== "object") {
    return { variants: variants, properties: properties };
  }
  Object.keys(definitions).forEach(function (key) {
    var def = definitions[key];
    if (!def || typeof def !== "object") return;
    if (def.type === "VARIANT") {
      if (variants === null) variants = {};
      variants[key] = Array.isArray(def.variantOptions)
        ? def.variantOptions.slice()
        : [];
      return;
    }
    properties[key] = {
      type: def.type,
      default: def.defaultValue,
    };
  });
  return { variants: variants, properties: properties };
}

// ζ.2 (2026-05-13): derive the third-axis `group` field from Figma's
// containing_frame structure. Lets docs sidebar IA collapse multi-component
// pages (Tag's 9 variants, Loading's 4, Empty state's 4, etc.) into one
// sidebar node with N children.
//
// For COMPONENTS-section items: group = page clean-name (e.g.,
//   "Tag (Identification key)" for all 9 Tag variants).
// For FOUNDATIONS / BRAND items: prefer containing_frame.name when it
//   differs from the page clean-name (icons typically live in named
//   sub-frames like "Navigation icons"); fall back to page clean-name.
function deriveGroup(meta, section, pageCleanName) {
  var frameName = meta && meta.containing_frame && meta.containing_frame.name;
  if (
    section &&
    section !== "Components" &&
    frameName &&
    String(frameName).trim() &&
    String(frameName).trim() !== pageCleanName
  ) {
    return String(frameName).trim();
  }
  return pageCleanName;
}

function buildEntry(
  meta,
  node,
  importMethod,
  categoryEntry,
  guidelinesSlugSet,
  slug,
) {
  var doc = (node && node.document) || {};
  var split = splitVariantAndProperties(doc.componentPropertyDefinitions);

  var pageName = pageNameFromContainingFrame(meta.containing_frame);
  var pageCleanName =
    statusParser.extractStatus(pageName).cleanName || pageName;

  // Figma REST exposes documentationLinks on COMPONENT_SET node documents.
  // Shape: [{ uri: string }]. Pass through verbatim (preserves Figma's
  // representation; consumers can extract `.uri` themselves).
  var documentationLinks = Array.isArray(doc.documentationLinks)
    ? doc.documentationLinks
    : [];

  // Resolve guidelinesFile by slug lookup against the curated index
  // (components/src/guidelines/_index.json). Returns a repo-root-relative
  // path when a guideline file exists; null otherwise. Plugin + docs site
  // previously reconstructed this path on every read by walking _index.json
  // — wiring it upstream eliminates the redundant indirection.
  var guidelinesFile =
    guidelinesSlugSet && guidelinesSlugSet.has(slug)
      ? "components/src/guidelines/" + slug + ".json"
      : null;

  var entry = {
    name: meta.name,
    key: meta.key,
    nodeId: meta.node_id,
    importMethod: importMethod,
    description: trimDescription(meta.description),
    page: pageName,
    properties: split.properties,
    nestedComponents: [],
    documentationLinks: documentationLinks,
    guidelinesFile: guidelinesFile,
  };

  // ζ.2 (2026-05-13): three-axis grouping. `section` (top-level marker,
  // e.g. "Components"/"Foundations"/"Brand") + `category` (existing
  // semantic — now also populated for non-COMPONENTS items, was null)
  // + `group` (third level, page clean-name for components / frame name
  // for icons). All three are additive; consumers that read only
  // `category` keep working.
  if (categoryEntry) {
    if (categoryEntry.section != null) {
      entry.section = categoryEntry.section;
    }
    entry.category = categoryEntry.category;
    entry.group = deriveGroup(meta, categoryEntry.section, pageCleanName);
    if (categoryEntry.status != null) {
      entry.status = categoryEntry.status;
    }
  }

  if (importMethod === "set") {
    entry.variants = split.variants || {};
  }
  return entry;
}

function transformRegistry(input) {
  var library = input.library;
  var fileKey = input.fileKey;
  var componentSets = input.componentSets || [];
  var componentSetNodes = input.componentSetNodes || {};
  var standalones = input.standalones || [];
  var standaloneNodes = input.standaloneNodes || {};
  var documentChildren = input.documentChildren || null;
  // Guidelines index — accept either a Set or any iterable of slugs. The
  // orchestrator passes a Set built from _index.json; tests can pass an
  // Array which we promote to Set for membership checks.
  var guidelinesSlugSet = null;
  if (input.guidelinesSlugSet) {
    guidelinesSlugSet =
      input.guidelinesSlugSet instanceof Set
        ? input.guidelinesSlugSet
        : new Set(input.guidelinesSlugSet);
  }
  var lastSyncedIso = new Date().toISOString();

  var registry = {
    library: library,
    fileKey: fileKey,
    lastSynced: lastSyncedIso,
    componentCount: 0,
    components: {},
  };

  // Build category lookup once. The map is keyed by the component
  // cleanName (e.g., "Button"), so we look up by meta.name rather than
  // the page-name string. Warnings are surfaced via input.onWarnings if
  // the caller wants them.
  var categoryMap = null;
  if (documentChildren) {
    var inference = inferCategoryMap(documentChildren);
    categoryMap = inference.map;
    if (typeof input.onWarnings === "function") {
      input.onWarnings(inference.warnings);
    }
  }

  // The categoryMap is keyed by page clean-name (e.g., "Tag (Identification key)"),
  // not by component name. A single page can host multiple components (tag-*,
  // loading variants, data-viz variants); they all share the page's category.
  // Look up by the component's containing_frame.pageName with the status
  // emoji stripped.
  function lookupCategoryEntry(meta) {
    if (!categoryMap) return null;
    var pageName =
      (meta && meta.containing_frame && meta.containing_frame.pageName) || "";
    var cleanPage = statusParser.extractStatus(pageName).cleanName;
    if (!cleanPage) return null;
    return categoryMap[cleanPage] || null;
  }

  // Component sets
  componentSets.forEach(function (meta) {
    if (isInternalName(meta.name)) return;
    var node = componentSetNodes[meta.node_id];
    var slug = slugify(meta.name);
    var entry = buildEntry(
      meta,
      node,
      "set",
      lookupCategoryEntry(meta),
      guidelinesSlugSet,
      slug,
    );
    registry.components[slug] = entry;
  });

  // Standalone components — caller must have already filtered out variants-of-sets.
  standalones.forEach(function (meta) {
    if (isInternalName(meta.name)) return;
    var node = standaloneNodes[meta.node_id];
    var slug = slugify(meta.name);
    // Don't clobber a set entry on a name collision (sets win).
    if (slug in registry.components) return;
    var entry = buildEntry(
      meta,
      node,
      "single",
      lookupCategoryEntry(meta),
      guidelinesSlugSet,
      slug,
    );
    registry.components[slug] = entry;
  });

  registry.componentCount = Object.keys(registry.components).length;

  // ζ.3 (2026-05-13): post-pass — populate nestedComponents.
  //
  // Two signal sources from Figma REST node payloads:
  //   1. INSTANCE_SWAP property defaults (componentPropertyDefinitions):
  //      defaultValue is the component key of the swappable slot's default.
  //      Role = property name with hash-suffix stripped (Figma uses "Icon#15:0"
  //      style identifiers internally).
  //   2. Child INSTANCE nodes recursively walked from doc.children:
  //      componentId is the source component's node id. Captures hardcoded
  //      nesting (non-swappable instances baked into the component frame).
  //
  // Both signals get resolved against same-kit slugs only — cross-kit refs
  // and external library refs return null and are dropped. Deduplication
  // keeps the first occurrence (instance-swap entries listed first since
  // they're authoritatively curated).
  populateNestedComponents(registry, componentSetNodes, standaloneNodes);

  return registry;
}

// Strip Figma's "#NN:NN" hash suffix from property keys: "Icon#15927:0" → "Icon".
function stripPropertyHash(name) {
  var s = String(name || "");
  var hashIdx = s.indexOf("#");
  return hashIdx >= 0 ? s.slice(0, hashIdx) : s;
}

// Recursively walk a Figma node tree and yield every INSTANCE node's
// `componentId`. INSTANCE nodes can nest inside frames, groups, vector
// containers, etc. — descend through any container type.
function collectInstanceComponentIds(node, out) {
  if (!node || typeof node !== "object") return;
  if (node.type === "INSTANCE" && typeof node.componentId === "string") {
    out.push(node.componentId);
  }
  if (Array.isArray(node.children)) {
    for (var i = 0; i < node.children.length; i++) {
      collectInstanceComponentIds(node.children[i], out);
    }
  }
}

function populateNestedComponents(
  registry,
  componentSetNodes,
  standaloneNodes,
) {
  // Build key → slug and nodeId → slug lookup maps.
  var keyToSlug = {};
  var nodeIdToSlug = {};
  Object.keys(registry.components).forEach(function (slug) {
    var e = registry.components[slug];
    if (e.key) keyToSlug[e.key] = slug;
    if (e.nodeId) nodeIdToSlug[e.nodeId] = slug;
  });

  Object.keys(registry.components).forEach(function (slug) {
    var entry = registry.components[slug];
    var node = componentSetNodes[entry.nodeId] || standaloneNodes[entry.nodeId];
    if (!node || !node.document) return;
    var doc = node.document;

    var seen = {};
    var nested = [];

    // Source 1: INSTANCE_SWAP property defaults.
    var defs = doc.componentPropertyDefinitions;
    if (defs && typeof defs === "object") {
      Object.keys(defs).forEach(function (propKey) {
        var def = defs[propKey];
        if (!def || def.type !== "INSTANCE_SWAP") return;
        var targetKey = def.defaultValue;
        if (!targetKey) return;
        var targetSlug = keyToSlug[targetKey];
        if (!targetSlug || targetSlug === slug) return;
        if (seen[targetSlug]) return;
        seen[targetSlug] = true;
        nested.push({
          slug: targetSlug,
          role: stripPropertyHash(propKey),
          source: "instance-swap",
        });
      });
    }

    // Source 2: hardcoded INSTANCE children in the node tree.
    var componentIds = [];
    collectInstanceComponentIds(doc, componentIds);
    componentIds.forEach(function (cid) {
      var targetSlug = nodeIdToSlug[cid];
      if (!targetSlug || targetSlug === slug) return;
      if (seen[targetSlug]) return;
      seen[targetSlug] = true;
      nested.push({
        slug: targetSlug,
        role: null,
        source: "child-instance",
      });
    });

    if (nested.length > 0) {
      entry.nestedComponents = nested;
    }
  });
}

module.exports = transformRegistry;
module.exports._slugify = slugify;
module.exports._splitVariantAndProperties = splitVariantAndProperties;
module.exports._trimDescription = trimDescription;
