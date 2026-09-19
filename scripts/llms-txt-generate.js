"use strict";

var fs = require("node:fs");
var path = require("node:path");

var ROOT = path.resolve(__dirname, "..");

// The generator's COMPLETE input set is:
//   - foundations/src/**        (concatFoundationsSources, below)
//   - accessibility/src/**      (concatA11ySources, below)
//   - content/dist/global.md    (read verbatim in generateLlmsFullTxt)
// Nothing else is read. paths-manifest.json used to be parsed here into an
// unused variable, which made the derive look manifest-dependent and put
// `paths-manifest.json` on the regeneration trigger for no reason; the trigger
// list in .github/workflows/llms-txt.yml now mirrors the real inputs (#525).

// Defer to the derive scripts' canonical concat helpers so the llms-full dump
// always matches the dist verbatim copy byte-for-byte (modulo the anchor-strip
// pass). Avoids two independent join strategies for the same src/ trees.
var deriveFoundations = require("./foundations/derive-foundations.js");
var deriveA11y = require("./accessibility/derive-a11y-index.js");

function readAccessibilityProse() {
  return deriveA11y.concatA11ySources(path.join(ROOT, "accessibility", "src"));
}

function readFoundationsProse() {
  return deriveFoundations.concatFoundationsSources(
    path.join(ROOT, "foundations", "src"),
  );
}

// Strip explicit `{#kebab-slug}` markers from concatenated MD source.
//
// accessibility.md and foundations.md carry author-declared anchors as the
// stable consumer-facing slug contract (Substrate Doctrine P6; R6 pre-build
// D1+D2). The anchors are correct in source — they are the consumer
// addressing key. But the public `llms-full.txt` is a clean-prose knowledge
// dump for LLM consumers that don't care about anchor identity; the literal
// `{#...}` markers add noise without value.
//
// We strip them only at the end of a heading line (`## Heading {#slug}`)
// or at the end of a bold-paragraph line (`**Pattern** {#slug}`) — the two
// shapes this repo emits. Anchor markers anywhere else in prose stay put.
function stripAnchorMarkers(md) {
  return md
    .replace(/^(\s*#{1,6}\s+[^\n]*?)\s+\{#[a-z0-9-]+\}(\s*)$/gm, "$1$2")
    .replace(/^(\s*\*\*[^*\n]+\*\*)\s+\{#[a-z0-9-]+\}(\s*)$/gm, "$1$2");
}

function generateLlmsTxt() {
  var lines = [
    "# Actian Design System knowledge layer",
    "",
    "> Knowledge base for the Actian Design System (DS 2026). Tokens, content guidelines, accessibility patterns, component metadata.",
    "",
    "## Foundations",
    "",
    "- [Foundations spec](foundations/src/): primitives, scales, tokens reference, per-section files",
    "",
    "## Tokens",
    "",
    "- [Design tokens (W3C DTCG)](tokens/tokens.json): color, spacing, type, motion; 3 themes (Actian, Studio, Explorer)",
    "- [Token reference](tokens/token-reference.md): human-readable token catalog",
    "",
    "## Content",
    "",
    "- [Content guidelines — global topics](content/dist/global.md): voice, tone, capitalization, words to avoid, UX-pattern topics",
    "- [Writing bucket](content/dist/writing.md): just the writing rules (voice, tone, capitalization, punctuation, words to avoid)",
    "- [Patterns bucket](content/dist/patterns.md): just the UX-pattern content topics (states, forms, notifications, validation, wizards)",
    "- [Product bucket](content/dist/product.md): just the Actian product-surface rules (lineage UI, preview panels)",
    "- [Per-component content guidelines](components/dist/guidelines/): each `<slug>.json` carries `domains.content` for component-scoped copy rules",
    "",
    "## Accessibility",
    "",
    "- [WCAG 2.2 AA guidance](accessibility/src/): applied rules + criteria, per-section files",
    "",
    "## App context",
    "",
    "- [App context](app-context/dist/app-context.json): Actian apps, domain entities, terminology, and UX patterns",
    "",
    "## Components",
    "",
    "- [DS Kit registry](components/dist/registries/dskit.json)",
    "- [Component categories](components/dist/categories.json)",
    "",
    "## Derived views and connectors",
    "",
    "- [Component anatomy](components/dist/anatomy.bundle.json): per-component structure trees with resolved appearance (fill, border, radius, type)",
    "- [Component media](components/dist/media/): per-component preview and default-variant captures (webp)",
    "- [Knowledge graph](graph/dist/graph.json): typed cross-domain nodes and edges; also graph/dist/graph.jsonld (JSON-LD linked-data view)",
    "",
    "## Building a screen",
    "",
    "Everything needed to draw an Actian product screen as HTML, in the order a reader uses it:",
    "",
    "- [App chrome and navigation](app-context/src/apps/): one file per app (Studio, Explorer, Administration) with its header, side navigation and use cases",
    "- [Captured product pages](app-context/dist/recipes/): one real page per file, with its regions (`slots`), what the renderer reads (`renderNotes`) and a node tree; a captured page's product screenshot, when it ships one, is in [app-context/src/recipes/captures/](app-context/src/recipes/captures/), and it is the fastest way to see what the page looks like",
    "- [Captured page sections](app-context/dist/sections/): the parts the product repeats across pages (item header, control bar, drawer header)",
    "- [Component markup](components/render/dist/fragments/): one HTML file per component, one cell per variant the renderer draws, in the design system's own classes",
    "- [Stylesheet](components/render/dist/render.css): the tokens and the component styles in one file, themed with `data-theme` (`actian`, `studio`, `explorer`); [fonts](components/render/dist/render-fonts.css) are separate",
    "- [Icons](components/dist/icons/icons.json): SVG geometry per icon slug",
    "- [What each component draws](components/render/dist/render-contract.json): the props and variant values the renderer honours, per component",
    "- [Product terminology](app-context/src/terminology.yml), with the content buckets above: the words a screen uses",
    "",
    "## Manifest",
    "",
    "- [paths-manifest.json](paths-manifest.json): machine-readable contract for consumers",
  ];
  return lines.join("\n") + "\n";
}

function generateLlmsFullTxt() {
  // Append authored MD content + key JSONs.
  //
  // Anchor markers (`{#slug}` on headings and bold-pattern lines) are
  // stripped from the LLM-facing dump — they're the consumer addressing
  // contract in source (P6), but unnecessary noise in a clean-prose digest.
  var sections = [
    "# Actian Design System — Full Knowledge Dump",
    "",
    "## Foundations",
    "",
    stripAnchorMarkers(readFoundationsProse()),
    "",
    "## Content",
    "",
    fs.readFileSync(path.join(ROOT, "content/dist/global.md"), "utf8"),
    "",
    "## Accessibility",
    "",
    stripAnchorMarkers(readAccessibilityProse()),
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
  stripAnchorMarkers: stripAnchorMarkers,
};
