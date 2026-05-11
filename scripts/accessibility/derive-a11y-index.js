"use strict";

var fs = require("node:fs");
var path = require("node:path");

function deriveA11yIndex(md) {
  var lines = md.split("\n");
  var sections = [];
  var current = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var m = line.match(/^##\s+(.+?)\s*\{#([a-z][a-z0-9-]*)\}\s*$/);
    if (m) {
      if (current) sections.push(current);
      current = {
        slug: m[2],
        title: m[1].trim(),
        wcag: [],
        body_excerpt: ""
      };
      continue;
    }
    if (current && /WCAG\s+(\d+\.\d+\.\d+)/.test(line)) {
      var wcagMatches = line.match(/\d+\.\d+\.\d+/g) || [];
      current.wcag = current.wcag.concat(wcagMatches);
    }
    if (current && line.trim() && !line.match(/^#+\s/) && current.body_excerpt.length < 200) {
      current.body_excerpt += (current.body_excerpt ? " " : "") + line.trim();
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
      do_not_edit: "Edit the source MD; CI regenerates this file."
    },
    sections: sections
  };
}

if (require.main === module) {
  var srcPath = path.resolve(__dirname, "..", "..", "accessibility", "accessibility.md");
  var distPath = path.resolve(__dirname, "..", "..", "accessibility", "dist", "a11y-index.json");
  var md = fs.readFileSync(srcPath, "utf8");
  var idx = deriveA11yIndex(md);
  fs.mkdirSync(path.dirname(distPath), { recursive: true });
  fs.writeFileSync(distPath, JSON.stringify(idx, null, 2) + "\n");
  console.log("Derived " + idx.sections.length + " sections → " + distPath);
}

module.exports = { deriveA11yIndex: deriveA11yIndex };
