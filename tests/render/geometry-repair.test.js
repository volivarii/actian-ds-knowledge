"use strict";

// The repair half of the fidelity workflow: turning a finding into the exact
// declaration that settles it, and writing it without lying about having done so.
//
// Every test here runs on synthetic CSS, because the two failure modes that
// matter are both about TEXT, not about components: an anchor that matches the
// wrong occurrence, and an edit that changes nothing while reporting success.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const R = require("../../scripts/render/lib/geometry-repair.js");
const G = require("../../scripts/render/geometry-classify.js");
const E = require("../../scripts/render/fidelity-explain.js");

const TOKENS = {
  "--zen-spacing-2xs": "4px",
  "--zen-spacing-xs": "8px",
  "--zen-spacing-sm": "12px",
  "--zen-spacing-md": "16px",
  "--zen-wrong": "99px",
};

function proposalsFor(css, mismatches) {
  return R.proposals({
    css: css,
    tokenMap: TOKENS,
    mismatches: mismatches,
    expandPadding: G.expandPadding,
  });
}

test("a repair binds the token the capture names, and only when it resolves", function () {
  assert.equal(R.valueFor(8, "--zen-spacing-xs", TOKENS), "var(--zen-spacing-xs)");
  // Figma left this one unbound: state the number.
  assert.equal(R.valueFor(14, null, TOKENS), "14px");
  assert.equal(R.valueFor(0, null, TOKENS), "0");
  // A token that does NOT resolve to the captured number must not be bound.
  // Trading a wrong number for a wrong number behind a token name is worse:
  // the next reader sees a binding and stops looking.
  assert.equal(R.valueFor(8, "--zen-wrong", TOKENS), "8px");
  assert.equal(R.valueFor(8, "--zen-never-defined", TOKENS), "8px");
});

test("a rule is found past the comment above it, and refused when ambiguous", function () {
  // ds-base.css writes a comment above most rules. The rule regex folds it into
  // the following rule's selector text, so `.a` never matched
  // `/* note */\n.a`. That is not a corner case: it is the shape of the file.
  const css = "/* a note about a */\n.a { gap: 4px; }\n.b { gap: 8px; }";
  const found = R.findRule(css, ".a");
  assert.ok(found.rule, "the comment above the rule hid it");
  assert.match(found.rule.body, /gap: 4px/);
  // And the offsets must still address the ORIGINAL text, or an edit computed
  // here lands somewhere else.
  assert.equal(css.slice(found.rule.start, found.rule.end).includes(".a {"), true);

  const dupe = ".a { gap: 4px; }\n.a { gap: 8px; }";
  const ambiguous = R.findRule(dupe, ".a");
  assert.equal(ambiguous.rule, null, "two rules share the selector");
  assert.equal(ambiguous.count, 2);
  assert.equal(R.findRule(css, ".nope").count, 0);
});

test("a declaration is read past a comment that contains a colon", function () {
  // `.ds-page-header`'s own comment reads "lg top / xl horizontal / 0 bottom:
  // top gap from the app header". Splitting the raw body on `;` and taking the
  // first `:` reads THAT colon, and the padding after it disappears: the repair
  // then reported "the rule states neither the side nor the shorthand" about a
  // rule that states the shorthand plainly.
  const body =
    "\n  display: flex;\n  /* lg top / 0 bottom: gap from the header */\n  padding: 16px 32px 0;\n";
  const decls = R.declarations(body);
  const props = decls.map((d) => d.property);
  assert.ok(props.includes("padding"), "the padding vanished behind a comment: " + props);
  const padding = decls.find((d) => d.property === "padding");
  assert.equal(padding.value, "16px 32px 0");
  // The offsets address the value in the ORIGINAL body.
  assert.equal(body.slice(padding.valueStart, padding.valueEnd), "16px 32px 0");
});

