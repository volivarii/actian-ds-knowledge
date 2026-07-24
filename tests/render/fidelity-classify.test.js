"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var C = require("../../scripts/render/fidelity-classify.js");

var TOKENS = {
  "--zen-color-bg-subtle": "#f5f5f8",
  "--zen-border-default": "#c7c7ce",
  "--zen-border-width-md": "1px",
  "--zen-spacing-2xs": "4px",
};

test("colorOf: a color-valued token resolves", function () {
  assert.deepEqual(
    C.colorOf("background", "var(--zen-color-bg-subtle)", TOKENS),
    {
      token: "--zen-color-bg-subtle",
      resolved: "#f5f5f8",
    },
  );
});

// The whole reason the earlier probe produced 1446 bogus findings: a spacing
// token checked against a color fact set.
test("colorOf: a non-color token is not a color", function () {
  assert.equal(C.colorOf("padding", "var(--zen-spacing-2xs)", TOKENS), null);
});

// Shorthand `border: 1px solid var(--color)` must yield the COLOR, not the
// width. Taking the first var() picked --zen-border-width-md=1px and compared
// "1px" against a hex fact.
test("colorOf: shorthand border yields its color component, not its width", function () {
  var got = C.colorOf(
    "border",
    "var(--zen-border-width-md) solid var(--zen-border-default)",
    TOKENS,
  );
  assert.deepEqual(got, { token: "--zen-border-default", resolved: "#c7c7ce" });
});

test("colorOf: a literal hex is a color", function () {
  assert.deepEqual(C.colorOf("color", "#b1374d", TOKENS), {
    token: null,
    resolved: "#b1374d",
  });
});

test("colorOf: a keyword with no resolvable color is not a color", function () {
  assert.equal(C.colorOf("background", "none", TOKENS), null);
  assert.equal(
    C.colorOf("border", "var(--zen-border-width-md) solid transparent", TOKENS),
    null,
  );
});

// A gradient has no single color. Picking a stop (the first var(), as the
// scan below would otherwise do) is a confident WRONG answer: the element is
// not painted --zen-color-bg-subtle, it is painted a moving blend of three
// stops. Real value lifted from ds-base.css:1446 (.ds-steward__shimmer).
test("colorOf: a gradient background is not a single color", function () {
  var gradient =
    "linear-gradient(\n    90deg,\n    var(--zen-color-bg-subtle) 25%,\n    var(--zen-color-bg-emphasis) 50%,\n    var(--zen-color-bg-subtle) 75%\n  )";
  assert.equal(C.colorOf("background", gradient, TOKENS), null);
});

test("kindOf maps properties to fact kinds", function () {
  assert.equal(C.kindOf("background-color"), "background");
  assert.equal(C.kindOf("color"), "text");
  assert.equal(C.kindOf("fill"), "text");
  assert.equal(C.kindOf("border-bottom"), "border");
  assert.equal(C.kindOf("outline-color"), "border");
  assert.equal(C.kindOf("padding"), null);
});

// The subject of a rule is its RIGHTMOST compound. `.ds-tag--indigo
// .ds-tag-stage__dot` paints the dot, not the container. Reading the leftmost
// compared the dot's fill against the container's variant background and
// produced 14 false mismatches.
test("rightmost returns the targeted compound", function () {
  assert.equal(
    C.rightmost(".ds-tag--indigo .ds-tag-stage__dot"),
    ".ds-tag-stage__dot",
  );
  assert.equal(C.rightmost(".ds-alert__icon"), ".ds-alert__icon");
  assert.equal(C.rightmost(".ds-card > .ds-card__title"), ".ds-card__title");
  assert.equal(
    C.rightmost(".ds-alert--primary, .ds-alert--success"),
    ".ds-alert--primary",
  );
});

test("classifySelector buckets by what the rule targets", function () {
  assert.deepEqual(C.classifySelector(".ds-alert", "ds-alert"), {
    bucket: "root",
  });
  assert.deepEqual(C.classifySelector(".ds-alert--warning", "ds-alert"), {
    bucket: "modifier",
    modifier: "warning",
  });
  assert.deepEqual(C.classifySelector(".ds-alert__title", "ds-alert"), {
    bucket: "element",
  });
  assert.deepEqual(C.classifySelector(".ds-link:hover", "ds-link"), {
    bucket: "state",
  });
  assert.deepEqual(
    C.classifySelector(".ds-tag--indigo .ds-tag-stage__dot", "ds-tag"),
    {
      bucket: "element",
    },
  );
});

