"use strict";

var fs = require("node:fs");
var path = require("node:path");
var orderManifest = require("../lib/order-manifest.js");
var ORDER_MANIFEST_NAME = orderManifest.ORDER_MANIFEST_NAME;
var META_FILES = orderManifest.META_FILES;
var readOrderManifest = orderManifest.readOrderManifest;
var readSlugFiles = orderManifest.readSlugFiles;
var assertOrderConsistency = orderManifest.assertOrderConsistency;

// Slugify a heading into a stable section id: drop a leading "N." numeral,
// lowercase, and reduce every run of non-alphanumerics to a single hyphen.
// Mirrors the auto-slug approach of derive-foundations.js. Used as the
// fallback when a heading carries no explicit `{#anchor}` marker.
function slugify(heading) {
  return heading
    .replace(/^\s*\d+\.\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

var ANCHOR_RE = /\s*\{#([a-z0-9-]+)\}\s*$/;

// The three H2 group-header sections — they introduce a group (or are the
// Principles overview), and are not themselves referenceable topics. Every
// other H2 is a foundation leaf topic; H3s inherit tier from their parent
// group. This classifier sets each section's `tier` field — the single source
// of truth for a11y tier, read downstream by the editor picker and by
// tests/a11y-refs-coverage.test.js (which reads the emitted `tier`, not this
// constant).
var GROUP_HEADER_SLUGS = {
  principles: true,
  components: true,
  "designer-handoff-checklist": true,
};

// Extract the section slug from a heading line. An explicit `{#anchor}`
// marker is the authoritative source — it lets authors change heading TEXT
// without breaking the consumer-visible slug. When absent, falls back to
// slugify() for backwards compatibility.
function extractSlugFromHeading(headingLine) {
  var text = headingLine.replace(/^#+\s*/, "");
  var m = text.match(ANCHOR_RE);
  if (m) return m[1];
  return slugify(text.trim());
}

// Strip the `{#anchor}` marker from a heading line and return the displayed
// heading text. The marker is an addressing concern; consumers reading the
// section title never see it.
function extractHeadingText(headingLine) {
  return headingLine
    .replace(/^#+\s*/, "")
    .replace(ANCHOR_RE, "")
    .trim();
}

// Read the per-section src/ files in canonical `_order.json` order, exclude
// meta files (AUTHORING.md, README.md, _order.json itself), and concatenate
// with `\n\n---\n\n` separators. The separator matches the original inter-
// section layout of the pre-split accessibility.md (blank-line, ---, blank-
// line), so the concatenated stream is byte-identical to running
// deriveA11yIndex on the legacy single-file source. Per-section authoring is
// the SoT; this concat is a derive-time view, not stored on disk.
//
// _order.json is the per-directory ordering manifest. The manifest reader
// + drift checker live in scripts/lib/order-manifest.js (shared with
// derive-foundations.js). See accessibility/src/AUTHORING.md for the
// authoring story.
function concatA11ySources(srcDir) {
  var order = readOrderManifest(srcDir);
  var onDisk = readSlugFiles(srcDir);
  assertOrderConsistency(srcDir, order, onDisk);
  return order
    .map(function (slug) {
      return fs
        .readFileSync(path.join(srcDir, slug + ".md"), "utf8")
        .replace(/\s+$/, "");
    })
    .join("\n\n---\n\n");
}

function deriveA11yIndex(md) {
  var lines = md.split("\n");
  var sections = [];
  var seen = Object.create(null);
  var current = null;
  var currentGroup = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // H2 sections and H3 sub-sections (per-component entries under
    // "## Components", checklist groups under "## Designer Handoff
    // Checklist") both become index sections. Slug comes from the
    // heading's explicit `{#anchor}` marker (preferred) or slugify
    // fallback. First occurrence of a slug wins — a later heading that
    // resolves to the same slug (e.g. the checklist re-uses topic names)
    // is skipped, never duplicated.
    var m = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (m) {
      var level = m[1].length; // 2 = H2, 3 = H3
      var title = extractHeadingText(line);
      var slug = extractSlugFromHeading(line);
      if (level === 2) currentGroup = slug; // track parent group for H3s
      if (slug && !seen[slug]) {
        if (current) sections.push(current);
        seen[slug] = true;
        var tier;
        if (level === 2) {
          tier = GROUP_HEADER_SLUGS[slug] ? "header" : "foundation";
        } else {
          tier =
            currentGroup === "components"
              ? "component-pattern"
              : currentGroup === "designer-handoff-checklist"
                ? "checklist"
                : "foundation";
        }
        current = {
          slug: slug,
          title: title,
          tier: tier,
          wcag: [],
          body_excerpt: "",
        };
      }
      continue;
    }
    // Match both "WCAG X.X.X" inline and "WCAG criteria:" header
    if (
      current &&
      (/WCAG\s+\d+\.\d+\.\d+/.test(line) || /WCAG criteria:/i.test(line))
    ) {
      var wcagMatches = line.match(/\d+\.\d+\.\d+/g) || [];
      current.wcag = current.wcag.concat(wcagMatches);
    }
    if (
      current &&
      line.trim() &&
      !line.match(/^#+\s/) &&
      current.body_excerpt.length < 200
    ) {
      var cleanLine = line
        .trim()
        .replace(/[|*_`~#\[\]]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (cleanLine) {
        current.body_excerpt += (current.body_excerpt ? " " : "") + cleanLine;
        if (current.body_excerpt.length > 200) {
          current.body_excerpt = current.body_excerpt.slice(0, 200).trimEnd();
        }
      }
    }
  }
  if (current) sections.push(current);
  // Deduplicate wcag refs per section
  sections.forEach(function (s) {
    s.wcag = Array.from(new Set(s.wcag));
  });
  return {
    _schema_version: 1,
    _meta: {
      auto_generated: true,
      source: "accessibility/src/",
      do_not_edit: "Edit the per-section src/ files; CI regenerates this file.",
    },
    sections: sections,
    bySlug: sections.reduce(function (m, s) {
      m[s.slug] = s;
      return m;
    }, {}),
  };
}

// Harvest WCAG criteria keyed by section slug, reusing the SAME index builder
// so there is ONE harvest shared by the flat index derive and the per-section
// derive (zero drift). Returns `{ [slug]: string[] }`. The per-section derive
// attaches each leaf/branch its slug's wcag array via this map; because the
// index dedups cross-file slug collisions (first occurrence wins), a slug that
// appears both top-level and nested resolves to the same single wcag list —
// consistent with what consumers see in a11y-index.json.
function wcagBySlug(md) {
  var idx = deriveA11yIndex(md);
  var map = Object.create(null);
  idx.sections.forEach(function (s) {
    map[s.slug] = s.wcag || [];
  });
  return map;
}

if (require.main === module) {
  var srcDir = path.resolve(__dirname, "..", "..", "accessibility", "src");
  var distPath = path.resolve(
    __dirname,
    "..",
    "..",
    "accessibility",
    "dist",
    "a11y-index.json",
  );
  var md = concatA11ySources(srcDir);
  var idx = deriveA11yIndex(md);
  fs.mkdirSync(path.dirname(distPath), { recursive: true });
  fs.writeFileSync(distPath, JSON.stringify(idx, null, 2) + "\n");
  console.log("Derived " + idx.sections.length + " sections → " + distPath);
}

module.exports = {
  deriveA11yIndex: deriveA11yIndex,
  concatA11ySources: concatA11ySources,
  wcagBySlug: wcagBySlug,
  slugify: slugify,
  extractSlugFromHeading: extractSlugFromHeading,
  extractHeadingText: extractHeadingText,
};
