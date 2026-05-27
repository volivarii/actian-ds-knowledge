"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var derive = require("../scripts/foundations/derive-foundations.js");

// PR α.5 v2: motion moved from foundations/dist/interaction-motion.json to
// foundations/dist/tokens/motion.json (Pattern H hierarchical layout).
var motion = JSON.parse(
  fs.readFileSync(
    path.resolve(
      __dirname,
      "..",
      "foundations",
      "dist",
      "tokens",
      "motion.json",
    ),
    "utf8",
  ),
);

// Read motion-pattern source from 03-tokens.md (where the Motion section lives
// post-split). The motion patterns block + their `{#slug}` anchors are
// constrained to that one file.
var foundationsSrc = fs.readFileSync(
  path.resolve(__dirname, "..", "foundations", "src", "03-tokens.md"),
  "utf8",
);

// patterns is an object keyed by short-slug (legacy); each value contains
// a canonical `slug` field per PR α (Q1 2026 ecosystem plan).
function patternsList(m) {
  if (Array.isArray(m.patterns)) return m.patterns;
  return Object.keys(m.patterns).map(function (k) {
    return Object.assign({ _key: k }, m.patterns[k]);
  });
}

test("every motion pattern has a slug field", function () {
  var list = patternsList(motion);
  assert.ok(list.length > 0, "patterns non-empty");
  list.forEach(function (p, i) {
    assert.ok(p.slug, "pattern[" + i + "] (" + p.name + ") missing slug");
    assert.ok(
      /^[a-z][a-z0-9-]*$/.test(p.slug),
      "slug invalid format: " + p.slug,
    );
  });
});

test("motion slugs are unique", function () {
  var list = patternsList(motion);
  var slugs = list.map(function (p) {
    return p.slug;
  });
  var unique = Array.from(new Set(slugs));
  assert.equal(slugs.length, unique.length, "duplicate slugs detected");
});

test("known canonical slug mapping is correct (now author-declared, D2)", function () {
  // Canonical slugs are now sourced from `{#anchor}` markers in
  // foundations/src/03-tokens.md (D2 — Substrate Doctrine P6). This test
  // remains the load-bearing contract for consumers; the values must not
  // drift even though the derivation mechanism changed.
  var list = patternsList(motion);
  var byName = {};
  list.forEach(function (p) {
    byName[p.name] = p.slug;
  });
  assert.equal(byName["State Transitions"], "state-transitions");
  assert.equal(byName["Drawer (open/close)"], "drawer-open-close");
  assert.equal(byName["Skeleton Loading"], "skeleton-loading");
  assert.equal(
    byName["Accordion (expand/collapse)"],
    "accordion-expand-collapse",
  );
  assert.equal(byName["Success Toast"], "success-toast");
  assert.equal(byName["Layered Overlays — Modals"], "layered-overlays-modals");
  assert.equal(
    byName["Staggered Entrance — Lists, Table Rows, Search Cards"],
    "staggered-entrance",
  );
  assert.equal(
    byName['The "Anchor" Motion — Dropdowns, Popovers, and Tooltips'],
    "anchor-motion",
  );
});

test("every motion pattern carries an explicit {#anchor} in source (D2)", function () {
  // Each of the 8 pattern names produced by deriveFoundations must have an
  // explicit `{#slug}` marker on its bold-paragraph in source. This is the
  // cross-consumer contract; pattern NAMES may be re-worded freely, but
  // the slug is the addressing key (Substrate Doctrine P6).
  var list = patternsList(motion);
  list.forEach(function (p) {
    var anchor = "{#" + p.slug + "}";
    assert.ok(
      foundationsSrc.indexOf(anchor) !== -1,
      "Pattern '" + p.name + "' is missing its source anchor: " + anchor,
    );
  });
});

test("extractExplicitPatternAnchor reads {#slug} when present (D2)", function () {
  // Simulate the marked-style token shape that the derive parser sees.
  var withAnchor = {
    type: "paragraph",
    tokens: [
      { type: "strong", text: "Drawer (open/close)" },
      { type: "text", text: " {#drawer-open-close}" },
    ],
  };
  assert.equal(
    derive.extractExplicitPatternAnchor(withAnchor),
    "drawer-open-close",
  );
});

test("extractExplicitPatternAnchor returns null on bare bold paragraph (D2)", function () {
  var bare = {
    type: "paragraph",
    tokens: [{ type: "strong", text: "Drawer (open/close)" }],
  };
  assert.equal(derive.extractExplicitPatternAnchor(bare), null);
});

test("isBoldOnlyParagraph accepts strong + {#anchor} (D2)", function () {
  var withAnchor = {
    type: "paragraph",
    tokens: [
      { type: "strong", text: "Pattern" },
      { type: "text", text: " {#pattern}" },
    ],
  };
  assert.equal(derive.isBoldOnlyParagraph(withAnchor), true);
});

test("isBoldOnlyParagraph rejects strong + non-anchor text (D2)", function () {
  var notAnchor = {
    type: "paragraph",
    tokens: [
      { type: "strong", text: "Pattern" },
      { type: "text", text: " followed by extra prose" },
    ],
  };
  assert.equal(derive.isBoldOnlyParagraph(notAnchor), false);
});
