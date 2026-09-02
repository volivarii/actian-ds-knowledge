"use strict";

// tests/render/fragment-is-the-component.test.js
//
// The fragment we SHIP has to be the component, not the photo harness.
//
// deriveFragment began life as the plugin's capture-seed.js: markup built to be
// SCREENSHOTTED for the fidelity oracle, so it wrapped every variant in a
// gallery — a flex-wrap row of columns, each column holding the component plus
// a caption <span> naming the variant. That markup is now the artifact the
// plugin, the Claude Design bundle and the editor's render panel all ship, and
// two of its properties are wrong once it is a product rather than a photo:
//
//   1. The nested flex sizing shrink-wraps the component. A cell column is a
//      flex item in a row, so its width is max-content, and align-items:
//      flex-start inside the column stops the component filling even that. So
//      .ds-action-bar drew ~200px wide while its own rule says width: 100%.
//      33 of 61 component roots are non-inline; all 7 that declare width: 100%
//      (action-bar, appearance, collapse, drawer, graphic, modal, table) were
//      rendered at content width, which for a modal or a table is meaningless.
//   2. The caption <span> is unthemed apparatus — a raw
//      "font:12px/1.4 sans-serif" label — sitting inside what the editor panel
//      calls "the HTML the plugin and the Claude Design bundle ship for this
//      component". Consumers were getting gallery furniture.
//
// What must NOT change: the fragment still carries EVERY matrix cell. The
// fidelity gate's css-owners analysis reads the class set off the whole
// fragment (fidelity-check.js:593-598 — "A render fragment shows every matrix
// cell in its gallery"), so reducing the fragment to one variant would silently
// drop modifier classes and orphan the rules that claim them. Test 3 is that
// preservation guard. It keys on the NEW delimiter, so it fails before the
// change like the other two; what it pins is the COUNT — one wrapper per matrix
// cell, checked against matrix.js rather than against a remembered number.

var test = require("node:test");
var assert = require("node:assert/strict");

var D = require("../../scripts/render/derive-from-renderer.js");
var M = require("../../components/render/renderer/matrix.js");

// The harness markup this change removes, verbatim from the revision that
// emitted it (derive-from-renderer.js renderCell/deriveFragment). Pinned as
// exact strings so the test names what it forbids rather than pattern-matching
// something a component could legitimately contain in its own inline style.
var GALLERY_ROW =
  '<div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start">';
var CELL_COLUMN =
  '<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start">';
var CAPTION_OPEN = '<span style="font:12px/1.4 sans-serif;opacity:0.55">';

// The delimiter the fragment uses instead: a bare block-level wrapper carrying
// the variant label as DATA. No class (fragmentClasses() would see it), no
// inline style (that is what shrink-wrapped the component).
var CELL_ATTR = "data-render-cell=";

test("no fragment carries the gallery layout that shrink-wrapped the component", function () {
  var offenders = [];
  M.RENDER_SLUGS.forEach(function (slug) {
    var html = D.deriveFragment(slug);
    if (html.indexOf(GALLERY_ROW) !== -1)
      offenders.push(slug + ": gallery row");
    if (html.indexOf(CELL_COLUMN) !== -1)
      offenders.push(slug + ": cell column");
  });
  assert.deepEqual(
    offenders,
    [],
    offenders.length +
      " fragment(s) still wrapped in the photo harness:\n" +
      offenders.join("\n"),
  );
});

test("no fragment carries the unthemed caption span", function () {
  var offenders = M.RENDER_SLUGS.filter(function (slug) {
    return D.deriveFragment(slug).indexOf(CAPTION_OPEN) !== -1;
  });
  assert.deepEqual(
    offenders,
    [],
    offenders.length +
      " fragment(s) still ship a gallery caption: " +
      offenders.join(", "),
  );
});

// Preservation guard — see the header. Pins the COUNT against matrix.js.
test("every fragment still carries one wrapper per matrix cell", function () {
  var wrong = [];
  M.RENDER_SLUGS.forEach(function (slug) {
    var html = D.deriveFragment(slug);
    var expected = M.variantMatrix(slug).length;
    var actual = html.split(CELL_ATTR).length - 1;
    if (actual !== expected) {
      wrong.push(slug + ": " + actual + " cells, matrix has " + expected);
    }
  });
  assert.deepEqual(wrong, [], wrong.join("\n"));
});
