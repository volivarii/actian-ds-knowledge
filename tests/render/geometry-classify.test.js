"use strict";

// Unit tests for the geometry classifier, written against SYNTHETIC captures.
//
// The corpus cannot exercise every branch: `verifiedViaTokenName` is zero
// across all sixty slugs today, and a branch with no live subject is a branch
// nobody has ever seen run. A gate that has never seen its own arms move is not
// a gate, so each classification outcome is provoked here on a fixture whose
// answer is fixed by construction.

const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../../scripts/render/geometry-classify.js");

const TOKENS = {
  "--zen-spacing-xs": "8px",
  "--zen-spacing-sm": "12px",
  "--zen-size-xl": "32px",
  "--zen-alias": "var(--zen-spacing-xs)",
  "--zen-not-a-length": "auto",
};

test("lengthOf resolves a var chain and keeps the OUTERMOST token", function () {
  assert.deepEqual(G.lengthOf("8px", TOKENS, 0), { px: 8, token: null });
  assert.deepEqual(G.lengthOf("0", TOKENS, 0), { px: 0, token: null });
  assert.deepEqual(G.lengthOf("var(--zen-spacing-xs)", TOKENS, 0), {
    px: 8,
    token: "--zen-spacing-xs",
  });
  // The binding this declaration MADE is the outer name. Reporting the inner
  // one would credit the CSS with a token it does not mention, and the capture
  // names what Figma bound, not what the token map forwards to.
  assert.deepEqual(G.lengthOf("var(--zen-alias)", TOKENS, 0), {
    px: 8,
    token: "--zen-alias",
  });
  // A fallback is used only when the token is undefined, matching the cascade.
  assert.deepEqual(G.lengthOf("var(--zen-missing, 4px)", TOKENS, 0), {
    px: 4,
    token: "--zen-missing",
  });
  // Anything that is not a plain length is not guessed at.
  assert.equal(G.lengthOf("auto", TOKENS, 0), null);
  assert.equal(G.lengthOf("50%", TOKENS, 0), null);
  assert.equal(G.lengthOf("calc(100% - 8px)", TOKENS, 0), null);
  assert.equal(G.lengthOf("var(--zen-not-a-length)", TOKENS, 0), null);
  assert.equal(G.lengthOf("", TOKENS, 0), null);
});

test("expandPadding follows the CSS shorthand rules, tokens included", function () {
  const one = G.expandPadding("4px", TOKENS, 0);
  assert.deepEqual(
    [one.top.px, one.right.px, one.bottom.px, one.left.px],
    [4, 4, 4, 4],
  );
  const two = G.expandPadding("0 var(--zen-spacing-sm)", TOKENS, 0);
  assert.deepEqual(
    [two.top.px, two.right.px, two.bottom.px, two.left.px],
    [0, 12, 0, 12],
  );
  const three = G.expandPadding("1px 2px 3px", TOKENS, 0);
  assert.deepEqual(
    [three.top.px, three.right.px, three.bottom.px, three.left.px],
    [1, 2, 3, 2],
  );
  const four = G.expandPadding("1px 2px 3px 4px", TOKENS, 0);
  assert.deepEqual(
    [four.top.px, four.right.px, four.bottom.px, four.left.px],
    [1, 2, 3, 4],
  );
  // The split has to survive a var() containing no spaces of its own AND one
  // that does. A naive /\s+/ tears `var(--a, 4px)` into two parts and the
  // shorthand is then read as three values.
  const spaced = G.expandPadding("0 var(--zen-missing, 6px)", TOKENS, 0);
  assert.deepEqual(
    [spaced.top.px, spaced.right.px, spaced.bottom.px, spaced.left.px],
    [0, 6, 0, 6],
  );
  // One bad part poisons the whole declaration rather than half-comparing it.
  assert.equal(G.expandPadding("0 auto", TOKENS, 0), null);
  assert.equal(G.expandPadding("1px 2px 3px 4px 5px", TOKENS, 0), null);
});

