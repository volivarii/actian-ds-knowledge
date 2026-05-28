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

// Read the per-section src/ files in canonical `_order.json` order, exclude
// meta files (AUTHORING.md, README.md, _order.json itself), and concatenate
// with `\n\n---\n\n` separators. The separator matches the original inter-
// section layout of the pre-split accessibility.md (blank-line, ---, blank-
// line), so the concatenated stream is byte-identical to running
// deriveA11yIndex on the legacy single-file source. Per-section authoring is
// the SoT; this concat is a derive-time view, not stored on disk.
//
// _order.json is the per-directory ordering manifest. The accessibility
// derive script reads it to determine concatenation order, replacing the
// legacy NN-<slug>.md prefix convention. See accessibility/src/AUTHORING.md.
var ORDER_MANIFEST_NAME = "_order.json";
var META_FILES = new Set(["AUTHORING.md", "README.md", ORDER_MANIFEST_NAME]);

function readOrderManifest(srcDir) {
  var manifestPath = path.join(srcDir, ORDER_MANIFEST_NAME);
  var raw;
  try {
    raw = fs.readFileSync(manifestPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(
        "accessibility/src/_order.json is missing — every substrate directory must declare its section order via this manifest. See accessibility/src/AUTHORING.md.",
      );
    }
    throw new Error(
      "accessibility/src/_order.json could not be read: " + err.message,
      { cause: err },
    );
  }
  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      "accessibility/src/_order.json is not valid JSON: " + err.message,
      { cause: err },
    );
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every(function (x) {
      return typeof x === "string";
    })
  ) {
    throw new Error(
      "accessibility/src/_order.json must be an array of slug strings",
    );
  }
  return parsed;
}

function readSlugFiles(srcDir) {
  return new Set(
    fs
      .readdirSync(srcDir)
      .filter(function (n) {
        return n.endsWith(".md") && !META_FILES.has(n);
      })
      .map(function (n) {
        return n.replace(/\.md$/, "");
      }),
  );
}

function assertOrderConsistency(srcDir, order, onDisk) {
  var errors = [];
  // Duplicate-slug check: an entry appearing twice would cause the same
  // file to be concatenated twice into the dist output.
  var seen = new Set();
  order.forEach(function (slug, idx) {
    if (seen.has(slug)) {
      errors.push(
        '  - _order.json contains duplicate slug "' +
          slug +
          '" at index ' +
          idx,
      );
    }
    seen.add(slug);
  });
  for (var i = 0; i < order.length; i++) {
    if (!onDisk.has(order[i])) {
      errors.push(
        '  - _order.json references "' +
          order[i] +
          '" but ' +
          path.join(srcDir, order[i] + ".md") +
          " does not exist",
      );
    }
  }
  var orderSet = new Set(order);
  Array.from(onDisk).forEach(function (slug) {
    if (!orderSet.has(slug)) {
      errors.push(
        "  - " +
          path.join(srcDir, slug + ".md") +
          " exists but is not listed in _order.json",
      );
    }
  });
  if (errors.length > 0) {
    throw new Error(
      "_order.json drift in " + srcDir + ":\n" + errors.join("\n"),
    );
  }
}

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
      source: "accessibility/src/",
      do_not_edit: "Edit the per-section src/ files; CI regenerates this file.",
    },
    sections: sections,
  };
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
  slugify: slugify,
  extractSlugFromHeading: extractSlugFromHeading,
  extractHeadingText: extractHeadingText,
};
