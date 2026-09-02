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
function renderCell(slug, cell) {
  return (
    '<div data-render-cell="' +
    dsMap.esc(cell.label) +
    '">' +
    dsMap.renderDSComponent({
      dsSlug: slug,
      variant: cell.variant,
      props: cell.props || {},
    }) +
    "</div>"
  );
}

// Run the relocated renderer over a slug's variant matrix and produce the
// fragment markup the canonical render dist ships for it.
function deriveFragment(slug) {
  dsMap.setIcons(loadIconMap());
  dsMap.setGraphics(loadGraphicMap());
  try {
    // A column, not a flex-wrap row. align-items defaults to `stretch`, so a
    // cell fills the root's width and a component that says width:100% finally
    // gets it; `gap` separates the cells without leaving a trailing margin the
    // way per-cell margins would.
    var cells = M.variantMatrix(slug)
      .map(function (cell) {
        return renderCell(slug, cell);
      })
      .join("");
    return (
      '<div id="fidelity-root" data-slug="' +
      dsMap.esc(slug) +
      '" style="display:flex;flex-direction:column;gap:24px">' +
      cells +
      "</div>" +
      READY_SIGNAL
    );
  } finally {
    dsMap.setIcons(null);
    dsMap.setGraphics(null);
  }
}

module.exports = { deriveFragment: deriveFragment };
