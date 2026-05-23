"use strict";

var fs = require("node:fs");
var path = require("node:path");

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

function deriveA11yIndex(md) {
  var lines = md.split("\n");
  var sections = [];
  var seen = Object.create(null);
  var current = null;
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
      var title = extractHeadingText(line);
      var slug = extractSlugFromHeading(line);
      if (slug && !seen[slug]) {
        if (current) sections.push(current);
        seen[slug] = true;
        current = { slug: slug, title: title, wcag: [], body_excerpt: "" };
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
      source: "accessibility/accessibility.md",
      do_not_edit: "Edit the source MD; CI regenerates this file.",
    },
    sections: sections,
  };
}

if (require.main === module) {
  var srcPath = path.resolve(
    __dirname,
    "..",
    "..",
    "accessibility",
    "accessibility.md",
  );
  var distPath = path.resolve(
    __dirname,
    "..",
    "..",
    "accessibility",
    "dist",
    "a11y-index.json",
  );
  var md = fs.readFileSync(srcPath, "utf8");
  var idx = deriveA11yIndex(md);
  fs.mkdirSync(path.dirname(distPath), { recursive: true });
  fs.writeFileSync(distPath, JSON.stringify(idx, null, 2) + "\n");
  console.log("Derived " + idx.sections.length + " sections → " + distPath);
}

module.exports = {
  deriveA11yIndex: deriveA11yIndex,
  slugify: slugify,
  extractSlugFromHeading: extractSlugFromHeading,
  extractHeadingText: extractHeadingText,
};