test("a padding shorthand is rewritten whole, keeping the sides that agree", function () {
  const css = ".a { padding: var(--zen-spacing-md) var(--zen-spacing-md); }";
  const made = proposalsFor(css, [
    {
      slug: "a",
      selector: ".a",
      property: "padding-left",
      painted: 16,
      fact: 8,
      factToken: "--zen-spacing-xs",
    },
    {
      slug: "a",
      selector: ".a",
      property: "padding-right",
      painted: 16,
      fact: 8,
      factToken: "--zen-spacing-xs",
    },
  ]);
  assert.equal(made.refused.length, 0, JSON.stringify(made.refused));
  // ONE edit, not two: four sides inside one shorthand are one declaration, or
  // the file gets rewritten repeatedly over the same characters.
  assert.equal(made.proposals.length, 1);
  const p = made.proposals[0];
  assert.equal(p.property, "padding");
  // top and bottom agreed, so they keep their own binding rather than being
  // restated as a number.
  assert.equal(p.to, "var(--zen-spacing-md) var(--zen-spacing-xs)");
});

test("a longhand is rewritten in place, and the last one is the one that paints", function () {
  const css = ".a { padding-left: 4px; padding-left: 12px; }";
  const made = proposalsFor(css, [
    { slug: "a", selector: ".a", property: "padding-left", painted: 12, fact: 8, factToken: null },
  ]);
  assert.equal(made.proposals.length, 1);
  assert.equal(made.proposals[0].from, "12px", "the overridden first one is not what paints");
  assert.equal(made.proposals[0].to, "8px");
});

test("a disagreement the rule does not state is refused, not invented", function () {
  const css = ".a { gap: 4px; }";
  const made = proposalsFor(css, [
    { slug: "a", selector: ".a", property: "height", painted: 40, fact: 32, factToken: null },
  ]);
  assert.equal(made.proposals.length, 0);
  assert.equal(made.refused.length, 1);
  assert.match(made.refused[0].reason, /states no `height`/);
});

test("apply splices the value and leaves the rest of the file alone", function () {
  const css = "/* note */\n.a { display: flex; gap: var(--zen-spacing-2xs); color: red; }\n.b { gap: 1px; }";
  const made = proposalsFor(css, [
    { slug: "a", selector: ".a", property: "gap", painted: 4, fact: 8, factToken: "--zen-spacing-xs" },
  ]);
  const out = R.apply(css, made.proposals);
  assert.match(out.css, /\.a \{ display: flex; gap: var\(--zen-spacing-xs\); color: red; \}/);
  assert.match(out.css, /\.b \{ gap: 1px; \}/, "an unrelated rule was touched");
  assert.equal(out.applied.length, 1);
});

test("apply refuses when the anchor has moved, and writes nothing", function () {
  // The failure this exists for: offsets computed against one revision of the
  // file, applied to another. The edit lands mid-declaration, the file still
  // parses, and the run reports success.
  const css = ".a { gap: var(--zen-spacing-2xs); }";
  const made = proposalsFor(css, [
    { slug: "a", selector: ".a", property: "gap", painted: 4, fact: 8, factToken: "--zen-spacing-xs" },
  ]);
  const moved = "/* something inserted above */\n" + css;
  assert.throws(
    () => R.apply(moved, made.proposals),
    /is not the one this proposal was computed from/,
  );
});

test("apply refuses a no-op rather than reporting a repair it did not make", function () {
  const css = ".a { gap: 8px; }";
  // Offsets located rather than counted by hand: a wrong literal here makes the
  // OTHER guard fire and the test then proves nothing about this one.
  const at = css.indexOf("8px");
  assert.throws(
    () =>
      R.apply(css, [
        { selector: ".a", property: "gap", from: "8px", to: "8px", valueStart: at, valueEnd: at + 3 },
      ]),
    /proposes the value it already has/,
  );
});

