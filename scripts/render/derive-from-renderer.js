"use strict";

// derive-from-renderer.js: run the relocated renderer (components/render/renderer/)
// over a component's variant matrix (matrix.js) and produce that slug's fragment.
// This is the single source of every fragment in the canonical render dist.
//
// It began as the byte-identity oracle for renderer-relocation phase 1a, pinned
// against the frozen captures the plugin's capture-seed.js used to write into
// components/render/src/, which proved the port from the plugin preserved
// behavior exactly. Phase 3 retired those captures: the migration completed and
// was verified end-to-end at phase 2, so this module is now simply the producer.
// tests/render/fragment-invariants.test.js asserts its output is structurally
// sound from facts rather than against a historical capture.
//
// The wrapper shape below WAS reproduced verbatim from the plugin's
// render/capture-seed.js (captureMatrix, renderCell) and render-leaf.js
// (readySignalScript), which were NOT copied to knowledge; only their exact
// output shape was needed here. See .superpowers/sdd/task-5-prep.md for the
// verified source citations. The ready signal still is verbatim. The gallery
// wrapper is NOT: capture-seed built markup to be photographed, and once this
// dist became the artifact the plugin, the Claude Design bundle and the
// editor's render panel ship, the gallery's nested flex sizing was
// shrink-wrapping every non-inline component and its caption <span> was
// shipping as unthemed furniture. See renderCell below and
// tests/render/fragment-is-the-component.test.js.

var fs = require("node:fs");
var path = require("node:path");

var M = require("../../components/render/renderer/matrix.js");
var dsMap = require("../../components/render/renderer/html-renderers/ds-html-map.js");

var REPO_ROOT = path.resolve(__dirname, "..", "..");
var ICONS_PATH = path.join(
  REPO_ROOT,
  "components",
  "dist",
  "icons",
  "icons.json",
);
var GRAPHICS_PATH = path.join(
  REPO_ROOT,
  "components",
  "dist",
  "graphics",
  "graphics.json",
);

// The plugin's render-leaf.js readySignalScript(), verbatim (fixed string, no
// per-slug variation).
var READY_SIGNAL =
  "<script>document.fonts.ready.then(function(){requestAnimationFrame(function(){" +
  "document.documentElement.setAttribute('data-fidelity-ready','1');});});</script>";

// Lazily loaded + cached: the { slug: {viewBox, body} } icon map the plugin's
// module-level dsIcons used to carry (populated there from lib/paths, absent in
// knowledge). Injected per-render via dsMap.setIcons and reset in a finally.
var _iconMap = null;
function loadIconMap() {
  if (_iconMap === null) {
    _iconMap = require(ICONS_PATH).icons || {};
  }
  return _iconMap;
}

// Same lazy-load-and-cache shape as loadIconMap, but graphics.json is a newer
// dist and may not exist yet on disk (or in an older checkout); absent -> {},
// artwork simply doesn't render, no throw.
var _graphicMap = null;
function loadGraphicMap() {
  if (_graphicMap === null) {
    try {
      _graphicMap = require(GRAPHICS_PATH).graphics || {};
    } catch (e) {
      _graphicMap = {};
    }
  }
  return _graphicMap;
}

// One variant cell = the rendered component inside a bare block-level wrapper
// that names the variant as DATA.
//
// It used to be the component plus a visible caption <span>, inside a column
// with align-items:flex-start, inside a flex-wrap row -- the gallery the
// plugin's capture-seed.js built to be SCREENSHOTTED. Shipping that harness as
// the artifact had two costs: the nested flex sizing shrink-wrapped every
// non-inline component (.ds-action-bar drew at content width despite its own
// width:100%), and the caption rode along into the plugin, the Claude Design
// bundle and the editor panel as unthemed "font:12px/1.4 sans-serif" furniture.
//
// So the wrapper carries no class -- fidelity-check.js's fragmentClasses()
// reads every class off this markup, and a harness class would enter the
// css-owners analysis -- and no inline style, which is what did the
// shrink-wrapping. Block-level and unstyled, it lets a component's own rule
// decide its width. The label stays as data-render-cell so the variant a cell
// renders is still recoverable from the fragment alone, which is what
// fragment-invariants.test.js splits on.
function renderCell(label, html) {
  return '<div data-render-cell="' + dsMap.esc(label) + '">' + html + "</div>";
}

