"use strict";

// Infers the DS Kit's category grouping from the document.children list
// returned by the Figma /v1/files/:key API (depth=1). The Pages panel uses
// a naming convention (documented in components/AUTHORING.md): top-level
// markers, Title-Case category headers, indented status-emoji-prefixed
// member pages. This transformer reads that convention and emits both a
// per-page map and a warnings list (drift detection).

var statusParser = require("./component-status-emoji.js");

var KNOWN_CATEGORIES = Object.freeze([
  "Action",
  "Form (input & selection)",
  "Navigation",
  "Data Display",
  "Feedback",
  "Overlays",
]);

// Derived from component-status-emoji.js so the two stay in sync if a
// new status emoji is added later. Listing them by hand here would be a
// silent drift risk.
var STATUS_EMOJIS = Object.keys(statusParser.COMPONENT_STATUS_MAP);
var SEPARATOR_RE = /^-+$/;

// Top-level marker: first char NOT an uppercase ASCII letter (so it's not
// a Title Case header), then a space, then ALL CAPS letters (with optional
// inner spaces). Example: "🧱 COMPONENTS", "💎 FOUNDATIONS".
function isTopLevelMarker(rawName) {
  var trimmed = String(rawName).trim();
  if (/^[A-Z]/.test(trimmed)) return false;
  var parts = trimmed.split(/\s+/);
  if (parts.length < 2) return false;
  var tail = parts.slice(1).join(" ");
  // Tail must be all-caps "words" of 2+ chars each (e.g. "COMPONENTS",
  // "BRAND ASSETS"). Title-Case headers (e.g. "Data Display") are excluded
  // by isCategoryHeader requiring an uppercase first letter, but a single
  // all-caps word would slip through the cascade — tighten here.
  return /^[A-Z]{2,}(\s[A-Z]{2,})*$/.test(tail);
}

function isSeparator(name) {
  return SEPARATOR_RE.test(String(name).trim());
}

function startsWithStatusEmoji(rawName) {
  var noLeadWs = String(rawName).replace(/^\s+/, "");
  for (var i = 0; i < STATUS_EMOJIS.length; i++) {
    if (noLeadWs.indexOf(STATUS_EMOJIS[i]) === 0) return true;
  }
  return false;
}

function isCategoryHeader(rawName) {
  var raw = String(rawName);
  if (raw.length === 0) return false;
  if (/^\s/.test(raw)) return false; // categories have NO leading whitespace
  var trimmed = raw.trim();
  if (trimmed.length === 0) return false;
  if (isSeparator(trimmed)) return false;
  if (isTopLevelMarker(trimmed)) return false;
  if (startsWithStatusEmoji(trimmed)) return false;
  if (!/^[A-Z]/.test(trimmed)) return false;
  // Reject all-caps names (e.g. "DATA DISPLAY", "FORMS"). Category headers
  // are Title Case ("Data Display"); a stray all-caps page in the
  // COMPONENTS section is more likely a misnamed marker than a category.
  if (/^[A-Z][A-Z\s]*$/.test(trimmed)) return false;
  return true;
}

function inferCategoryMap(documentChildren) {
  var map = {};
  var warnings = [];
  var seenCategories = {};
  var inComponentsSection = false;
  var currentCategory = null;
  var unknownCategoryIndex = {};

  var children = Array.isArray(documentChildren) ? documentChildren : [];

  for (var i = 0; i < children.length; i++) {
    var c = children[i];
    if (!c || c.type !== "CANVAS") continue;
    var rawName = String(c.name == null ? "" : c.name);
    var trimmed = rawName.trim();

    if (isTopLevelMarker(rawName)) {
      inComponentsSection = trimmed.indexOf("COMPONENTS") >= 0;
      currentCategory = null;
      continue;
    }

    if (!inComponentsSection) {
      map[trimmed] = { category: null, status: null };
      continue;
    }

    if (isSeparator(rawName)) {
      currentCategory = null;
      continue;
    }

    if (isCategoryHeader(rawName)) {
      currentCategory = trimmed;
      seenCategories[trimmed] = true;
      if (KNOWN_CATEGORIES.indexOf(trimmed) < 0) {
        unknownCategoryIndex[trimmed] = warnings.length;
        warnings.push({
          code: "UNKNOWN_CATEGORY",
          category: trimmed,
          members: [],
        });
      }
      continue;
    }

    // Member page
    var parsed = statusParser.extractStatus(rawName);
    var memberKey = parsed.cleanName;

    if (currentCategory === null) {
      warnings.push({ code: "MEMBER_WITHOUT_CATEGORY", page: memberKey });
    } else if (
      Object.prototype.hasOwnProperty.call(
        unknownCategoryIndex,
        currentCategory,
      )
    ) {
      warnings[unknownCategoryIndex[currentCategory]].members.push(memberKey);
    }

    // status: null in the map means the caller should OMIT the field
    // entirely (mirrors foundations precedent for ✅). transform-registry's
    // buildEntry guards with `if (categoryEntry.status != null)` before
    // assigning.
    map[memberKey] = { category: currentCategory, status: parsed.status };
  }

  for (var k = 0; k < KNOWN_CATEGORIES.length; k++) {
    if (!seenCategories[KNOWN_CATEGORIES[k]]) {
      warnings.push({
        code: "MISSING_KNOWN_CATEGORY",
        category: KNOWN_CATEGORIES[k],
      });
    }
  }

  return { map: map, warnings: warnings };
}

// Builds the components/dist/categories.json artifact from a finalized
// registry. Pure function — no I/O.
function buildCategoriesArtifact(registry) {
  var categories = {};
  var uncategorizedCount = 0;
  var components = (registry && registry.components) || {};

  Object.keys(components).forEach(function (slug) {
    var cat = components[slug] && components[slug].category;
    if (!cat) {
      uncategorizedCount++;
      return;
    }
    if (!categories[cat]) {
      categories[cat] = { components: [], count: 0 };
    }
    categories[cat].components.push(slug);
    categories[cat].count++;
  });

  Object.keys(categories).forEach(function (cat) {
    categories[cat].components.sort();
  });

  return {
    library: (registry && registry.library) || null,
    generatedAt: new Date().toISOString(),
    categories: categories,
    uncategorized: { count: uncategorizedCount },
  };
}

module.exports = {
  inferCategoryMap: inferCategoryMap,
  buildCategoriesArtifact: buildCategoriesArtifact,
  KNOWN_CATEGORIES: KNOWN_CATEGORIES,
  _isTopLevelMarker: isTopLevelMarker,
  _isCategoryHeader: isCategoryHeader,
  _isSeparator: isSeparator,
};