test("classifySelector treats an unrelated rightmost compound as unattributable", function () {
  assert.deepEqual(C.classifySelector(".ds-header .ds-icon", "ds-header"), {
    bucket: "other",
  });
});

// A structural pseudo-class (:first-child, :nth-child(), etc.) addresses a
// positional state the default-variant capture cannot reach. Real occurrence
// from ds-base.css around line 3896 (.ds-avatar-group .ds-avatar:first-child).
test("classifySelector treats a structural pseudo-class as state, not element", function () {
  assert.deepEqual(
    C.classifySelector(
      ".ds-avatar-group .ds-avatar:first-child",
      "ds-avatar-group",
    ),
    { bucket: "state" },
  );
});

var FACTS_PLAIN = {
  byNode: [{ name: "Root", appearance: { background: "#ffffff" } }],
};
var FACTS_VARIANT = {
  byNode: [
    {
      name: "Type=Info",
      appearance: {
        background: "#f7fdff",
        variants: [
          { prop: "Type", values: ["Warning"], background: "#fff9e5" },
        ],
      },
    },
  ],
};
var TOK = {
  "--zen-ok": "#ffffff",
  "--zen-bad": "#000000",
  "--zen-warn": "#fff9e5",
  "--zen-wrong-warn": "#f7f4f2",
};

test("classifySlug: a root rule matching the captured root verifies", function () {
  var r = C.classifySlug({
    slug: "widget",
    prefixes: ["ds-widget"],
    css: ".ds-widget { background: var(--zen-ok); }",
    facts: FACTS_PLAIN,
    tokenMap: TOK,
    sharedPrefixes: {},
  });
  assert.equal(r.verified, 1);
  assert.equal(r.mismatch, 0);
});

