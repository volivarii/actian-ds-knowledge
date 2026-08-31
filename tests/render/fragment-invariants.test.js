"use strict";

// tests/render/fragment-invariants.test.js
//
// Replaces what tests/render/all-35-oracle.test.js covered as migration
// safety. That oracle compared each derived fragment against a historical,
// frozen capture in components/render/src/. The migration it guarded
// completed and was verified end-to-end at renderer-relocation phase 2, so
// the comparison had become recurring toil rather than protection: a
// legitimate Figma sync reds it (see #447) and needs a human to reclassify a
// seed by hand every time facts change underneath it.
//
// scripts/render/fidelity-check.js validates colors only, and says so in its
// own comment ("Inline colors in the fragment markup are out of scope"). So
// once the frozen seeds -- and the oracle that diffs against them -- are
// retired, nothing else asserts a fragment is STRUCTURALLY sane: a fragment
// could render every cell as an empty string, or as the renderer's graceful
// failure chip, and every remaining gate would stay green. This file is that
// replacement.
//
// Every invariant below is derived from facts (the harness shape, the
// variant matrix, marker classes the renderer is known to emit) rather than
// pinned to a historical capture, so a legitimate Figma sync can never make
// this gate stale on its own.
//
// Asserted PER CELL, on the component's own root markup, never over the
// whole fragment string. A fragment-level check is vacuous here: the derive
// harness's grid wrapper and per-cell caption <span> are emitted regardless
// of whether the component itself rendered anything, and the renderer's own
// graceful-chip fallback carries the class "ds-component", which satisfies a
// naive "emits a ds- class" check trivially. See
// .superpowers/sdd/task-1-brief.md for the full rejection analysis of the
// fragment-level version this replaces.

var test = require("node:test");
var assert = require("node:assert/strict");

var D = require("../../scripts/render/derive-from-renderer.js");
var M = require("../../components/render/renderer/matrix.js");
// Live renderer, required (not copied) so invariant 9 below can pin the
// graceful-chip constants against actual renderer output rather than a
// second remembered string.
var dsHtmlMap = require("../../components/render/renderer/html-renderers/ds-html-map.js");

var RENDER_SLUGS = M.RENDER_SLUGS;
var variantMatrix = M.variantMatrix;
var groupFor = M.groupFor;
var deriveFragment = D.deriveFragment;

// Harness delimiters, copied EXACTLY from
// scripts/render/derive-from-renderer.js:51-63 (renderCell). Not imported:
// the derive module does not export them, and an exact copy is the point --
// if a future refactor changes the harness markup, invariant 6 below must
// fail loudly rather than the per-cell split silently degrading to "one cell
// that is the whole fragment", which would quietly weaken invariants 1-4.
var CELL_OPEN =
  '<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start">';
var CAPTION_OPEN = '<span style="font:12px/1.4 sans-serif;opacity:0.55">';
var CAPTION_CLOSE = "</span>";

// The renderer's graceful chip, verbatim from
// components/render/renderer/html-renderers/ds-html-map.js:233-239.
var GRACEFUL_CHIP_MARKER = '<span class="ds-component" data-slug=';