test("a gap longhand is compared only on the axis Figma measured", function () {
  // Figma stores one spacing number per frame, along its main axis. On a row
  // that is column-gap; on a column it is row-gap. The other longhand asks
  // about a distance the capture never recorded.
  assert.equal(G.kindOf("gap", "row"), "gap");
  assert.equal(G.kindOf("gap", "column"), "gap");
  assert.equal(G.kindOf("column-gap", "row"), "gap");
  assert.equal(G.kindOf("row-gap", "row"), null);
  assert.equal(G.kindOf("row-gap", "column"), "gap");
  assert.equal(G.kindOf("column-gap", "column"), null);
  assert.equal(G.kindOf("padding", "row"), "padding");
  assert.equal(G.kindOf("padding-left", "row"), "padding-left");
  assert.equal(G.kindOf("height", "row"), "height");
  assert.equal(G.kindOf("min-height", "row"), "height");
  assert.equal(G.kindOf("width", "row"), null);
  assert.equal(G.kindOf("margin", "row"), null);
});

test("a height is a fact only when the capture fixed it, except on a variant", function () {
  const hug = G.geometryOf({ sizing: { v: "hug" }, size: { h: "40px" } });
  assert.equal(G.heightFact(hug, false), null);
  assert.equal(G.heightFact(hug, true), null, "an explicit hug is a hug");

  const fixed = G.geometryOf({ sizing: { v: "fixed" }, size: { h: "40px" } });
  assert.equal(G.heightFact(fixed, false), 40);

  // 109 of the 180 captured roots carry no `sizing` at all, and a height read
  // off one of those is the height of whatever instance sat on the canvas.
  const silentRoot = G.geometryOf({ size: { h: "482px" } });
  assert.equal(G.heightFact(silentRoot, false), null);

  // A variants entry records only what DIFFERS, so stating a height IS the
  // statement. 6 of the 40 entries are this shape.
  const silentVariant = G.geometryOf({ size: { h: "24px" } });
  assert.equal(G.heightFact(silentVariant, true), 24);
});

// A capture with a row root: gap 8, padding 0/12/0/12 with the sides bound to
// a token, and a Small variant that is 24px tall.
function fixtureLayout() {
  return {
    rootName: "Size=Default",
    root: G.geometryOf({
      axis: "row",
      gap: "8px",
      gapToken: "--zen-spacing-xs",
      padding: { top: "0px", right: "12px", bottom: "0px", left: "12px" },
      paddingTokens: { right: "--zen-spacing-sm", left: "--zen-spacing-sm" },
      sizing: { h: "hug", v: "fixed" },
      size: { h: "32px" },
    }),
    variants: [
      { values: ["Small"], geometry: G.geometryOf({ size: { h: "24px" } }) },
    ],
  };
}

function classify(css, opts) {
  return G.classifySlugGeometry(
    Object.assign(
      {
        slug: "fixture",
        prefixes: ["ds-fixture"],
        css: css,
        layout: fixtureLayout(),
        tokenMap: TOKENS,
        sharedPrefixes: {},
      },
      opts || {},
    ),
  );
}

test("a declaration that matches the capture verifies", function () {
  const r = classify(
    ".ds-fixture { gap: var(--zen-spacing-xs); padding: 0 12px; height: 32px; }",
  );
  assert.equal(r.mismatch, 0, JSON.stringify(r.mismatches));
  assert.equal(r.verified, 6, "gap + four padding sides + height");
  assert.equal(r.unverifiable, 0);
});

test("a declaration the capture contradicts is a mismatch that states both numbers", function () {
  const r = classify(".ds-fixture { gap: 16px; }");
  assert.equal(r.mismatch, 1);
  assert.equal(r.verified, 0);
  const m = r.mismatches[0];
  assert.equal(m.painted, 16);
  assert.equal(m.fact, 8);
  assert.match(m.message, /states 16px but the capture measured 8px/);
  assert.match(m.message, /\.ds-fixture/, "the message must name its subject");
});

test("binding the token the capture names is agreement, not a mismatch", function () {
  // This is the branch the live corpus has never exercised: our CSS and the
  // capture name the SAME token and the two resolve to different numbers. That
  // is the spacing scale disagreeing with itself, not this component getting
  // the shape wrong, so it must not be a mismatch and must not be silently
  // folded into a plain match either.
  const drifted = Object.assign({}, TOKENS, { "--zen-spacing-xs": "10px" });
  const r = classify(".ds-fixture { gap: var(--zen-spacing-xs); }", {
    tokenMap: drifted,
  });
  assert.equal(r.mismatch, 0);
  assert.equal(r.verified, 0);
  assert.equal(r.verifiedViaTokenName, 1);
  assert.match(
    r.tokenNameAgreements[0].message,
    /binds --zen-spacing-xs, which the capture also names/,
  );
  // And the same wrong number under a DIFFERENT token is a mismatch, so the
  // branch above is doing token comparison rather than waving through anything
  // token-shaped.
  const other = classify(".ds-fixture { gap: var(--zen-spacing-sm); }");
  assert.equal(other.verifiedViaTokenName, 0);
  assert.equal(other.mismatch, 1);
});

