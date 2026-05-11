"use strict";

var fs = require("node:fs");
var path = require("node:path");
var p = require("./categories-parser.js");

var REQUIRED_FRONTMATTER = [
  "slug",
  "label",
  "authoring_status",
  "confidence",
  "last_reviewed",
];
var REQUIRED_CONFIDENCE_KEYS = ["anatomy", "variants", "motion", "a11y"];
var REQUIRED_SECTIONS = ["Anatomy", "Variants", "Motion", "Accessibility"];

function deriveCategoryFile(md) {
  var parsed = p.extractFrontmatter(md);
  var fm = parsed.frontmatter;

  REQUIRED_FRONTMATTER.forEach(function (k) {
    if (fm[k] === undefined) {
      throw new Error("missing required frontmatter field: " + k);
    }
  });
  REQUIRED_CONFIDENCE_KEYS.forEach(function (k) {
    if (!fm.confidence || fm.confidence[k] === undefined) {
      throw new Error("missing confidence." + k);
    }
  });

  var sections = p.extractSections(parsed.body);
  REQUIRED_SECTIONS.forEach(function (s) {
    if (sections[s] === undefined) {
      throw new Error("missing required H2 section: " + s);
    }
  });

  var anatomy = p.parseBulletList(sections.Anatomy);
  var axes = p.parseVariantAxes(sections.Variants);
  var motion = p.parseMotionPatterns(sections.Motion);
  var a11y = p.parseAccessibilityRequirements(sections.Accessibility);

  if (anatomy.length < 1) {
    throw new Error("anatomy parts: expected ≥1, got 0");
  }
  if (axes.length < 1) {
    throw new Error("variant axes: expected ≥1, got 0");
  }
  if (motion.length < 1) {
    throw new Error("motion patterns: expected ≥1, got 0");
  }
  if (a11y.length !== 6) {
    throw new Error(
      "accessibility requirements: expected 6, got " + a11y.length,
    );
  }

  return {
    slug: fm.slug,
    label: fm.label,
    authoring_status: fm.authoring_status,
    confidence: fm.confidence,
    last_reviewed: fm.last_reviewed,
    card_anatomy: { parts: anatomy },
    card_component: { variantAxes: axes },
    card_motion: { patterns: motion },
    card_accessibility: { requirements: a11y },
    _sourceFile: null, // set by deriveFromDir
    _generatedAt: new Date().toISOString(),
  };
}

function deriveFromDir(srcDir, distDir) {
  var files = fs.readdirSync(srcDir).filter(function (f) {
    return f.endsWith(".md") && f !== "AUTHORING.md";
  });
  var out = [];
  files.forEach(function (f) {
    var srcPath = path.join(srcDir, f);
    var md = fs.readFileSync(srcPath, "utf8");
    var result = deriveCategoryFile(md);
    result._sourceFile = path.relative(process.cwd(), srcPath);
    var outName = result.slug + "-defaults.json";
    var outPath = path.join(distDir, outName);
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
    out.push({ src: srcPath, dist: outPath });
  });
  return out;
}

module.exports = {
  deriveCategoryFile: deriveCategoryFile,
  deriveFromDir: deriveFromDir,
};
