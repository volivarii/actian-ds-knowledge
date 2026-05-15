"use strict";

var fs = require("node:fs");
var path = require("node:path");

var ROOT = path.resolve(__dirname, "..");
var manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "paths-manifest.json"), "utf8"),
);

function generateLlmsTxt() {
  var lines = [
    "# Actian Design System knowledge layer",
    "",
    "> Knowledge base for the Actian Design System (DS 2026). Tokens, content guidelines, accessibility patterns, component metadata.",
    "",
    "## Foundations",
    "",
    "- [Foundations spec](foundations/src/foundations.md): primitives, scales, tokens reference",
    "",
    "## Content",
    "",
    "- [Content guidelines — global topics](content/dist/global.md): voice, tone, capitalization, words to avoid, UX-pattern topics",
    "- [Per-component content guidelines](components/dist/guidelines/): each `<slug>.json` carries `domains.content` for component-scoped copy rules",
    "",
    "## Accessibility",
    "",
    "- [WCAG 2.2 AA guidance](accessibility/accessibility.md): applied rules + criteria",
    "",
    "## Components",
    "",
    "- [DS Kit registry](components/dist/registries/dskit.json)",
    "- [Component categories](components/dist/categories.json)",
    "",
    "## Manifest",
    "",
    "- [paths-manifest.json](paths-manifest.json): machine-readable contract for consumers",
  ];
  return lines.join("\n") + "\n";
}

function generateLlmsFullTxt() {
  // Append authored MD content + key JSONs
  var sections = [
    "# Actian Design System — Full Knowledge Dump",
    "",
    "## Foundations",
    "",
    fs.readFileSync(path.join(ROOT, "foundations/src/foundations.md"), "utf8"),
    "",
    "## Content",
    "",
    fs.readFileSync(path.join(ROOT, "content/dist/global.md"), "utf8"),
    "",
    "## Accessibility",
    "",
    fs.readFileSync(path.join(ROOT, "accessibility/accessibility.md"), "utf8"),
  ];
  return sections.join("\n") + "\n";
}

if (require.main === module) {
  fs.writeFileSync(path.join(ROOT, "llms.txt"), generateLlmsTxt());
  fs.writeFileSync(path.join(ROOT, "llms-full.txt"), generateLlmsFullTxt());
  console.log("Generated llms.txt + llms-full.txt");
}

module.exports = {
  generateLlmsTxt: generateLlmsTxt,
  generateLlmsFullTxt: generateLlmsFullTxt,
};
