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

// A var() with a fallback used to fail the closing-paren-immediately-after
// the token name match entirely, fall through to the bare-hex scan, and pick
// up the FALLBACK's hex instead -- discarding the real binding. Real value
// from ds-base.css:529 (`.ds-topic { color: var(--zen-color-text-reverse,
// #fff); }`). The fallback is only what the browser paints when the token is
// undefined; the token is the real binding and is what the capture names, so
// it must win over the fallback literal whenever it resolves to a color.
test("colorOf: a var() with a fallback resolves to the TOKEN, not the fallback literal", function () {
  var tokens = { "--zen-color-text-reverse": "#ffffff" };
  assert.deepEqual(
    C.colorOf("color", "var(--zen-color-text-reverse, #fff)", tokens),
    { token: "--zen-color-text-reverse", resolved: "#ffffff" },
  );
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

// Hex comparison used to be raw lowercase string equality, so a 3-digit hex
// never equalled its 6-digit expansion and a semantically identical color
// reported a false mismatch. Real value from ds-base.css:3739
// (`.ds-spinner--on-dark .ds-spinner__ring { border-top-color: #fff; }`,
// captured as #ffffff -- see its own comment "captured Ellipse 9-12 On-dark
// arc, #ffffff, no token").
test("classifySlug: a 3-digit hex verifies against its captured 6-digit expansion", function () {
  var r = C.classifySlug({
    slug: "widget",
    prefixes: ["ds-widget"],
    css: ".ds-widget { background: #fff; }",
    facts: FACTS_PLAIN,
    tokenMap: TOK,
    sharedPrefixes: {},
  });
  assert.equal(r.verified, 1);
  assert.equal(r.mismatch, 0);
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
    sharedPrefixes: { "ds-tag": ["tag-catalog", "read-only-tag", "tag-shared"] },
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

// ---------------------------------------------------------------------------
// Task 6, classifier bug A: a capture root whose NAME encodes a non-Default
// State is a capture of an INTERACTION state, not of the neutral default.
// avatar's root is literally "State=Hovered, Type=Default", and it carries no
// root-level variants[], so the existing root-is-variant-instance rule never
// fired and an unmodified `.ds-avatar` base rule was compared against a HOVER
// capture. That produced a mismatch for a defect that does not exist.
// ---------------------------------------------------------------------------

var FACTS_HOVER_ROOT = {
  byNode: [
    {
      name: "State=Hovered, Type=Default",
      appearance: { background: "#edf6ff" },
    },
  ],
};

test("classifySlug: a root rule against a non-Default State capture is unverifiable, not a mismatch", function () {
  var r = C.classifySlug({
    slug: "avatar",
    prefixes: ["ds-avatar"],
    css: ".ds-avatar { background: var(--zen-bad); }",
    facts: FACTS_HOVER_ROOT,
    tokenMap: TOK,
    sharedPrefixes: {},
  });
  assert.equal(r.mismatch, 0);
  assert.equal(r.verified, 0);
  assert.equal(r.reasons["root-is-non-default-state"], 1);
});

// The over-fire guard, and the reason this rule reads the State VALUE rather
// than merely the presence of a State axis. These three real root names must
// keep being compared: suppressing them would silently delete the very
// declarations that catch lineage-grouped-node's and segmented-control's real
// defects, and button's Critical fill.
test("classifySlug: a State=Default root is still a comparable subject (the rule must not over-fire)", function () {
  [
    "State=Default, Type=Main item",
    "Type=Default",
    "Intent=Default, Emphasis=Filled, Size=Default, State=Default",
  ].forEach(function (rootName) {
    var r = C.classifySlug({
      slug: "widget",
      prefixes: ["ds-widget"],
      css: ".ds-widget { background: var(--zen-ok); }",
      facts: {
        byNode: [{ name: rootName, appearance: { background: "#ffffff" } }],
      },
      tokenMap: TOK,
      sharedPrefixes: {},
    });
    assert.equal(
      r.verified,
      1,
      rootName + " is a neutral default and must stay comparable",
    );
    assert.equal(r.reasons["root-is-non-default-state"], undefined);
  });
});

// "States=Enabled" (calendar-date-input's real root name) is a DIFFERENT axis that
// merely starts with the same five letters. Matching it would suppress a root
// that is a perfectly good subject.
test("rootIsNonDefaultState reads the State axis only, not an axis that starts like it", function () {
  assert.equal(C.rootIsNonDefaultState("State=Hovered, Type=Default"), true);
  assert.equal(C.rootIsNonDefaultState("State=Collapsed"), true);
  assert.equal(C.rootIsNonDefaultState("State=Default, Type=Main item"), false);
  assert.equal(
    C.rootIsNonDefaultState("Type=Single date, States=Enabled"),
    false,
  );
  assert.equal(
    C.rootIsNonDefaultState("Selection=Unchecked, State=Default"),
    false,
  );
  assert.equal(C.rootIsNonDefaultState(""), false);
  assert.equal(C.rootIsNonDefaultState(null), false);
});

// ---------------------------------------------------------------------------
// Task 6, classifier bug B: the captures record the Figma VARIABLE NAME beside
// the resolved hex. When Figma names the same variable our CSS binds, both
// sides agree on the semantic binding and a hex difference is a theme-mode
// artifact (tokens.css defines each token under :root/actian, studio, and
// explorer; loadTokenMap keeps the first) or a snapshot-vintage artifact.
// global-header's root is literally "App type=Studio".
// ---------------------------------------------------------------------------

var TOK_THEMED = {
  "--zen-border-default": "#c7c7ce", // the actian value loadTokenMap keeps
  "--zen-other": "#123456",
};

// Review finding 2: this used to assert plain `verified`. Token-name
// agreement with a DIFFERING hex is now its own countable bucket
// (verifiedViaTokenName), not silently folded into `verified` -- see the
// dedicated section below for the non-vacuity proof that it is not folded
// back into either `verified` or `mismatch`.
test("classifySlug: a declaration binding the token the capture names verifies via token-name agreement, even when the captured hex is another theme's value", function () {
  var r = C.classifySlug({
    slug: "global-header",
    prefixes: ["ds-header"],
    css: ".ds-header { border-bottom: 1px solid var(--zen-border-default); }",
    facts: {
      byNode: [
        {
          name: "App type=Studio, Breakpoints=XL",
          appearance: {
            border: { color: "#dadada", colorToken: "--zen-border-default" },
          },
        },
      ],
    },
    tokenMap: TOK_THEMED,
    sharedPrefixes: {},
  });
  assert.equal(r.verifiedViaTokenName, 1);
  assert.equal(r.verified, 0);
  assert.equal(r.mismatch, 0);
});

// Non-vacuity for the rule above: token-name agreement is agreement on a NAME,
// not a blanket pass. Binding a DIFFERENT token than the capture names, with a
// different value, is still exactly one mismatch.
test("classifySlug: binding a different token than the capture names is still a mismatch", function () {
  var r = C.classifySlug({
    slug: "global-header",
    prefixes: ["ds-header"],
    css: ".ds-header { border-bottom: 1px solid var(--zen-other); }",
    facts: {
      byNode: [
        {
          name: "Breakpoints=XL",
          appearance: {
            border: { color: "#dadada", colorToken: "--zen-border-default" },
          },
        },
      ],
    },
    tokenMap: TOK_THEMED,
    sharedPrefixes: {},
  });
  assert.equal(r.mismatch, 1);
  assert.match(r.mismatches[0].message, /--zen-other/);
});

// ---------------------------------------------------------------------------
// Review finding 2: token-name agreement with a DIFFERING hex was verified
// correctly (task 6), but silently indistinguishable from a plain hex match
// -- both landed in the same `verified` count with no way to tell which kind
// of evidence produced them. badge's real capture is exactly this class:
// --zen-color-icon-error is defined exactly once in tokens.css (#dc3514,
// no theme-mode explanation available), yet the capture says #c12c11. The
// binding is right (both sides name the same token), so it is not a
// mismatch, but the divergence is real and must be countable and visible,
// not folded into plain `verified`.
// ---------------------------------------------------------------------------

test("classifySlug: token-name agreement with a differing hex is counted in verifiedViaTokenName, not silently folded into plain verified", function () {
  var r = C.classifySlug({
    slug: "badge",
    prefixes: ["ds-badge"],
    css: ".ds-badge { background: var(--zen-color-icon-error); }",
    facts: {
      byNode: [
        {
          name: "Type=Default",
          appearance: {
            background: "#c12c11",
            backgroundToken: "--zen-color-icon-error",
          },
        },
      ],
    },
    tokenMap: { "--zen-color-icon-error": "#dc3514" },
    sharedPrefixes: {},
  });
  assert.equal(
    r.verifiedViaTokenName,
    1,
    "a token-name agreement with a differing hex must be counted in its own bucket",
  );
  assert.equal(
    r.verified,
    0,
    "it must not also (or instead) be folded into plain verified",
  );
  assert.equal(r.mismatch, 0, "it must never block the build");
  assert.equal(
    r.tokenNameAgreements.length,
    1,
    "the per-occurrence record must be carried alongside the count",
  );
  var rec = r.tokenNameAgreements[0];
  assert.equal(rec.slug, "badge");
  assert.equal(rec.selector, ".ds-badge");
  assert.equal(rec.property, "background");
  assert.equal(rec.token, "--zen-color-icon-error");
  assert.equal(rec.ourValue, "#dc3514");
  assert.equal(rec.capturedValue, "#c12c11");
});

// And where the capture names NO token (button's Intent=Critical fill is a raw
// hex in Figma), the hex comparison is all there is and must still decide.
test("classifySlug: with no captured token name, a wrong hex is still a mismatch", function () {
  var facts = {
    byNode: [
      {
        name: "Intent=Default, State=Default",
        appearance: {
          background: "#0f5fdc",
          variants: [
            {
              prop: "Intent",
              values: ["Critical"],
              background: "#c12c11",
              backgroundToken: null,
            },
          ],
        },
      },
    ],
  };
  var bad = C.classifySlug({
    slug: "button",
    prefixes: ["ds-button"],
    css: ".ds-button--critical { background: var(--zen-bad); }",
    facts: facts,
    tokenMap: { "--zen-bad": "#dc3514", "--zen-crit": "#c12c11" },
    sharedPrefixes: {},
  });
  assert.equal(bad.mismatch, 1);
  var ok = C.classifySlug({
    slug: "button",
    prefixes: ["ds-button"],
    css: ".ds-button--critical { background: var(--zen-crit); }",
    facts: facts,
    tokenMap: { "--zen-bad": "#dc3514", "--zen-crit": "#c12c11" },
    sharedPrefixes: {},
  });
  assert.equal(ok.verified, 1);
  assert.equal(ok.mismatch, 0);
});

// ---------------------------------------------------------------------------
// Task 6, cascade resolution. tag-stage shares the .ds-tag--<color> scale with
// read-only-tag but its capture gives Orange and Yellow different borders, so it
// carries its own .ds-tag-stage--<color> rules AFTER the shared ones. The
// shared declaration is then not what tag-stage paints, and charging it for
// one is reporting a defect the render never produces.
// ---------------------------------------------------------------------------

var FACTS_STAGE = {
  byNode: [
    {
      name: "Color=Gray",
      appearance: {
        background: "#f7fdff",
        variants: [
          {
            prop: "Color",
            values: ["Orange"],
            border: { color: "#ffc1b3", colorToken: "--zen-color-error-100" },
          },
        ],
      },
    },
  ],
};
var TOK_TAG = {
  "--zen-color-error-50": "#ffdacf",
  "--zen-color-error-100": "#ffc1b3",
};

test("classifySlug: a later equal-specificity rule overrides the earlier one for the same property, and the loser is counted as overridden rather than as a mismatch", function () {
  var r = C.classifySlug({
    slug: "tag-stage",
    prefixes: ["ds-tag", "ds-tag-stage"],
    css:
      ".ds-tag--orange { border-color: var(--zen-color-error-50); }\n" +
      ".ds-tag-stage--orange { border-color: var(--zen-color-error-100); }\n",
    facts: FACTS_STAGE,
    tokenMap: TOK_TAG,
    sharedPrefixes: { "ds-tag": ["read-only-tag", "tag-stage"] },
  });
  assert.equal(r.mismatch, 0);
  assert.equal(r.verified, 1, "the winning declaration is still classified");
  assert.equal(
    r.overridden,
    1,
    "the overridden declaration is counted, not dropped silently",
  );
  assert.equal(
    r.unverifiable,
    0,
    "an overridden declaration is not paint, so it is not unverifiable either",
  );
});

// Non-vacuity: the winner is genuinely checked. A wrong value on the OVERRIDING
// rule must still red, or the override resolution would be a way to launder a
// defect past the gate.
test("classifySlug: a wrong value on the overriding rule is still a mismatch", function () {
  var r = C.classifySlug({
    slug: "tag-stage",
    prefixes: ["ds-tag", "ds-tag-stage"],
    css:
      ".ds-tag--orange { border-color: var(--zen-color-error-100); }\n" +
      ".ds-tag-stage--orange { border-color: var(--zen-color-error-50); }\n",
    facts: FACTS_STAGE,
    tokenMap: TOK_TAG,
    sharedPrefixes: { "ds-tag": ["read-only-tag", "tag-stage"] },
  });
  assert.equal(r.mismatch, 1);
  assert.match(r.mismatches[0].selector, /ds-tag-stage--orange/);
});

// The key is the PROPERTY, not the fact kind. `.ds-toast` really does
// set `border` and `border-left-color` on the same subject, and both paint:
// the shorthand paints three sides the longhand never touches. Keying on the
// kind ("border") collapsed them and silently deleted one from the count.
test("classifySlug: a shorthand and a longhand on the same subject are both paint, not an override", function () {
  var r = C.classifySlug({
    slug: "toast",
    prefixes: ["ds-toast"],
    css: ".ds-toast { border: 1px solid var(--zen-ok); border-left-color: var(--zen-bad); }",
    facts: {
      byNode: [
        {
          name: "Type=Default",
          appearance: { border: { color: "#ffffff" } },
        },
      ],
    },
    tokenMap: TOK,
    sharedPrefixes: {},
  });
  assert.equal(r.overridden, 0, "neither declaration overrides the other");
  assert.equal(r.verified + r.mismatch, 2, "both declarations are classified");
});

// Specificity beats source order: an earlier, more specific rule wins over a
// later, less specific one. Ordering by source position alone would pick the
// wrong declaration here.
test("classifySlug: a more specific earlier rule wins over a less specific later one", function () {
  var r = C.classifySlug({
    slug: "widget",
    prefixes: ["ds-widget"],
    css:
      ".ds-scope .ds-widget--a { background: var(--zen-warn); }\n" +
      ".ds-widget--a { background: var(--zen-wrong-warn); }\n",
    facts: {
      byNode: [
        {
          name: "Type=Base",
          appearance: {
            background: "#f7fdff",
            variants: [{ prop: "Type", values: ["A"], background: "#fff9e5" }],
          },
        },
      ],
    },
    tokenMap: TOK,
    sharedPrefixes: {},
  });
  assert.equal(r.overridden, 1);
  assert.equal(
    r.verified,
    1,
    "the more specific rule paints #fff9e5, which matches the captured variant",
  );
  assert.equal(r.mismatch, 0);
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

// ---------------------------------------------------------------------------
// Review finding 1: the cascade subjectKey used to be bucket|modifier|prop,
// with no mention of which prefix owns the rule. When one slug owns more
// than one prefix (today, only tag-stage), two ROOT rules from DIFFERENT
// prefixes both produce the SAME key ("root||<prop>", modifier is always
// empty at root bucket), so the winner-resolution pass silently treated them
// as one subject even though a bare `.prefix` selector's identity IS its
// prefix -- there is nothing else naming which element it targets. A root
// rule losing that resolution was marked `overridden` and dropped from every
// other bucket, so a real mismatch on it never reached the report.
//
// This is the exact synthetic case from the review: two prefixes owned by
// one slug, each with its own plain root rule (no modifier to disambiguate),
// targeting what must be presumed to be different elements absent any
// evidence otherwise. The loser's color is contradicted by the capture, so
// this must report a mismatch, not silently collapse into `overridden`.
// ---------------------------------------------------------------------------

test("classifySlug: two DIFFERENT prefixes' root rules are never the same subject, so a losing root declaration a capture contradicts is a mismatch, not a silent override", function () {
  var r = C.classifySlug({
    slug: "synth",
    prefixes: ["ds-alpha", "ds-beta"],
    css: ".ds-alpha{background:#222222}\n.ds-beta{background:#111111}\n",
    facts: {
      byNode: [{ name: "Root", appearance: { background: "#111111" } }],
    },
    tokenMap: {},
    sharedPrefixes: { "ds-alpha": ["synth"], "ds-beta": ["synth"] },
  });
  assert.equal(
    r.overridden,
    0,
    "two different prefixes' root rules must never be treated as the same subject",
  );
  assert.equal(
    r.mismatch,
    1,
    ".ds-alpha paints #222222, which the capture (#111111) contradicts, and " +
      "that must be reported, not silenced",
  );
  assert.equal(
    r.verified,
    1,
    ".ds-beta paints #111111, which the capture agrees with",
  );
  assert.ok(
    r.mismatches.some(function (m) {
      return /ds-alpha/.test(m.selector) && /#222222/.test(m.message);
    }),
    "the mismatch names .ds-alpha and its wrong color, got: " +
      JSON.stringify(r.mismatches),
  );
});

// Non-vacuity for the real tag-stage remedy: fixing the synthetic case above
// must not break the one place this exact structural pattern (one slug, two
// prefixes) exists for real. tag-stage's fragment renders BOTH
// `.ds-tag--orange` and `.ds-tag-stage--orange` on the literal SAME element
// (`class="ds-tag ds-tag-stage ds-tag--orange ds-tag-stage--orange"`), so
// unlike the root-bucket synthetic case above, these two rules genuinely
// share one subject, and the modifier VALUE they both carry ("orange") is
// itself the disambiguating signal a bare root selector lacks. They must
// still resolve as overridden 2, not regress into 2 new mismatches.
test("classifySlug: the real tag-stage cross-prefix modifier override still resolves as overridden, not a mismatch", function () {
  var r = C.classifySlug({
    slug: "tag-stage",
    prefixes: ["ds-tag", "ds-tag-stage"],
    css:
      ".ds-tag--orange { border-color: var(--zen-color-error-50); }\n" +
      ".ds-tag-stage--orange { border-color: var(--zen-color-error-100); }\n",
    facts: FACTS_STAGE,
    tokenMap: TOK_TAG,
    sharedPrefixes: { "ds-tag": ["read-only-tag", "tag-stage"] },
  });
  assert.equal(r.mismatch, 0);
  assert.equal(r.overridden, 1);
  assert.equal(r.verified, 1);
});

// ---------------------------------------------------------------------------
// Final-review finding 1: STATE_RE used to be tested against the WHOLE
// comma-separated selector before any splitting, while rightmost (and
// therefore classifySelector's bucket decision) read only the FIRST
// alternative. That asymmetry meant a grouped selector could silence a real
// defect: appending an unrelated alternative after a genuinely comparable
// one made the WHOLE rule read as state/element, so its wrong color landed
// in unverifiable instead of mismatch. A future engineer could turn a red
// build green by refactoring a selector into a group, with no code change to
// the color itself -- exactly the "make the red go away" path this gate
// exists to close.
//
// Case B (reviewer-reproduced): a plain, comparable root selector with a
// wrong color is caught. Grouping it with its own :hover alternative must
// not change that: the root alternative is still genuinely reachable, a
// trailing :hover alternative only ADDS reach, it does not revoke it.
// ---------------------------------------------------------------------------

test("classifySlug: Case B, a wrong color on a root selector survives being grouped with its own :hover alternative", function () {
  var caught = C.classifySlug({
    slug: "segmented-control",
    prefixes: ["ds-segmented"],
    css: ".ds-segmented { background: var(--zen-bad); }",
    facts: FACTS_PLAIN,
    tokenMap: TOK,
    sharedPrefixes: {},
  });
  assert.equal(caught.mismatch, 1, "sanity: the ungrouped selector is caught");

  var grouped = C.classifySlug({
    slug: "segmented-control",
    prefixes: ["ds-segmented"],
    css: ".ds-segmented, .ds-segmented:hover { background: var(--zen-bad); }",
    facts: FACTS_PLAIN,
    tokenMap: TOK,
    sharedPrefixes: {},
  });
  assert.equal(
    grouped.mismatch,
    1,
    "the root alternative is still a comparable subject; grouping it with " +
      ":hover must not silence its wrong color",
  );
  assert.equal(grouped.unverifiable, 0);
});

// Case C (reviewer-reproduced): the same wrong color, but the comparable
// root alternative is now SECOND in the group, preceded by an unrelated BEM
// element alternative. rightmost/classifySelector reading only the first
// alternative bucketed the whole rule as "element" and the mismatch never
// reached the report.
test("classifySlug: Case C, a wrong color on a root selector survives being grouped after an unrelated element alternative", function () {
  var r = C.classifySlug({
    slug: "segmented-control",
    prefixes: ["ds-segmented"],
    css: ".ds-segmented__nothing, .ds-segmented { background: var(--zen-bad); }",
    facts: FACTS_PLAIN,
    tokenMap: TOK,
    sharedPrefixes: {},
  });
  assert.equal(
    r.mismatch,
    1,
    "the second alternative is still a comparable root subject; a leading " +
      "unrelated element alternative must not silence its wrong color",
  );
  assert.equal(r.unverifiable, 0);
});

// Non-vacuity 1: two DIFFERENT comparable alternatives (two distinct
// modifiers) cannot be resolved to one subject without guessing which one
// the capture should be compared against. This must stay unverifiable
// (selector-not-attributable), never a false verified and never a false
// mismatch -- the fix must not overreach into inventing a subject where none
// is confidently nameable.
test("classifySlug: two DIFFERENT comparable alternatives in one group cannot be resolved to a single subject", function () {
  var r = C.classifySlug({
    slug: "widget",
    prefixes: ["ds-widget"],
    css: ".ds-widget--a, .ds-widget--b { background: var(--zen-bad); }",
    facts: FACTS_PLAIN,
    tokenMap: TOK,
    sharedPrefixes: {},
  });
  assert.equal(r.mismatch, 0);
  assert.equal(r.verified, 0);
  assert.equal(r.reasons["selector-not-attributable"], 1);
});

// Non-vacuity 2: a group whose alternatives ALL land in the same
// non-comparable bucket must keep that specific bucket (and its specific
// `reasons` entry), not collapse into "other" just because it has more than
// one alternative. This is the real corpus's own shape: ds-base.css's
// `.ds-lineage-node__source, .ds-lineage-node__key` and
// `.ds-calendar-data-selector__day.is-selected, .ds-calendar-data-selector__day.is-range-start, ...`
// groups, both already element-only / state-only today.
test("classifySlug: a group whose alternatives are all the same non-comparable bucket keeps that bucket, not other", function () {
  var elementGroup = C.classifySelector(
    ".ds-widget__a, .ds-widget__b",
    "ds-widget",
  );
  assert.deepEqual(elementGroup, { bucket: "element" });

  var stateGroup = C.classifySelector(
    ".ds-widget:hover, .ds-widget:focus",
    "ds-widget",
  );
  assert.deepEqual(stateGroup, { bucket: "state" });
});
