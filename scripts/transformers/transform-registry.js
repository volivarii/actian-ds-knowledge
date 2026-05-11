"use strict";

// Transforms Figma REST payloads into a kit registry JSON, matching the shape
// produced by the existing /sync-design-system Phase 1 (sync-phases.md).
//
// Pure function — no I/O, no globals. The orchestrator (sync-from-figma.js)
// is responsible for fetching REST data and writing the registry file.
//
// Input shape:
//   {
//     library:           "ds" | "fm" | "meta-kit",
//     fileKey:           string,
//     componentSets:     Array<RestComponentSet>      // from /v1/files/:key/component_sets meta.component_sets
//     componentSetNodes: Object<nodeId, NodePayload>  // batched /v1/files/:key/nodes?ids=…
//     standalones:       Array<RestComponent>         // pre-filtered standalones (parent !== COMPONENT_SET, not internal)
//     standaloneNodes:   Object<nodeId, NodePayload>  // batched /nodes for standalones
//   }
//
// Output: registry JSON, same shape as components/registries/{dskit,fmkit,metakit}.json.

var DESCRIPTION_MAX = 200; // matches project_sync_skill_enhancements.md item #2

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
  return s.length > DESCRIPTION_MAX ? s.slice(0, DESCRIPTION_MAX) : s;
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

function buildEntry(meta, node, importMethod, lastSyncedIso, categoryEntry) {
  var doc = (node && node.document) || {};
  var split = splitVariantAndProperties(doc.componentPropertyDefinitions);

  var pageName = pageNameFromContainingFrame(meta.containing_frame);

  var entry = {
    name: meta.name,
    key: meta.key,
    nodeId: meta.node_id,
    importMethod: importMethod,
    description: trimDescription(meta.description),
    lastSynced: lastSyncedIso,
    page: pageName,
    properties: split.properties,
    nestedComponents: [],
    guidelinesFile: null,
  };

  // Apply category + status only when an inferred entry was supplied
  // (i.e., for dsKit syncs that pass documentChildren). Lookup is keyed
  // by the component cleanName, which transform-categories strips from
  // the page-name's status-emoji prefix.
  if (categoryEntry) {
    entry.category = categoryEntry.category;
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
    var entry = buildEntry(
      meta,
      node,
      "set",
      lastSyncedIso,
      lookupCategoryEntry(meta),
    );
    var slug = slugify(meta.name);
    registry.components[slug] = entry;
  });

  // Standalone components — caller must have already filtered out variants-of-sets.
  standalones.forEach(function (meta) {
    if (isInternalName(meta.name)) return;
    var node = standaloneNodes[meta.node_id];
    var entry = buildEntry(
      meta,
      node,
      "single",
      lastSyncedIso,
      lookupCategoryEntry(meta),
    );
    var slug = slugify(meta.name);
    // Don't clobber a set entry on a name collision (sets win).
    if (slug in registry.components) return;
    registry.components[slug] = entry;
  });

  registry.componentCount = Object.keys(registry.components).length;
  return registry;
}

module.exports = transformRegistry;
module.exports._slugify = slugify;
module.exports._splitVariantAndProperties = splitVariantAndProperties;
module.exports._trimDescription = trimDescription;