test("a modifier is compared against its own variant entry, falling back to the base", function () {
  const r = classify(".ds-fixture--small { height: 24px; gap: 8px; }");
  assert.equal(r.mismatch, 0, JSON.stringify(r.mismatches));
  // height from the variant entry, gap from the base (the variant restates no
  // gap, and a variants entry records only what differs).
  assert.equal(r.verified, 2);

  const wrong = classify(".ds-fixture--small { height: 32px; }");
  assert.equal(wrong.mismatch, 1, "the base height must not satisfy a variant");
  assert.equal(wrong.mismatches[0].fact, 24);
});

test("every unverifiable outcome names its reason", function () {
  const cases = [
    [".ds-fixture__label { padding: 4px; }", "element-no-node-mapping"],
    [".ds-fixture:hover { gap: 4px; }", "state-unreachable"],
    [".ds-fixture--nosuchvariant { gap: 4px; }", "no-matching-variant"],
    [".ds-fixture { gap: calc(100% - 2px); }", "value-not-a-plain-length"],
    [".ds-fixture { row-gap: 4px; }", "gap-cross-axis-not-captured"],
    [".other .ds-fixture-thing .ds-fixture--a { gap: 1px; }", "no-matching-variant"],
    // Two DIFFERENT comparable subjects in one group: there is no way to pick
    // one without guessing which the capture should answer for, so the whole
    // rule is unattributable rather than charged to whichever came first.
    [".ds-fixture--small, .ds-fixture--large { gap: 1px; }", "selector-not-attributable"],
  ];
  for (const [css, reason] of cases) {
    const r = classify(css);
    assert.ok(
      r.reasons[reason],
      css + " should be unverifiable as " + reason + ", got " + JSON.stringify(r.reasons),
    );
    assert.equal(r.mismatch, 0, css + " must not also report a mismatch");
  }
});

test("a capture with no layout at all is unverifiable, never verified", function () {
  const r = classify(".ds-fixture { gap: 8px; }", { layout: null });
  assert.equal(r.verified, 0);
  assert.equal(r.mismatch, 0);
  assert.equal(r.reasons["no-capture"], 1);
});

test("a fact the capture does not hold is not compared against zero", function () {
  const noGap = {
    rootName: "Size=Default",
    root: G.geometryOf({ axis: "row", padding: { top: "4px" } }),
    variants: [],
  };
  const r = classify(".ds-fixture { gap: 8px; }", { layout: noGap });
  assert.equal(r.mismatch, 0, "an absent fact must not read as 0px");
  assert.equal(r.reasons["no-fact-of-kind"], 1);
});

test("only the rule that actually paints is classified", function () {
  // Two rules set the same subject's padding; the browser paints the second.
  // Charging the slug for the overridden one reports a defect the render never
  // draws, which is how a fixed component keeps failing.
  const r = classify(
    ".ds-fixture { padding: 99px; } .ds-fixture { padding: 0 12px; }",
  );
  assert.equal(r.mismatch, 0, JSON.stringify(r.mismatches));
  assert.equal(r.overridden, 4, "the four losing sides are not paint");
  assert.equal(r.verified, 4);
  // And the shorthand/longhand pair collapses on the SUBJECT, not on the
  // property name: `padding` then `padding-left` is a real override.
  const mixed = classify(
    ".ds-fixture { padding: 0 12px; } .ds-fixture { padding-left: 99px; }",
  );
  assert.equal(mixed.mismatch, 1);
  assert.equal(mixed.mismatches[0].property, "padding-left");
  assert.equal(mixed.overridden, 1);
});

test("a root rule on a capture of a non-default STATE has no comparable subject", function () {
  const hovered = fixtureLayout();
  hovered.rootName = "State=Hovered, Size=Default";
  const r = classify(".ds-fixture { gap: 4px; }", { layout: hovered });
  assert.equal(r.mismatch, 0);
  assert.equal(r.reasons["root-is-non-default-state"], 1);
});

test("a shared base prefix has no single subject to compare against", function () {
  const r = classify(".ds-fixture { gap: 4px; }", {
    sharedPrefixes: { "ds-fixture": ["fixture", "other-slug"] },
  });
  assert.equal(r.mismatch, 0);
  assert.equal(r.reasons["shared-base-no-single-subject"], 1);
});