test("write() edits the file it is given and proves the edit is in it", function () {
  // End to end on a real stylesheet copy, so the CLI path is exercised rather
  // than only the pure functions under it.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geo-repair-"));
  const target = path.join(dir, "sheet.css");
  const css = "/* the crumb rule */\n.ds-breadcrumbs { display: flex; gap: var(--zen-spacing-2xs); }\n";
  fs.writeFileSync(target, css);

  const geo = {
    mismatches: [
      {
        slug: "breadcrumb",
        selector: ".ds-breadcrumbs",
        property: "gap",
        painted: 4,
        fact: 8,
        factToken: "--zen-spacing-xs",
      },
    ],
  };
  const result = E.write("breadcrumb", geo, css, TOKENS, target);
  assert.equal(result.written, 1);
  const after = fs.readFileSync(target, "utf8");
  assert.match(after, /gap: var\(--zen-spacing-xs\)/);
  assert.doesNotMatch(after, /--zen-spacing-2xs/);
  assert.match(after, /\/\* the crumb rule \*\//, "the comment was destroyed");

  // Nothing to repair is a stated outcome, not a silent success.
  const none = E.write("breadcrumb", { mismatches: [] }, css, TOKENS, target);
  assert.equal(none.written, 0);
  assert.match(none.message, /nothing to repair/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a repair that leaves the comment beside it stating the old number says so", function () {
  // ds-base.css annotates values inline: `gap: var(--zen-spacing-2xs); /* 4 */`.
  // Rewriting the value alone leaves a comment saying 4 beside a declaration
  // that resolves to 8, and a comment contradicting the code it annotates is
  // the exact defect this whole lane keeps finding. The repair must not create
  // one silently.
  const css = ".a { gap: var(--zen-spacing-2xs); /* 4 - crumb gap */ }";
  const made = proposalsFor(css, [
    { slug: "a", selector: ".a", property: "gap", painted: 4, fact: 8, factToken: "--zen-spacing-xs" },
  ]);
  const out = R.apply(css, made.proposals);
  assert.equal(out.staleNotes.length, 1, "the stale annotation was not reported");
  assert.match(out.staleNotes[0].comment, /4 - crumb gap/);

  // The number has to come from the RESOLVED old value, not from the old text:
  // `var(--zen-spacing-2xs)` scanned for digits yields the 2 in "2xs", which
  // matches nothing and reports nothing.
  assert.deepEqual(made.proposals[0].fromPx, [4]);

  // And a comment that does NOT restate the old number is left alone, so the
  // warning means something when it appears.
  const quiet = ".a { gap: var(--zen-spacing-2xs); /* crumb gap */ }";
  const made2 = proposalsFor(quiet, [
    { slug: "a", selector: ".a", property: "gap", painted: 4, fact: 8, factToken: "--zen-spacing-xs" },
  ]);
  assert.equal(R.apply(quiet, made2.proposals).staleNotes.length, 0);
});

test("one refusal per distinct reason, not one per finding", function () {
  // A refusal is raised per FINDING, so four padding sides inside one unreadable
  // shorthand printed the same sentence four times and read as four separate
  // problems.
  const css = ".ds-fixture { padding: 0 auto; }";
  const geo = {
    bySlug: { fixture: { mismatch: 4, verified: 0, verifiedViaTokenName: 0, unverifiable: 0 } },
    mismatches: R.SIDES.map((side) => ({
      slug: "fixture",
      selector: ".ds-fixture",
      property: "padding-" + side,
      painted: 0,
      fact: 8,
      factToken: null,
    })),
  };
  const out = E.explain("fixture", geo, { bySlug: {} }, {}, css, TOKENS);
  const refusals = out.split("\n").filter((l) => l.includes("NOT PROPOSED"));
  assert.equal(refusals.length, 1, "the same refusal was printed once per side:\n" + out);
  assert.match(refusals[0], /not four plain lengths/);
});

test("the worklist ranks by disagreements and carries reach as its own column", function () {
  // Reach is a separate column on purpose. A composite score would bury the
  // caveat that the chrome components appear on every screen regardless of how
  // many patterns name them.
  const geo = {
    bySlug: {
      alpha: { mismatch: 5, verified: 0, verifiedViaTokenName: 0, unverifiable: 1 },
      beta: { mismatch: 5, verified: 2, verifiedViaTokenName: 0, unverifiable: 1 },
      gamma: { mismatch: 0, verified: 9, verifiedViaTokenName: 0, unverifiable: 0 },
    },
  };
  const out = E.worklist(geo, { bySlug: {} }, { beta: 7 });
  const body = out.split("\n").filter((l) => /^  (alpha|beta|gamma)/.test(l));
  assert.equal(body.length, 2, "a component with nothing wrong is not on a worklist");
  assert.match(body[0], /^  beta/, "the tie is broken by reach, not alphabetically");
  assert.match(out, /2 components disagree with the capture on 10 declarations/);
});