// A real ds- class, excluding the graceful chip's own "ds-component" class.
// The negative lookahead is required: without it the chip satisfies this
// check trivially, since "ds-component" itself starts with "ds-". The
// lookahead excludes the class TOKEN "ds-component" exactly (the class name
// ends there, followed by a space, a quote, or the end of the class list),
// not "\bcomponent\b", which also matches at a hyphen and would wrongly
// exclude a legitimate compound class such as "ds-component-header".
var REAL_DS_CLASS = /class="[^"]*\bds-(?!component(?:["\s]|$))/;

// A complete graceful-chip element (open tag + escaped name + close tag),
// verbatim from ds-html-map.js's gracefulChip(). Used to strip any embedded
// chip fallback out of a cell's markup before checking for REAL content, so
// invariant 2 below judges "did this cell render something" rather than
// "did this cell render something plus possibly a chip" -- a cell that is
// ENTIRELY the chip must have nothing left after stripping.
var CHIP_ELEMENT = /<span class="ds-component"[^>]*>[^<]*<\/span>/g;

function stripGracefulChips(html) {
  return html.replace(CHIP_ELEMENT, "");
}

// Split a derived fragment into its per-cell {component, label} pairs, in
// document order. Per cell the markup is CELL_OPEN + <rendered component> +
// CAPTION_OPEN + <label> + CAPTION_CLOSE + </div>; "component" below is
// everything between the cell-wrapper open tag and the caption span's open
// tag, per the harness markup in task-1-brief.md.
function splitCells(fragment) {
  var cells = [];
  var searchFrom = 0;
  while (true) {
    var cellStart = fragment.indexOf(CELL_OPEN, searchFrom);
    if (cellStart === -1) break;
    var contentStart = cellStart + CELL_OPEN.length;
    var captionStart = fragment.indexOf(CAPTION_OPEN, contentStart);
    if (captionStart === -1) {
      // A cell wrapper with no caption span after it: stop rather than loop
      // forever. Invariant 4's cell-count check catches the shortfall.
      break;
    }
    var component = fragment.slice(contentStart, captionStart);
    var labelStart = captionStart + CAPTION_OPEN.length;
    var labelEnd = fragment.indexOf(CAPTION_CLOSE, labelStart);
    var label = labelEnd === -1 ? "" : fragment.slice(labelStart, labelEnd);
    cells.push({ component: component, label: label });
    searchFrom =
      labelEnd === -1
        ? captionStart + CAPTION_OPEN.length
        : labelEnd + CAPTION_CLOSE.length;
  }
  return cells;
}

// Minimal HTML-escape, mirroring ds-html-map.js's esc() fallback (and
// fm-html-map.js's esc(), which is byte-identical). Kept independent
// deliberately, for oracle independence: esc() is exported
// (ds-html-map.js:1799, exports.esc = esc) and is exactly what the harness
// calls at derive-from-renderer.js:60, so it is reachable from here, but
// importing it would make invariant 4 blind to a bug in esc() itself, since
// the gate would then escape labels the same wrong way the harness did, and
// a broken esc() would never surface as a mismatch.
function escLabel(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Invariant 8: a slug silently removed from (or added to) the matrix would
// shrink or inflate coverage without reddening anything else in this file.
// RENDER_SLUGS is no longer a hand-written list: matrix.js derives it from
// the `case "<slug>":` branches in ds-html-map.js, so the drift this test was
// written for (a case + BUILT_SLUGS entry that never reached RENDER_SLUGS, and
// so never reached the canonical render library -- the 6-slug #465 miss) can no
// longer happen at all.
//
// The test is kept because it now checks something it could not check before.
// It used to compare two hand-written lists, so forgetting BOTH passed
// silently. It now compares the DERIVED set against ds-html-map's own
// BUILT_SLUGS literal, which is still hand-written because that module is
// browser-capable and cannot read its own source. So this catches the one
// remaining failure mode: a case added to the switch without adding it to
// BUILT_SLUGS, or a BUILT_SLUGS entry with no case behind it.
test("invariant 8: BUILT_SLUGS matches the switch cases RENDER_SLUGS derives from", function () {
  var render = RENDER_SLUGS.slice().sort();
  var built = dsHtmlMap.BUILT_SLUGS.slice().sort();
  assert.deepEqual(
    render,
    built,
    "RENDER_SLUGS and BUILT_SLUGS drifted: a slug is in one but not the other. " +
      "RENDER_SLUGS has " +
      RENDER_SLUGS.length +
      ", BUILT_SLUGS has " +
      dsHtmlMap.BUILT_SLUGS.length,
  );
});

// Invariant 5: cheap and independent of rendering, but it guards the bundle
// placement every slug needs.
//
// This asserted only that groupFor(slug) was TRUTHY, which was vacuous:
// groupFor in components/render/renderer/matrix.js ends in `|| "Components"`,
// so it can never return falsy and the check could never fail. It now asserts
// that no slug lands on that last-resort fallback, which is what "resolves a
// group" was always meant to mean: the slug was actually found in a registry
// and carries a real category.
//
// This matters more since the seeds retired. Their @dsCard marker was a frozen,
// independent second opinion on each slug's group; with them gone the group is
// sourced solely from the registry category, and open issue #428 is live
// category drift. A slug dropping out of all three registries would otherwise
// silently reclassify into "Components" with every gate green.
var GROUP_FALLBACK = "Components";

test("invariant 5: every slug resolves a real registry group, not the fallback", function () {
  var failures = [];
  RENDER_SLUGS.forEach(function (slug) {
    var group = groupFor(slug);
    if (!group) {
      failures.push(slug + ": no group at all");
    } else if (group === GROUP_FALLBACK) {
      failures.push(
        slug +
          ': fell back to "' +
          GROUP_FALLBACK +
          '" (missing from all three registries, or carrying neither category nor group)',
      );
    }
  });
  assert.deepEqual(failures, [], failures.join("; "));
});

// Invariant 6: if the harness markup ever changes shape, the per-cell split
// above would silently degrade to "one cell that is the whole fragment" and
// invariants 1-4 would weaken without failing. This makes that loud.
test("invariant 6: the harness shape is still what this gate assumes", function () {
  var missingRoot = [];
  var totalCells = 0;
  RENDER_SLUGS.forEach(function (slug) {
    var fragment = deriveFragment(slug);
    if (fragment.indexOf('id="fidelity-root"') === -1) missingRoot.push(slug);
    totalCells += splitCells(fragment).length;
  });
  assert.deepEqual(
    missingRoot,
    [],
    'fragments missing id="fidelity-root": ' + JSON.stringify(missingRoot),
  );
  assert.ok(
    totalCells > 0,
    "total cell-wrapper count across all render slugs is 0 -- the per-cell split " +
      "found nothing; either the harness markup changed or CELL_OPEN/CAPTION_OPEN " +
      "in this file are stale",
  );
});

// Invariant 9: the same self-guarding principle invariant 6 already applies
// to the harness constants (CELL_OPEN, CAPTION_OPEN), applied here to the
// graceful-chip constants above (GRACEFUL_CHIP_MARKER, REAL_DS_CLASS,
// CHIP_ELEMENT). All three are copied verbatim from gracefulChip() in
// ds-html-map.js rather than imported, and until this test nothing pinned
// them against the renderer's actual fallback markup: reshape
// gracefulChip() to something like `<div class="ds-fallback-chip"
// data-slug="...">...</div>` and every one of invariants 1, 2 and 3 passes
// silently on a fully degraded cell -- the marker string stops matching, so
// invariant 1 never sees a chip; CHIP_ELEMENT stops stripping it, so
// invariant 2 counts the bare chip as real component markup; and a class
// like "ds-fallback-chip" satisfies REAL_DS_CLASS's negative lookahead, so
// invariant 3 reads it as a real ds- class.
//
// Pinned against LIVE renderer output rather than a second remembered
// string, so a renderer change that breaks the pin fails here instead of
// leaving invariants 1-3 silently blind. "no-such-slug-xyz" has no case in
// the renderDSComponent switch and no anatomy doc, so it takes exactly the
// fallback path a real degraded cell would.
test("invariant 9: the graceful-chip constants still match the live renderer", function () {
  var chip = dsHtmlMap.renderDSComponent({
    dsSlug: "no-such-slug-xyz",
    name: "no-such-slug-xyz",
  });

  assert.ok(
    chip.indexOf(GRACEFUL_CHIP_MARKER) !== -1,
    "GRACEFUL_CHIP_MARKER no longer matches the live graceful chip (" +
      chip +
      ") -- gracefulChip() in ds-html-map.js changed shape, and invariant 1 " +
      "has silently stopped detecting a degraded cell",
  );

  var stripped = chip.replace(CHIP_ELEMENT, "");
  assert.equal(
    stripped,
    "",
    'CHIP_ELEMENT does not fully strip the live graceful chip (left over: "' +
      stripped +
      '") -- gracefulChip() in ds-html-map.js changed shape, and invariant 2 ' +
      "would now count a bare chip as real component markup",
  );

  assert.equal(
    REAL_DS_CLASS.test(chip),
    false,
    "REAL_DS_CLASS matches the live graceful chip's own markup -- " +
      "gracefulChip() in ds-html-map.js changed shape (its class no longer " +
      'reads as "ds-component"), and invariant 3 would now accept a ' +
      "degraded cell as carrying a real ds- class",
  );
});

// Invariant 1: the single most important assertion in this file. A cell that
// silently degraded to the renderer's never-throws fallback must redden here.
test("invariant 1: zero cells degrade to a graceful chip", function () {
  var failures = [];
  RENDER_SLUGS.forEach(function (slug) {
    var fragment = deriveFragment(slug);
    var count = fragment.split(GRACEFUL_CHIP_MARKER).length - 1;
    if (count !== 0) {
      failures.push(slug + ": " + count + " graceful chip(s) found");
    }
  });
  assert.deepEqual(failures, [], failures.join("; "));
});

// Invariant 2: a cell that renders empty string is invisible to a
// fragment-level length or "contains X" check, since the wrapper div and the
// caption span are emitted either way. Judged after stripping any embedded
// graceful chip, so a cell that is ENTIRELY the chip (the full-degrade
// mutation) has nothing real left and fails here too, not only under
// invariants 1 and 3.
//
// Self-guarding: this is one of the two invariants left standing once the
// all-35 oracle is deleted, so it cannot rely on invariant 4 (or invariant 6)
// to catch a splitCells() that quietly returns zero cells. Before judging any
// cell content, each slug's cell count is checked against
// variantMatrix(slug).length; zero cells, or any mismatch, fails THIS
// invariant directly instead of leaving forEach a no-op over an empty array.
test("invariant 2: every cell renders real component markup", function () {
  var failures = [];
  RENDER_SLUGS.forEach(function (slug) {
    var fragment = deriveFragment(slug);
    var cells = splitCells(fragment);
    var expectedCount = variantMatrix(slug).length;
    if (cells.length === 0 || cells.length !== expectedCount) {
      failures.push(
        slug +
          ": " +
          cells.length +
          " cell(s) found by splitCells, expected " +
          expectedCount +
          " -- cannot judge cell content when the split did not find the " +
          "expected cells",
      );
      return;
    }
    cells.forEach(function (cell, i) {
      var comp = stripGracefulChips(cell.component);
      if (!comp || !comp.trim()) {
        failures.push(slug + " cell " + i + ": empty component markup");
      } else if (!/<[a-zA-Z][^>]*>/.test(comp)) {
        failures.push(
          slug + " cell " + i + ": no HTML tag found in component markup",
        );
      }
    });
  });
  assert.deepEqual(failures, [], failures.join("; "));
});

// Invariant 3: every cell must emit a REAL ds- class, not just any ds-
// prefixed string -- the graceful chip's own class is "ds-component", which
// would satisfy a naive /\bds-/ check.
//
// Self-guarding for the same reason as invariant 2: it is one of the two
// invariants left standing once the all-35 oracle is deleted, so it cannot
// rely on a sibling test to catch a splitCells() that quietly returns zero
// cells. Each slug's cell count is checked against variantMatrix(slug).length
// before judging any class; zero cells, or any mismatch, fails THIS
// invariant directly.
test("invariant 3: every cell emits a real ds- class (not the graceful chip's own)", function () {
  var failures = [];
  RENDER_SLUGS.forEach(function (slug) {
    var fragment = deriveFragment(slug);
    var cells = splitCells(fragment);
    var expectedCount = variantMatrix(slug).length;
    if (cells.length === 0 || cells.length !== expectedCount) {
      failures.push(
        slug +
          ": " +
          cells.length +
          " cell(s) found by splitCells, expected " +
          expectedCount +
          " -- cannot judge cell classes when the split did not find the " +
          "expected cells",
      );
      return;
    }
    cells.forEach(function (cell, i) {
      if (!REAL_DS_CLASS.test(cell.component)) {
        failures.push(slug + " cell " + i + ": no real ds- class found");
      }
    });
  });
  assert.deepEqual(failures, [], failures.join("; "));
});

// Invariant 4: a dropped (or duplicated) cell silently shrinks (or pads) the
// card. Checked both by count and, once counts agree, by label so a cell
// that swapped position with another still surfaces as a mismatch.
test("invariant 4: cell count and labels match the variant matrix", function () {
  var countFailures = [];
  var labelFailures = [];
  RENDER_SLUGS.forEach(function (slug) {
    var fragment = deriveFragment(slug);
    var cells = splitCells(fragment);
    var matrix = variantMatrix(slug);
    if (cells.length !== matrix.length) {
      countFailures.push(
        slug +
          ": " +
          cells.length +
          " cell(s) rendered, matrix has " +
          matrix.length,
      );
      return; // index-by-index label comparison is meaningless once counts differ
    }
    matrix.forEach(function (mCell, i) {
      var expected = escLabel(mCell.label);
      if (cells[i].label !== expected) {
        labelFailures.push(
          slug +
            " cell " +
            i +
            ': label "' +
            cells[i].label +
            '", expected "' +
            expected +
            '"',
        );
      }
    });
  });
  assert.deepEqual(
    countFailures,
    [],
    "cell-count mismatches: " + countFailures.join("; "),
  );
  assert.deepEqual(
    labelFailures,
    [],
    "label mismatches: " + labelFailures.join("; "),
  );
});

// Invariant 7: pins the phase-1b fixes by MARKER, not by frozen capture, so
// this gate keeps catching a regression of the Selected==='Yes' bug class
// even after the byte-identity oracle that used to guard it is gone.
test("invariant 7: the phase-1b fixes stay fixed", function () {
  var MARKERS = {
    "read-only-tag": /ds-tag--/,
    checkbox: /ds-checkbox--(checked|indeterminate)/,
    "radio": /ds-radio--checked/,
    toggle: /ds-toggle--on/,
  };
  var failures = [];
  Object.keys(MARKERS).forEach(function (slug) {
    var fragment = deriveFragment(slug);
    if (!MARKERS[slug].test(fragment)) {
      failures.push(slug + ": expected " + MARKERS[slug] + " not found");
    }
  });
  assert.deepEqual(failures, [], failures.join("; "));
});

// Invariant 10: a curated MATRIX_OVERRIDES cell may only name a variant value
// the registry actually carries.
//
// MATRIX_OVERRIDES exists so a component's gallery shows its real identity axis
// instead of a bare stub, which means each cell restates a fact the registry
// already owns. That copy goes stale silently: the 2026-07-23 Figma sync cut
// tag-status from 11 Status values to 5, and the override kept rendering all
// 11, so six cells drew a component the design system no longer has. Nothing
// failed, because a curated override is authoritative for the gallery by
// design. Fabricated output is worse than a missing cell: a consumer cannot
// tell it apart from a real one.
//
// Derived from the registry, so it carries no hand-maintained count and stays
// correct as Figma moves.
test("invariant 10: every MATRIX_OVERRIDES cell names a variant value the registry has", function () {
  var offenders = [];
  // Per the repo rule that a gate whose subject can be absent must assert the
  // subject was present: if findComponent ever returned null for every slug,
  // every axis would be skipped and this would pass having compared nothing.
  var compared = 0;
  Object.keys(M.MATRIX_OVERRIDES).forEach(function (slug) {
    var comp = M.findComponent(slug);
    var variants = (comp && comp.variants) || {};
    M.MATRIX_OVERRIDES[slug].forEach(function (cell) {
      String(cell.variant || "")
        .split(",")
        .forEach(function (pair) {
          var kv = pair.split("=");
          if (kv.length !== 2) return;
          var axis = kv[0].trim();
          var value = kv[1].trim();
          var known = variants[axis];
          // An axis the registry does not declare at all is out of scope here:
          // several overrides drive props rather than registry axes.
          if (!known) return;
          compared++;
          if (known.indexOf(value) === -1) {
            offenders.push(slug + " " + axis + "=" + value);
          }
        });
    });
  });
  assert.ok(
    compared > 0,
    "this invariant compared nothing: every override axis resolved to no " +
      "registry variant list, so it would pass vacuously",
  );
  assert.deepEqual(
    offenders,
    [],
    "override cells naming a variant value the registry no longer has, so the " +
      "gallery renders a component that does not exist: " +
      JSON.stringify(offenders),
  );
});
