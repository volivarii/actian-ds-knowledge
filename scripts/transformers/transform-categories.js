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
  // Mirrors the DS Kit's own header page, which Figma renamed to "Form".
  // Holding the old label here made the live header unrecognizable, and
  // preserveKnownCategories then reverted it every night (see #428).
  "Form",
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

// ζ.2 (2026-05-13): convert a top-level marker raw name (e.g., "🧱 COMPONENTS",
// "💎 FOUNDATIONS", "🎨 BRAND ASSETS") into a human-readable section label
// ("Components", "Foundations", "Brand Assets"). Strips the leading emoji
// + title-cases the remaining ALL-CAPS words. Used to populate each entry's
// `section` field so consumers can render a top-level IA bucket.
function extractSectionName(rawMarker) {
  var trimmed = String(rawMarker).trim();
  var parts = trimmed.split(/\s+/);
  // First "part" is the emoji prefix (per isTopLevelMarker convention);
  // remaining parts are the ALL-CAPS words. Title-case each.
  var words = parts.slice(1);
  if (words.length === 0) return null;
  return words
    .map(function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

function inferCategoryMap(documentChildren, pageOverrides) {
  var map = {};
  var overrides = pageOverrides || {};
  var warnings = [];
  var seenCategories = {};
  var inComponentsSection = false;
  var currentSection = null; // ζ.2: tracks top-level marker (Components/Foundations/Brand)
  var currentCategory = null;
  var unknownCategoryIndex = {};

  var children = Array.isArray(documentChildren) ? documentChildren : [];

  for (var i = 0; i < children.length; i++) {
    var c = children[i];
    if (!c || c.type !== "CANVAS") continue;
    var rawName = String(c.name == null ? "" : c.name);
    var trimmed = rawName.trim();

    // First-checked, unconditional page-level override (components/src/
    // category-page-overrides.json). Normalizes a churned/self-hosting page
    // (e.g. "DS Icons" -> "Icons") to a canonical category regardless of
    // section, order, or a missing category header. Both planes still join on
    // the real page clean-name; only the category value is normalized. A key
    // that collides with a real category-header name is skipped, so it never
    // intercepts the header page (which would leave currentCategory unset and
    // orphan that section's member pages).
    var overrideParsed = statusParser.extractStatus(rawName);
    if (
      KNOWN_CATEGORIES.indexOf(overrideParsed.cleanName) < 0 &&
      Object.prototype.hasOwnProperty.call(overrides, overrideParsed.cleanName)
    ) {
      var overrideCat = overrides[overrideParsed.cleanName];
      map[overrideParsed.cleanName] = {
        section: currentSection,
        category: overrideCat,
        status: overrideParsed.status,
      };
      seenCategories[overrideCat] = true;
      continue;
    }

    if (isTopLevelMarker(rawName)) {
      inComponentsSection = trimmed.indexOf("COMPONENTS") >= 0;
      currentSection = extractSectionName(trimmed);
      currentCategory = null;
      continue;
    }

    if (!inComponentsSection) {
      // ζ.2 (2026-05-13): non-COMPONENTS pages now also get a populated
      // `category` (= page clean-name) and a `section` (= top-level marker).
      // Previously category was always null for these — leaving 234 icons +
      // brand items uncategorized and unable to render in docs sidebar IA.
      var parsedNon = statusParser.extractStatus(rawName);
      map[parsedNon.cleanName || trimmed] = {
        section: currentSection,
        category: parsedNon.cleanName || trimmed,
        status: parsedNon.status,
      };
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
    map[memberKey] = {
      section: currentSection,
      category: currentCategory,
      status: parsed.status,
    };
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

  // Canonical emit: category keys sorted (member lists sorted too) so the
  // artifact is byte-stable regardless of registry iteration order.
  var sortedCategories = {};
  Object.keys(categories)
    .sort()
    .forEach(function (cat) {
      categories[cat].components.sort();
      sortedCategories[cat] = categories[cat];
    });

  return {
    library: (registry && registry.library) || null,
    generatedAt: new Date().toISOString(),
    categories: sortedCategories,
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
  _extractSectionName: extractSectionName,
};