// --- layout ------------------------------------------------------------------
//
// How the cells sit together follows the component's OWN display, which
// ds-base.css already declares. A component that fills its container gets the
// full-width column #637 introduced; one that is inline by nature gets a
// wrapping row, because stacking 28 small tags one per row is a worse drawing
// for no reason. Nothing here is a list of component names: the fact is read
// from the stylesheet and from the markup the renderer just produced.
//
// 🪤 Strip comments BEFORE matching selectors. Rules in this sheet are routinely
// preceded by a `/* ... */` note, and a selector regex run first swallows the
// note into the selector, so every rule reads as unmatched and the map comes
// back empty -- indistinguishable from "nothing declares a display", and it
// silently sends every component down the same branch.
var CSS_PATH = path.join(
  REPO_ROOT,
  "components",
  "render",
  "renderer",
  "ds-base.css",
);
var _displays = null;
function loadDisplays() {
  if (_displays === null) {
    var css = fs
      .readFileSync(CSS_PATH, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ");
    _displays = {};
    var rule = /([^{}]+)\{([^{}]*)\}/g;
    var m;
    while ((m = rule.exec(css)) !== null) {
      var d = /(?:^|[;\s])display:\s*([a-z-]+)/.exec(m[2]);
      if (!d) continue;
      m[1].split(",").forEach(function (sel) {
        var one = /^\.([a-z0-9-]+)$/.exec(sel.trim().replace(/\s+/g, " "));
        if (one && !(one[1] in _displays)) _displays[one[1]] = d[1];
      });
    }
  }
  return _displays;
}

// HTML's own defaults, for a root whose class declares no display (`.ds-table`
// on a <table>, `.ds-scroll-bar` on a <div>). A property of the platform, so it
// cannot drift with a Figma sync; anything not named here is treated as
// block-level, which is the safe direction -- the column can only make an inline
// component wider than it needs, while the row is what squashed a width:100%
// component before #637.
var INLINE_TAGS = {
  a: 1,
  abbr: 1,
  button: 1,
  code: 1,
  em: 1,
  img: 1,
  input: 1,
  label: 1,
  select: 1,
  small: 1,
  span: 1,
  strong: 1,
  svg: 1,
  textarea: 1,
};

function rootIsInline(html) {
  var m = /^\s*<([a-z]+)([^>]*)>/.exec(html);
  if (!m) return false;
  var cls = (/class="([^"]*)"/.exec(m[2]) || [])[1] || "";
  var root = cls.split(/\s+/).filter(function (c) {
    return (
      /^(ds|fm)-/.test(c) && c.indexOf("--") === -1 && c.indexOf("__") === -1
    );
  })[0];
  var displays = loadDisplays();
  if (root && Object.prototype.hasOwnProperty.call(displays, root)) {
    return displays[root].indexOf("inline") === 0;
  }
  return !!INLINE_TAGS[m[1]];
}

var ROW_STYLE = "display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start";
var COLUMN_STYLE = "display:flex;flex-direction:column;gap:24px";

// A row only when EVERY cell is inline-rooted. A mixed slug takes the column:
// guessing wrong toward the row is the regression #637 fixed.
//
// `align-items:flex-start` on the row is the cross axis, so it top-aligns cells
// and does not touch their width. It was the per-cell COLUMN's align-items that
// shrink-wrapped components before #637, not this one.
function layoutStyleFor(cells) {
  var allInline =
    cells.length > 0 &&
    cells.every(function (c) {
      return rootIsInline(c.html);
    });
  return allInline ? ROW_STYLE : COLUMN_STYLE;
}

// Run the relocated renderer over a slug's variant matrix and produce the
// fragment markup the canonical render dist ships for it.
function deriveFragment(slug) {
  dsMap.setIcons(loadIconMap());
  dsMap.setGraphics(loadGraphicMap());
  try {
    // Render first, then choose the layout from what came back: the cells' own
    // roots are the evidence. A column's align-items defaults to `stretch`, so a
    // cell fills the root's width and a component that says width:100% finally
    // gets it; `gap` separates cells without the trailing margin per-cell
    // margins would leave.
    var cells = M.variantMatrix(slug).map(function (cell) {
      return {
        label: cell.label,
        html: dsMap.renderDSComponent({
          dsSlug: slug,
          variant: cell.variant,
          props: cell.props || {},
        }),
      };
    });
    var body = cells
      .map(function (c) {
        return renderCell(c.label, c.html);
      })
      .join("");
    return (
      '<div id="fidelity-root" data-slug="' +
      dsMap.esc(slug) +
      '" style="' +
      layoutStyleFor(cells) +
      '">' +
      body +
      "</div>" +
      READY_SIGNAL
    );
  } finally {
    dsMap.setIcons(null);
    dsMap.setGraphics(null);
  }
}

module.exports = { deriveFragment: deriveFragment };
