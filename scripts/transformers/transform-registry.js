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
//     iconGroups:         Object<label, slug[]>        // OPTIONAL — curated mapping from components/src/icon-groups.json. ζ.5: layered onto icon entries (category === "Icons") to replace the uniform "Actual icons" group with semantic labels (Connector / Status / Navigation / …). Multi-group icons get `secondaryGroups`.
//   }
//
// Output: registry JSON, same shape as components/registries/{dskit,fmkit,metakit}.json.

var categoriesModule = require("./transform-categories.js");
var inferCategoryMap = categoriesModule.inferCategoryMap;
var KNOWN_CATEGORIES = categoriesModule.KNOWN_CATEGORIES;
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

// ζ.5 (2026-05-13): for icons specifically, the registry-time `group`
// from containing_frame.name is uniformly "Actual icons" (every icon
// COMPONENT_SET lives in that one frame). The semantic categorization
// (Connector / Status / Navigation / etc.) lives one level deeper in
// the Figma layout — captured by the curated mapping at
// components/src/icon-groups.json. This helper applies that mapping:
//   - sets `group` to the primary semantic label (first-listed in the
//     mapping; specific-first ordering — Cursor over Common, etc.)
//   - sets `secondaryGroups` to the additional labels when an icon
//     belongs to multiple groups (8 icons today: add / download /
//     directory / book-bookmark / minimize / export / process / dataset)
//   - falls back to "Other" when an icon isn't in the mapping (e.g.,
//     a designer just added one and hasn't classified it yet)
function applyIconGroups(entry, slug, iconGroupsLookup) {
  if (!iconGroupsLookup || entry.category !== "Icons") return;
  var groups = iconGroupsLookup[slug];
  if (!groups || groups.length === 0) {
    entry.group = "Other";
    return;
  }
  entry.group = groups[0];
  if (groups.length > 1) {
    entry.secondaryGroups = groups.slice(1);
  }
}

function buildEntry(
  meta,
  node,
  importMethod,
  categoryEntry,
  slug,
  iconGroupsLookup,
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

  // Phase 5 (knowledge v0.11.0): `guidelinesFile` was retired with the
  // scraped components/src/guidelines/ layer. Consumers now resolve per-
  // component guideline docs by slug via PATHS.components.guidelineDoc.byKey
  // (components/dist/guidelines/<slug>.json, domains.* shape).

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
    entry.categorySlug = slugify(categoryEntry.category);
    entry.group = deriveGroup(meta, categoryEntry.section, pageCleanName);
    // ζ.5 (2026-05-13): for icons, overwrite `group` with the semantic
    // label from icon-groups.json (and add `secondaryGroups` for icons
    // that span multiple groups). For non-icons this is a no-op.
    applyIconGroups(entry, slug, iconGroupsLookup);
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
  // Phase 5 (knowledge v0.11.0): `input.guidelinesSlugSet` was retired
  // along with the `guidelinesFile` registry field — consumers now resolve
  // per-component guideline docs by slug via the components.guidelineDoc
  // collection in paths-manifest.json instead.
  // ζ.5: invert the icon-groups.json shape (group→[slugs]) into a
  // per-slug lookup (slug→[groups]) once, then pass to buildEntry. The
  // first listed group is primary (specific-first priority encoded by
  // the file's key order); subsequent groups become `secondaryGroups`.
  var iconGroupsLookup = null;
  if (input.iconGroups && typeof input.iconGroups === "object") {
    iconGroupsLookup = {};
    Object.keys(input.iconGroups).forEach(function (label) {
      if (label.charAt(0) === "_") return; // skip _naming_convention etc.
      var slugs = input.iconGroups[label];
      if (!Array.isArray(slugs)) return;
      slugs.forEach(function (slug) {
        if (!iconGroupsLookup[slug]) iconGroupsLookup[slug] = [];
        if (iconGroupsLookup[slug].indexOf(label) < 0) {
          iconGroupsLookup[slug].push(label);
        }
      });
    });
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
  // emoji stripped. Also returns the derived cleanPage so callers can detect
  // the "component frame sits directly on a category-header page" case
  // (header pages are never in categoryMap, so this would otherwise miss
  // silently — see COMPONENT_ON_CATEGORY_PAGE below).
  function lookupCategoryEntry(meta) {
    var pageName =
      (meta && meta.containing_frame && meta.containing_frame.pageName) || "";
    var cleanPage = statusParser.extractStatus(pageName).cleanName;
    var entry =
      categoryMap && cleanPage ? categoryMap[cleanPage] || null : null;
    return { entry: entry, cleanPage: cleanPage };
  }

  // Component-level warnings collected alongside the two buildEntry loops
  // below: a component whose page resolves to no categoryMap entry AND
  // whose clean page name is itself a known category header means the
  // component's frames live directly on the category canvas instead of
  // their own member page. Only meaningful when category inference
  // actually ran (categoryMap non-null); kits without page-category
  // structure (FM/Meta Kit) never pass documentChildren and shouldn't
  // emit these.
  //
  // Vincent's rule (2026-07-02): this is a publish gate, not just a
  // warning — the component is EXCLUDED from registry.components (see
  // isOnCategoryHeaderPage below); the page convention is how a component
  // gets published at all. The warning still fires so the sync PR
  // changelog surfaces the exclusion.
  var componentWarnings = [];
  var seenComponentWarnings = {};
  function isOnCategoryHeaderPage(lookup) {
    if (!categoryMap) return false;
    if (lookup.entry) return false;
    if (!lookup.cleanPage) return false;
    return KNOWN_CATEGORIES.indexOf(lookup.cleanPage) >= 0;
  }
  function collectComponentWarning(lookup, slug) {
    if (!isOnCategoryHeaderPage(lookup)) return;
    var dedupeKey = lookup.cleanPage + "|" + slug;
    if (seenComponentWarnings[dedupeKey]) return;
    seenComponentWarnings[dedupeKey] = true;
    componentWarnings.push({
      code: "COMPONENT_ON_CATEGORY_PAGE",
      page: lookup.cleanPage,
      component: slug,
    });
  }

  // Component sets
  componentSets.forEach(function (meta) {
    if (isInternalName(meta.name)) return;
    var node = componentSetNodes[meta.node_id];
    var slug = slugify(meta.name);
    var lookup = lookupCategoryEntry(meta);
    collectComponentWarning(lookup, slug);
    if (isOnCategoryHeaderPage(lookup)) return;
    var entry = buildEntry(
      meta,
      node,
      "set",
      lookup.entry,
      slug,
      iconGroupsLookup,
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
    var lookup = lookupCategoryEntry(meta);
    collectComponentWarning(lookup, slug);
    if (isOnCategoryHeaderPage(lookup)) return;
    var entry = buildEntry(
      meta,
      node,
      "single",
      lookup.entry,
      slug,
      iconGroupsLookup,
    );
    registry.components[slug] = entry;
  });

  if (componentWarnings.length > 0 && typeof input.onWarnings === "function") {
    input.onWarnings(componentWarnings);
  }

  // Canonical emit: components sorted by slug so a re-emitted file is
  // byte-stable and a real diff stays readable. Figma's API iteration order
  // (sets then standalones, each in service order) is arbitrary and made
  // ~97% of breaking-PR registry diffs pure move-noise.
  var sortedComponents = {};
  Object.keys(registry.components)
    .sort()
    .forEach(function (slug) {
      sortedComponents[slug] = registry.components[slug];
    });
  registry.components = sortedComponents;

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
module.exports._buildEntry = buildEntry;
