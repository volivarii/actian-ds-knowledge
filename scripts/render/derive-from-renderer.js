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
// The wrapper shape below (fidelity-root div + grid + per-cell wrapper + ready
// signal) is reproduced verbatim from the plugin's render/capture-seed.js
// (captureMatrix, renderCell) and render-leaf.js (readySignalScript), which were
// NOT copied to knowledge; only their exact output shape is needed here. See
// .superpowers/sdd/task-5-prep.md for the verified source citations.

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

// capture-seed.js renderCell(slug, cell): one variant cell = the rendered
// component + its label caption, stacked in a column.
function renderCell(slug, cell) {
  return (
    '<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start">' +
    dsMap.renderDSComponent({
      dsSlug: slug,
      variant: cell.variant,
      props: cell.props || {},
    }) +
    '<span style="font:12px/1.4 sans-serif;opacity:0.55">' +
    dsMap.esc(cell.label) +
    "</span></div>"
  );
}

// Run the relocated renderer over a slug's variant matrix and produce the
// fragment markup the canonical render dist ships for it.
function deriveFragment(slug) {
  dsMap.setIcons(loadIconMap());
  try {
    var grid =
      '<div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start">' +
      M.variantMatrix(slug)
        .map(function (cell) {
          return renderCell(slug, cell);
        })
        .join("") +
      "</div>";
    return (
      '<div id="fidelity-root" data-slug="' +
      dsMap.esc(slug) +
      '">' +
      grid +
      "</div>" +
      READY_SIGNAL
    );
  } finally {
    dsMap.setIcons(null);
  }
}

module.exports = { deriveFragment: deriveFragment };
