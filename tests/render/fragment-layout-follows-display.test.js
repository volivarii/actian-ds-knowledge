"use strict";

// tests/render/fragment-layout-follows-display.test.js
//
// #637 replaced the photo-harness gallery with a single column root, one
// full-width cell per variant. That is right for a component that fills its
// container and wrong for one that does not, and the renderer already holds the
// fact that decides it: the root's own `display`, declared in ds-base.css.
//
// Shipped as a flat column, 24 of the 56 slugs are inline-rooted and their
// variants stack one per row: `item-type-tag` becomes a 28-row column of small
// tags, `read-only-tag` 14. Nothing renders wrongly, but the card is far worse
// to read than a wrapped row, for a reason already written down in the sheet.
//
// So the assertion here is the JOIN, not the outcome: for every slug, the layout
// the fragment uses agrees with the effective display of its own cell roots.
// That can fail, and it fails loudly if a root moves from inline-flex to flex
// without the fragment being regenerated.
//
// The expectation is derived INDEPENDENTLY here -- this file parses ds-base.css
// itself rather than importing the producer's lookup. Importing it would make
// the test agree with the producer by construction, including when both are
// wrong, which is how a verification ends up using the same broken read as the
// edit it is checking.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var D = require("../../scripts/render/derive-from-renderer.js");
var M = require("../../components/render/renderer/matrix.js");

var REPO_ROOT = path.resolve(__dirname, "..", "..");

// Comments FIRST. A rule block in this sheet is routinely preceded by a `/* ...
// */` note, and a selector regex run before stripping them swallows the note
// into the selector, so every rule reads as unmatched and the whole map comes
// back empty -- which looks exactly like "nothing declares a display".
function declaredDisplays() {
  var css = fs
    .readFileSync(
      path.join(REPO_ROOT, "components/render/renderer/ds-base.css"),
      "utf8",
    )
    .replace(/\/\*[\s\S]*?\*\//g, " ");
  var out = {};
  var rule = /([^{}]+)\{([^{}]*)\}/g;
  var m;
  while ((m = rule.exec(css)) !== null) {
    var d = /(?:^|[;\s])display:\s*([a-z-]+)/.exec(m[2]);
    if (!d) continue;
    m[1].split(",").forEach(function (sel) {
      var s = sel.trim().replace(/\s+/g, " ");
      var one = /^\.([a-z0-9-]+)$/.exec(s);
      if (one && !(one[1] in out)) out[one[1]] = d[1];
    });
  }
  return out;
}

// HTML's own defaults, for a root whose class declares no display. This is a
// property of the platform, not of this repo, so it cannot drift with a Figma
// sync -- but it must still be COMPLETE for the tags actually used, which the
// last test in this file asserts rather than assumes.
var INLINE_TAGS = new Set([
  "a",
  "abbr",
  "button",
  "code",
  "em",
  "img",
  "input",
  "label",
  "select",
  "small",
  "span",
  "strong",
  "svg",
  "textarea",
]);

var CELL_OPEN = /data-render-cell="[^"]*">\s*<([a-z]+)([^>]*)>/g;

/** Every cell's {tag, rootClass} in document order. */
function cellRoots(html) {
  var out = [];
  var m;
  CELL_OPEN.lastIndex = 0;
  while ((m = CELL_OPEN.exec(html)) !== null) {
    var cls = (/class="([^"]*)"/.exec(m[2]) || [])[1] || "";
    out.push({
      tag: m[1],
      root:
        cls.split(/\s+/).filter(function (c) {
          return /^(ds|fm)-/.test(c) && !/(--|__)/.test(c);
        })[0] || null,
    });
  }
  return out;
}

function isInlineRoot(cell, displays) {
  if (cell.root && Object.prototype.hasOwnProperty.call(displays, cell.root)) {
    return displays[cell.root].indexOf("inline") === 0;
  }
  return INLINE_TAGS.has(cell.tag);
}

var DISPLAYS = declaredDisplays();
var ROW = "flex-wrap:wrap";
var COLUMN = "flex-direction:column";

function rootStyle(html) {
  return (/<div id="fidelity-root"[^>]*style="([^"]*)"/.exec(html) || [])[1] || "";
}

test("a slug whose variants are all inline-rooted lays them out as a wrapping row", function () {
  var wrong = [];
  M.RENDER_SLUGS.forEach(function (slug) {
    var html = D.deriveFragment(slug);
    var cells = cellRoots(html);
    if (!cells.length) return;
    var allInline = cells.every(function (c) {
      return isInlineRoot(c, DISPLAYS);
    });
    if (!allInline) return;
    var style = rootStyle(html);
    if (style.indexOf(ROW) === -1) {
      wrong.push(slug + ": inline-rooted but laid out as '" + style + "'");
    }
  });
  assert.deepEqual(wrong, [], wrong.join("\n"));
});

test("a slug with any block-level root keeps the full-width column", function () {
  // Conservative on purpose: a mixed slug takes the column. The column can only
  // make an inline component wider than it needs; the row is what squashed a
  // width:100% component, and that must not come back by accident.
  var wrong = [];
  M.RENDER_SLUGS.forEach(function (slug) {
    var html = D.deriveFragment(slug);
    var cells = cellRoots(html);
    if (!cells.length) return;
    var anyBlock = cells.some(function (c) {
      return !isInlineRoot(c, DISPLAYS);
    });
    if (!anyBlock) return;
    var style = rootStyle(html);
    if (style.indexOf(COLUMN) === -1) {
      wrong.push(slug + ": has a block-level root but is laid out as '" + style + "'");
    }
  });
  assert.deepEqual(wrong, [], wrong.join("\n"));
});

test("controls: button lays out as a row, action-bar as a column", function () {
  // Two slugs whose answer is known by hand, so a bug that flips every slug the
  // same way cannot pass the two population tests above by agreeing with itself.
  assert.match(rootStyle(D.deriveFragment("button")), /flex-wrap:wrap/);
  assert.match(rootStyle(D.deriveFragment("action-bar")), /flex-direction:column/);
});

test("every cell root is classifiable, so no slug is silently skipped", function () {
  // The rule that makes the two population tests mean something: a root this
  // gate cannot classify must be a failure. Skipping one is how a gate reports
  // success over a component it never looked at.
  var unclassifiable = [];
  M.RENDER_SLUGS.forEach(function (slug) {
    cellRoots(D.deriveFragment(slug)).forEach(function (c) {
      var known =
        (c.root && Object.prototype.hasOwnProperty.call(DISPLAYS, c.root)) ||
        INLINE_TAGS.has(c.tag) ||
        c.tag === "div" ||
        c.tag === "table" ||
        c.tag === "nav" ||
        c.tag === "header" ||
        c.tag === "section" ||
        c.tag === "ul" ||
        c.tag === "ol" ||
        c.tag === "p" ||
        c.tag === "form";
      if (!known) {
        unclassifiable.push(slug + ": <" + c.tag + "> ." + c.root);
      }
    });
  });
  assert.deepEqual(
    unclassifiable,
    [],
    "these roots declare no display and their tag is not in the known set, so " +
      "the layout choice for them is a guess:\n" + unclassifiable.join("\n"),
  );
});