// De-vacuuming: the checker's subject was present and it CAN fail. This is the
// defect class of the #472 tag-glossary-item-type bug, a modifier binding
// warning-25 and painting #f7f4f2 where the capture says #fff9e5.
test("classifySlug: a wrong color on a rule whose node has a fact is exactly one mismatch", function () {
  var r = C.classifySlug({
    slug: "widget",
    prefixes: ["ds-widget"],
    css: ".ds-widget { background: var(--zen-bad); }",
    facts: FACTS_PLAIN,
    tokenMap: TOK,
    sharedPrefixes: {},
  });
  assert.equal(r.mismatch, 1);
  assert.equal(r.verified, 0);
  assert.match(r.mismatches[0].message, /#000000/);
  assert.match(r.mismatches[0].message, /#ffffff/);
});

test("classifySlug: a modifier resolves against the matching captured variant", function () {
  var ok = C.classifySlug({
    slug: "alert-banner",
    prefixes: ["ds-alert"],
    css: ".ds-alert--warning { background: var(--zen-warn); }",
    facts: FACTS_VARIANT,
    tokenMap: TOK,
    sharedPrefixes: {},
  });
  assert.equal(ok.verified, 1);

  var bad = C.classifySlug({
    slug: "alert-banner",
    prefixes: ["ds-alert"],
    css: ".ds-alert--warning { background: var(--zen-wrong-warn); }",
    facts: FACTS_VARIANT,
    tokenMap: TOK,
    sharedPrefixes: {},
  });
  assert.equal(bad.mismatch, 1);
});

test("classifySlug: a :hover rule with an uncaptured color is unverifiable, never mismatch", function () {
  var r = C.classifySlug({
    slug: "widget",
    prefixes: ["ds-widget"],
    css: ".ds-widget:hover { background: var(--zen-bad); }",
    facts: FACTS_PLAIN,
    tokenMap: TOK,
    sharedPrefixes: {},
  });
  assert.equal(r.mismatch, 0);
  assert.equal(r.unverifiable, 1);
  assert.equal(r.reasons["state-unreachable"], 1);
});

test("classifySlug: a BEM element rule is unverifiable, never mismatch", function () {
  var r = C.classifySlug({
    slug: "widget",
    prefixes: ["ds-widget"],
    css: ".ds-widget__title { color: var(--zen-bad); }",
    facts: FACTS_PLAIN,
    tokenMap: TOK,
    sharedPrefixes: {},
  });
  assert.equal(r.mismatch, 0);
  assert.equal(r.reasons["element-no-node-mapping"], 1);
});

// A base rule under a prefix five slugs share belongs to the family, not to
// whichever member is being walked. Comparing it against one member's capture
// produced ~10 false mismatches. Union membership carries no provenance, which
// is why resolveTagOwner already refuses to union.
test("classifySlug: a shared base prefix has no single subject", function () {
  var r = C.classifySlug({
    slug: "tag-shared",
    prefixes: ["ds-tag"],
    css: ".ds-tag { background: var(--zen-bad); }",
    facts: FACTS_PLAIN,
    tokenMap: TOK,
    sharedPrefixes: { "ds-tag": ["tag-catalog", "tag-default", "tag-shared"] },
  });
  assert.equal(r.mismatch, 0);
  assert.equal(r.reasons["shared-base-no-single-subject"], 1);
});

// The capture's root node is a specific variant instance (alert-banner's is
// "Type=Info, Orientation'=Horizontal"), not a neutral default, so an
// unmodified base rule has no comparable subject.
test("classifySlug: a root rule against a variant-instance capture is unverifiable", function () {
  var r = C.classifySlug({
    slug: "alert-banner",
    prefixes: ["ds-alert"],
    css: ".ds-alert { background: var(--zen-bad); }",
    facts: FACTS_VARIANT,
    tokenMap: TOK,
    sharedPrefixes: {},
  });
  assert.equal(r.mismatch, 0);
  assert.equal(r.reasons["root-is-variant-instance"], 1);
});

test("classifySlug: a slug with no capture at all is unverifiable, not verified", function () {
  var r = C.classifySlug({
    slug: "widget",
    prefixes: ["ds-widget"],
    css: ".ds-widget { background: var(--zen-ok); }",
    facts: null,
    tokenMap: TOK,
    sharedPrefixes: {},
  });
  assert.equal(r.verified, 0);
  assert.equal(r.unverifiable, 1);
  assert.equal(r.reasons["no-capture"], 1);
});

// Pins the ">" in `(sharedPrefixes[rule.prefix] || []).length > 1`. A prefix
// is shared only when MORE THAN ONE slug claims it; a single-owner entry
// (every real prefix in the caller's complete map, most of the time) must
// still be evaluated normally. No prior test passed a sharedPrefixes map
// with a single-owner entry for the prefix under test, so `> 1` silently
// mutating to `>= 1` still passed every test here: every root rule in the
// corpus would then read as shared-base-no-single-subject and the verified
// bucket would collapse to near zero.
test("classifySlug: a sharedPrefixes entry with exactly one owner is not shared", function () {
  var r = C.classifySlug({
    slug: "widget",
    prefixes: ["ds-widget"],
    css: ".ds-widget { background: var(--zen-ok); }",
    facts: FACTS_PLAIN,
    tokenMap: TOK,
    sharedPrefixes: { "ds-widget": ["widget"] },
  });
  assert.equal(r.verified, 1);
  assert.equal(r.mismatch, 0);
  assert.equal(r.reasons["shared-base-no-single-subject"], undefined);
});

// ownedRules is exported and Tasks 5/6 will call it directly. A CSS comment
// that mentions another component's class right before a rule must not steal
// that rule's ownership -- reproduced against the real .ds-search-result-card
// rule in ds-base.css, whose preceding comment block says it reuses ".ds-tag
// / .ds-tag-stage / ... rules verbatim" and would otherwise attribute the
// following .ds-search-result-card rule to ds-tag.
test("ownedRules: a raw-CSS comment mentioning another prefix does not steal the next rule", function () {
  var raw =
    "/* reuses .ds-tag family rules verbatim */\n" +
    ".ds-search-result-card { background: #ffffff; }";
  var out = C.ownedRules(raw, ["ds-tag", "ds-search-result-card"]);
  assert.equal(out.length, 1);
  assert.equal(out[0].prefix, "ds-search-result-card");
  assert.equal(out[0].selector, ".ds-search-result-card");
});
