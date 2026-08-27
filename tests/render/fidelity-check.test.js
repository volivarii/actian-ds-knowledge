"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var D = require("../../scripts/render/derive-canonical.js");
var F = require("../../scripts/render/fidelity-check.js");
var A = require("../../scripts/render/derive-appearance.js");
var ANATOMY = path.resolve(__dirname, "../../components/dist/anatomy");
var REPO_ROOT = path.resolve(__dirname, "../..");

test('fidelityCheck: the real derive has zero source:"derived" renders today, so the loop has nothing to examine', function () {
  // TEMPLATES (templates/index.js) went empty in phase 1b-beta, so no slug in
  // the real derive carries source:"derived" and fidelityCheck's loop body
  // never runs. Asserting the real derive's violations deep-equal [] would
  // read like a passing verification while actually exercising an
  // unreachable code path: it would pass even if a real color/token
  // regression landed, because nothing would be examined either way.
  // Pinning the precondition instead makes that fact loud: the day a slug
  // is templated again, derivedCount stops being 0, this assertion fails,
  // and the failure message is the signal that the fidelity gate just went
  // live and needs real coverage (see the sibling "a wrong derived color is
  // caught" test below for how that coverage already works once it's live).
  var out = D.deriveCanonical();
  var derivedCount = (out.manifest.renders || []).filter(function (r) {
    return r.source === "derived";
  }).length;
  assert.equal(
    derivedCount,
    0,
    'a render now carries source:"derived", so fidelityCheck\'s loop is live ' +
      "and this precondition test's job is done; replace it with real " +
      "coverage of that render's derived-from-facts CSS",
  );
});

test("fidelityCheck: a wrong derived color is caught", function () {
  // fidelityCheck is retained for a future escape-hatch template, but no real
  // slug is templated now, so construct the source:"derived" canonical inline.
  // #123456 is not a tag-read-only appearance fact color, so the gate must name
  // it. Deliberately fabricated rather than a real DS colour: this sentinel was
  // #000000 until the 2026-07-23 capture made that a genuine tag-read-only fact
  // (the label text), quietly turning the assertion into a no-op. A colour the
  // palette can never adopt cannot go stale.
  var canonical = {
    css: "/* tag-read-only (derived-from-facts) */\n.ds-tag--pink{background:#123456}\n",
    manifest: { renders: [{ slug: "tag-read-only", source: "derived" }] },
  };
  var v = F.fidelityCheck(canonical, { anatomyDir: ANATOMY, tokenMap: {} });
  assert.ok(
    v.some(function (m) {
      return /tag-read-only/.test(m) && /pink/.test(m);
    }),
    "violation names the bad color, got: " + JSON.stringify(v),
  );
});

test("fidelityCheck: an empty derived CSS block cannot pass silently", function () {
  // A render stamped source:"derived" with no derived-from-facts block to verify
  // must red, not pass silently.
  var canonical = {
    css: "",
    manifest: { renders: [{ slug: "tag-read-only", source: "derived" }] },
  };
  var v = F.fidelityCheck(canonical, { anatomyDir: ANATOMY, tokenMap: {} });
  assert.ok(
    v.some(function (m) {
      return (
        /^tag-read-only:/.test(m) && /no derived-from-facts CSS block/.test(m)
      );
    }),
    "violation names tag-read-only and the missing block, got: " +
      JSON.stringify(v),
  );
});

// Phase 1b-alpha: the tag color variants + the checkbox indeterminate rule
// live directly in ds-base.css (outside the derived-from-facts appendix
// covered above), so their fact-color correctness needs its own coverage.
// The fixture facts map here used to be a copy of the CLI's hand-typed
// registration (five tag slugs + checkbox, by name). It is derived now, from the
// same helper the CLI uses, so the two can no longer disagree -- and so the
// deletion of a capture shows up as a REPORTED rule rather than an ENOENT that
// takes the whole file down.
// The first `.ds-tag--<modifier>` rule carrying a colour declaration whose
// exact text occurs exactly once in the whole sheet, so a String.replace of it
// corrupts that rule and nothing else. Comments are not stripped: the probe
// must corrupt the sheet as checkBaseCssRules will read it.
function firstUniqueTagModifierHex(css) {
  var re = /(\.ds-tag--([a-z0-9-]+))\s*\{([^}]*)\}/g;
  var m;
  while ((m = re.exec(css)) !== null) {
    var body = m[3].replace(/\/\*[\s\S]*?\*\//g, "");
    var d =
      /(background|background-color|color|border-color)\s*:\s*(#[0-9a-fA-F]{3,8});/.exec(
        body,
      );
    if (d && css.split(d[0]).length - 1 === 1) {
      return { selector: m[1], modifier: m[2], decl: d[0], prop: d[1] };
    }
  }
  return null;
}

test("checkBaseCssRules: no real ds-base.css tag/checkbox rule contradicts its owner's capture, and every unverifiable rule is named", function () {
  var dsBaseCss = fs.readFileSync(
    path.join(REPO_ROOT, "components", "render", "renderer", "ds-base.css"),
    "utf8",
  );
  var tokenMap = A.loadTokenMap(
    fs.readFileSync(path.join(REPO_ROOT, "tokens", "tokens.css"), "utf8"),
  );
  var src = F.baseCssFactSources(ANATOMY);
  var v = F.checkBaseCssRules(dsBaseCss, src.facts, tokenMap, src.uncaptured);
  // Two kinds of violation, and only one of them is a defect in the CSS:
  //  - a colour the owner's capture CONTRADICTS. There must be none.
  //  - a rule whose owner has no capture at all, so it cannot be verified
  //    either way. The 2026-08-12 sync retired five tag-family slugs and
  //    deleted their captures while their rules and renderer cases stayed, so
  //    this bucket is non-empty today and empties again when those rules are
  //    retired with their slugs. It is asserted, not tolerated: each one must
  //    name a slug the derive independently reported as uncaptured.
  var unverifiable = v.filter(function (m) {
    return /has no appearance capture/.test(m);
  });
  var contradictions = v.filter(function (m) {
    return !/has no appearance capture/.test(m);
  });
  assert.deepEqual(
    contradictions,
    [],
    "a real ds-base.css rule paints a colour its owner's capture contradicts",
  );
  unverifiable.forEach(function (m) {
    assert.ok(
      src.uncaptured.some(function (slug) {
        return m.indexOf(" " + slug + " ") !== -1;
      }),
      "an unverifiable-rule violation must name one of the slugs the derive " +
        "reported as uncaptured (" +
        JSON.stringify(src.uncaptured) +
        "), got: " +
        m,
    );
  });
  // Non-vacuity: corrupt a REAL multi-line tag rule in ds-base.css and confirm
  // the gate catches it. Guards against a selector-regex regression that would
  // silently match nothing, making the pass above vacuous.
  //
  // The specimen is DERIVED. This used to replace the literal string
  // "background: #ffd6d8;", spelled out beside the comment ".ds-tag--pink is
  // owned by tag-read-only" -- and #ffd6d8 stopped being tag-read-only's Pink fill
  // on the 2026-08-12 fold-in (it is Type=Stage-4's border now, and the first
  // occurrence of that hex in the sheet moved to a rule this gate does not even
  // scan). A hand-copied specimen for a non-vacuity probe fails in the worst
  // direction: it stops corrupting anything and the probe passes.
  var spec = firstUniqueTagModifierHex(dsBaseCss);
  assert.ok(
    spec,
    "no uniquely-locatable hex declaration under a .ds-tag--<modifier> rule " +
      "was found, so the non-vacuity probe has nothing to corrupt",
  );
  var corrupted = dsBaseCss.replace(spec.decl, spec.prop + ": #123456;");
  assert.notEqual(
    corrupted,
    dsBaseCss,
    "the real " + spec.selector + " declaration was located for corruption",
  );
  var vBad = F.checkBaseCssRules(
    corrupted,
    src.facts,
    tokenMap,
    src.uncaptured,
  );
  assert.ok(
    vBad.some(function (m) {
      return m.indexOf(spec.selector) !== -1 && /#123456/.test(m);
    }),
    "corrupting a real multi-line rule is caught, got: " + JSON.stringify(vBad),
  );
});

test("checkBaseCssRules: a fabricated modifier cannot pass by borrowing a sibling member's fact (per-owner, not union)", function () {
  // A prior version of checkBaseCssRules unioned every "tag*" fact set together
  // before checking any rule, so a fabricated .ds-tag--bogus rule passed on any
  // value ANY sibling in the map had captured, even though no source owning the
  // "bogus" modifier ever captured it.
  //
  // The borrowed value is DERIVED. Two hand-picked sentinels have already gone
  // stale here: #000000 (the 2026-07-23 capture gave tag-read-only the same label
  // colour) and then tag-status's #fff4ec (the 2026-08-12 fold-in gave
  // tag-read-only that fill), and a stale sentinel stops discriminating in
  // silence. Take a colour some other registered source really owns and
  // tag-read-only really does not, whatever those captures happen to be today.
  // The producer relation is stated by the fixture rather than left to a
  // slug-name coincidence: `.ds-tag--hue` is produced by tag-alpha, and tag-beta
  // is a sibling entry in the SAME facts map that produces nothing here.
  var tagDefault = A.readAppearance("tag-read-only", ANATOMY);
  var sibling = A.readAppearance("checkbox", ANATOMY);
  var own = F.factColors(tagDefault);
  var borrowed = hexOnly(F.factColors(sibling)).filter(function (c) {
    // checkRuleBody scans hex literals and var() references, so an rgba() fact
    // cannot exercise it.
    return !own.has(c);
  })[0];
  assert.ok(
    borrowed,
    "no sibling colour outside tag-read-only's own capture is available to " +
      "borrow, so this test cannot discriminate",
  );
  var facts = { "tag-alpha": tagDefault, "tag-beta": sibling };
  var index = { byClass: { "ds-tag--hue": ["tag-alpha"] }, failed: [] };
  var v = F.checkBaseCssRules(
    ".ds-tag--hue { background: " + borrowed + "; }\n",
    facts,
    {},
    [],
    index,
  );
  assert.ok(
    v.some(function (m) {
      return /\.ds-tag--hue/.test(m) && m.indexOf(borrowed) !== -1;
    }),
    "a rule produced by tag-alpha, carrying tag-beta's " +
      borrowed +
      ", must violate: a sibling's capture in the same map is not evidence, " +
      "got: " +
      JSON.stringify(v),
  );
  // The other direction, so the assertion above is not just "everything reds":
  // a colour the PRODUCER really owns passes.
  var mine = hexOnly(own)[0];
  assert.deepEqual(
    F.checkBaseCssRules(
      ".ds-tag--hue { background: " + mine + "; }\n",
      facts,
      {},
      [],
      index,
    ),
    [],
    "a rule carrying a colour its own producer captured must pass",
  );
});

test("checkBaseCssRules: a hyphenated modifier is checked against its own owner, not silently skipped", function () {
  // Regression coverage for the regex-width bug: the modifier char class used
  // to be [a-z0-9]+, which cannot cross a hyphen, so the grouped
  // .ds-tag--status-<x> rules were silently never checked -- a fabricated
  // #123456 in one of them produced 0 violations.
  //
  // Both the producer relation and the capture are stated by the fixture. The
  // property under test is that the compound modifier CLASS is matched and
  // charged to its producer; proving that by reading a live capture is what made
  // this fixture die with an uncaught ENOENT the day the 2026-08-12 sync retired
  // tag-status, and then made it depend on a slug-name coincidence.
  var facts = {
    "tag-status": { variants: [{ background: "#0a0b0c" }], byNode: [] },
    "tag-other": { variants: [{ background: "#123456" }], byNode: [] },
  };
  var index = {
    byClass: {
      "ds-tag--status-error": ["tag-status"],
      "ds-tag--other": ["tag-other"],
    },
    failed: [],
  };
  assert.deepEqual(
    F.checkBaseCssRules(
      ".ds-tag--status-error{background:#0a0b0c}",
      facts,
      {},
      [],
      index,
    ),
    [],
    "the compound modifier must be charged to tag-status, which owns #0a0b0c",
  );
  var v = F.checkBaseCssRules(
    ".ds-tag--status-error{background:#123456}",
    facts,
    {},
    [],
    index,
  );
  assert.ok(
    v.some(function (m) {
      return (
        /^ds-base\.css/.test(m) &&
        /\.ds-tag--status-error/.test(m) &&
        /#123456/.test(m)
      );
    }),
    "violation names ds-base.css, the hyphenated selector, and the bad color, got: " +
      JSON.stringify(v),
  );
  assert.ok(
    F.checkBaseCssRules(
      ".ds-tag--other{background:#0a0b0c}",
      facts,
      {},
      [],
      index,
    ).length > 0,
    "tag-status's colour must NOT excuse the same value on a rule tag-other " +
      "produces: per-producer, not a union",
  );
});

test("checkBaseCssRules: a hex mentioned in a comment inside the rule body is not read as an emitted declaration", function () {
  // The real .ds-tag--status-* rules (unlike the single-word rules above them)
  // carry their value-first explanatory comment INSIDE the braces, and that
  // comment text itself mentions hex codes (the non-round-tripping token's
  // resolved value) that are NOT emitted declarations. This fixture mirrors that
  // shape.
  //
  // It used to assert against the real sheet with the real tag-status/-catalog/
  // -shared/-stage captures in scope, which is why it died with an uncaught
  // ENOENT once the 2026-08-12 sync deleted four of them. Comment stripping is a
  // property of checkRuleBody and needs no live capture to prove; whether the
  // real sheet is clean is asserted by the sibling test above, against the
  // derived fact sources.
  var facts = {
    "tag-status": { variants: [{ background: "#0a0b0c" }], byNode: [] },
  };
  var index = {
    byClass: { "ds-tag--status-error": ["tag-status"] },
    failed: [],
  };
  var css =
    ".ds-tag--status-error {\n" +
    "  /* value-first: resolves to #f8f4f3 in tokens.css, which does NOT " +
    "round-trip */\n" +
    "  background: #0a0b0c;\n" +
    "}\n";
  assert.deepEqual(
    F.checkBaseCssRules(css, facts, {}, [], index),
    [],
    "a hex named only inside a comment must not be scanned as a declaration",
  );
  // Non-vacuity: the very same hex, emitted for real, IS scanned and flagged.
  var live = css.replace("background: #0a0b0c;", "background: #f8f4f3;");
  assert.ok(
    F.checkBaseCssRules(live, facts, {}, [], index).some(function (m) {
      return /#f8f4f3/.test(m);
    }),
    "the same value as a real declaration must be flagged, so the pass above " +
      "is not the scanner missing the rule body altogether",
  );
});

// The former "resolveTagOwner: compound modifier resolves by
// longest-registered-prefix, falls back to tag-read-only" test is gone with the
// function it covered. That resolution WAS the defect: its terminal fallback
// adopted any modifier no key matched, so a rule whose producer had been deleted
// was charged to tag-read-only and passed on tag-read-only's evidence. What owns a
// rule is now read off the renderer's output (see the orphan and reuse tests
// below), and there is no name-shaped fallback left to test.

var MATRIX = require("../../components/render/renderer/matrix.js");

// Mirrors derive-canonical.js's own stripComments: buildDeclaration scans
// cemStyle (assetBase + PAGE_CSS with comments stripped), not the raw
// out.css, so a comment referencing a --zen-* token inside a rule body
// would otherwise read as a false positive here. Kept local rather than a
// new export, since Task 2 adds no new exports.
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
}

test("every CEM declaration ships a non-empty cssProperties token surface (#474)", function () {
  var out = D.deriveCanonical();
  var empty = [];
  (out.cem.modules || []).forEach(function (mod) {
    (mod.declarations || []).forEach(function (decl) {
      var slug = String(mod.path || "")
        .replace(/^.*\//, "")
        .replace(/\.[^.]*$/, "");
      if (!decl.cssProperties || decl.cssProperties.length === 0)
        empty.push(slug);
    });
  });
  assert.deepEqual(empty, [], "CEM declarations with an empty token surface");
});

// Every slug's CEM token surface must be the UNION over its owned prefixes.
//
// This was written as "tag-stage's token surface unions BOTH of its owned
// prefixes", tag-stage being the repo's only multi-prefix slug. The 2026-08-12
// fold-in retired it, and the test then failed on `mod.declarations[0]` of an
// undefined module -- a hardcoded specimen for a property that belongs to the
// derive, not to one component. Applied to every render slug instead: the
// union property is identical for a one-prefix slug (the union of one set), so
// the assertion is unchanged in kind and now covers the whole corpus rather
// than a single specimen that could retire.
test("every render slug's CEM token surface unions all of its owned prefixes", function () {
  var out = D.deriveCanonical();
  var style = stripComments(out.css);
  var byPath = {};
  (out.cem.modules || []).forEach(function (m) {
    byPath[
      String(m.path || "")
        .replace(/^.*\//, "")
        .replace(/\.[^.]*$/, "")
    ] = m;
  });
  var probed = 0;
  var failures = [];
  MATRIX.RENDER_SLUGS.forEach(function (slug) {
    var mod = byPath[slug];
    if (!mod || !mod.declarations || !mod.declarations.length) {
      failures.push(slug + ": no CEM module/declaration at all");
      return;
    }
    var names = (mod.declarations[0].cssProperties || []).map(function (p) {
      return p.name;
    });
    var expected = new Set();
    MATRIX.ownedPrefixes(slug).forEach(function (p) {
      D.consumedVars(style, p).forEach(function (v) {
        expected.add(v);
      });
    });
    if (!expected.size) return; // a prefix consuming no token proves nothing
    probed++;
    expected.forEach(function (v) {
      if (names.indexOf(v) === -1) {
        failures.push(
          slug +
            ": " +
            v +
            " is contributed by an owned prefix but not in the CEM",
        );
      }
    });
  });
  assert.ok(probed > 1, "the ownership probe itself found nothing to check");
  assert.deepEqual(failures, [], failures.join("; "));
});

// The #472 regression: consumedVars' selector regex must keep rejecting a
// single trailing hyphen so `.ds-loader` does not absorb `.ds-loader-with-logo`.
test("consumedVars still separates hyphen-prefix slug pairs", function () {
  var css =
    ".ds-loader { color: var(--zen-a); } .ds-loader-with-logo { color: var(--zen-b); }";
  assert.deepEqual(D.consumedVars(css, "ds-loader"), ["--zen-a"]);
  assert.deepEqual(D.consumedVars(css, "ds-loader-with-logo"), ["--zen-b"]);
});

// Which fact sources checkBaseCssRules needs used to be a hand-typed object
// literal in the CLI, copied into four fixtures in this file. The 2026-08-12
// breaking sync retired five tag-family slugs and deleted their anatomy while
// the literal still named four of them, so `npm run derive:render` died with an
// uncaught ENOENT inside readAppearance before a single number was computed --
// the gate could not run at all. The same literal was ALSO wrong in the
// opposite direction the whole time: it omitted tag-glossary-item-type and
// tag-catalog-item-type, which do own ds-tag-family rules. One hand-typed list,
// two opposite errors, neither of which any check could see.
//
// The first fix derived the owner set from CSS prefix OWNERSHIP, which review
// found had the mirror-image hole: a slug can drop out of that set (its renderer
// case deleted) and take its own regression with it, because the resolution then
// fell through to a terminal "must be tag-read-only" and adopted the orphan rule
// silently. The relation is REVERSED now, and it is the only one that answers
// the question the gate is actually asking: which slug PRODUCES this class, read
// off the renderer's own output across the slug's whole variant matrix. These
// tests are what makes that relation answerable to reality in both directions.
function checkedClass(cls) {
  return /^ds-tag--/.test(cls) || cls === "ds-checkbox--indeterminate";
}

function hexOnly(colors) {
  return Array.from(colors).filter(function (c) {
    return /^#[0-9a-f]{3,8}$/.test(c);
  });
}

test("baseCssFactSources: every slug that PRODUCES a checked ds-base.css class is a fact source, captured or reported", function () {
  var src = F.baseCssFactSources(ANATOMY);
  var index = F.classEmitterIndex();
  assert.deepEqual(
    index.failed,
    [],
    "a render slug the renderer could not render at all: the producer index is " +
      "incomplete, so every rule it would have claimed looks like an orphan",
  );
  var producers = {};
  Object.keys(index.byClass).forEach(function (cls) {
    if (!checkedClass(cls)) return;
    index.byClass[cls].forEach(function (slug) {
      producers[slug] = 1;
    });
  });
  var claimed = Object.keys(producers).sort();
  assert.ok(
    claimed.length > 1,
    "the producer probe itself found nothing, so this test proves nothing",
  );
  claimed.forEach(function (slug) {
    var captured = Object.prototype.hasOwnProperty.call(src.facts, slug);
    var reported = src.uncaptured.indexOf(slug) !== -1;
    assert.ok(
      captured || reported,
      slug +
        " produces a class this gate checks but is neither captured nor reported",
    );
    assert.notEqual(
      captured,
      reported,
      slug + " is both captured and reported as uncaptured",
    );
    assert.equal(
      captured,
      fs.existsSync(path.join(ANATOMY, slug + ".json")),
      slug + ": the derived fact map disagrees with the anatomy dist on disk",
    );
  });
  // The other direction, which the prefix-ownership derive got wrong: nothing
  // that produces none of the checked classes may be dragged in, and nothing
  // that produces one may be left out.
  Object.keys(src.facts)
    .concat(src.uncaptured)
    .forEach(function (slug) {
      assert.ok(
        claimed.indexOf(slug) !== -1,
        slug +
          " is registered as a fact source but produces none of the classes " +
          "this gate checks",
      );
    });
});

test("checkBaseCssRules: a rule no render slug produces is reported as an orphan, never adopted by tag-read-only", function () {
  // The mirror-image bug review found. `.ds-tag--lime` was a real rule until the
  // fold-in deleted tag-read-only's Color axis; a modifier whose producer is gone
  // used to fall through to the terminal "resolve to tag-read-only", and because
  // the check is set membership over that ONE slug's whole capture, a value
  // tag-read-only carries anywhere -- a border colour of an unrelated Type, say --
  // passed as a background. Zero violations for a rule nothing paints.
  var index = F.classEmitterIndex();
  var retired = "ds-tag--lime";
  assert.ok(
    !index.byClass[retired],
    retired +
      " is produced again, so it is no longer an orphan and this test needs a " +
      "different specimen (that is the signal, not a failure to work around)",
  );
  var src = F.baseCssFactSources(ANATOMY);
  var borrowed = hexOnly(F.factColors(src.facts["tag-read-only"]))[0];
  assert.ok(borrowed, "tag-read-only's capture carries no colour to borrow");
  var css = "." + retired + " { background: " + borrowed + "; }\n";
  var v = F.checkBaseCssRules(css, src.facts, {}, src.uncaptured);
  assert.ok(
    v.some(function (m) {
      return m.indexOf("." + retired) !== -1 && /no render slug/.test(m);
    }),
    "a rule no slug produces must be reported as an orphan even though " +
      borrowed +
      " is somewhere in tag-read-only's capture, got: " +
      JSON.stringify(v),
  );
  // Non-vacuity: the same colour under a modifier that IS produced resolves to
  // its producer and is checked, not reported.
  var produced = Object.keys(index.byClass)
    .filter(function (cls) {
      return /^ds-tag--/.test(cls);
    })
    .sort()[0];
  assert.ok(produced, "no produced .ds-tag--<modifier> class exists at all");
  var vOk = F.checkBaseCssRules(
    "." + produced + " { background: " + borrowed + "; }\n",
    src.facts,
    {},
    src.uncaptured,
  );
  assert.ok(
    !vOk.some(function (m) {
      return /no render slug/.test(m);
    }),
    produced +
      " is produced, so it must not be reported as an orphan: " +
      JSON.stringify(vOk),
  );
});

test("checkBaseCssRules: a captured colour painted in the WRONG role is reported (a border fill is not evidence for a background)", function () {
  // The other half of review's reproduction, and the reason attribution alone
  // does not close it: `.ds-tag--catalog { background: #d0efed }` passed because
  // #d0efed IS in tag-read-only's capture -- as the BORDER of Type=Catalog. Once
  // the rule is attributed to its real producer, the check still has to know
  // which ROLE the capture recorded the value in, or any colour anywhere in the
  // component's palette passes on any property. Specimen derived from the live
  // capture: a colour this producer holds as a border and never as a background.
  var src = F.baseCssFactSources(ANATOMY);
  var index = F.classEmitterIndex();
  var soleProducer = Object.keys(index.byClass)
    .filter(function (cls) {
      return (
        /^ds-tag--/.test(cls) &&
        index.byClass[cls].length === 1 &&
        index.byClass[cls][0] === "tag-read-only"
      );
    })
    .sort()[0];
  assert.ok(
    soleProducer,
    "no .ds-tag--<modifier> class is produced by tag-read-only alone, so a " +
      "single-producer specimen is not available",
  );
  var roles = F.propertyFactColors(src.facts["tag-read-only"]);
  var borderOnly = hexOnly(roles.border).filter(function (c) {
    return !roles.background.has(c);
  })[0];
  assert.ok(
    borderOnly,
    "tag-read-only's capture holds no border colour that is not also a " +
      "background, so the role distinction cannot be told apart here",
  );
  var v = F.checkBaseCssRules(
    "." + soleProducer + " { background: " + borderOnly + "; }\n",
    src.facts,
    {},
    src.uncaptured,
  );
  assert.ok(
    v.some(function (m) {
      return (
        m.indexOf(borderOnly) !== -1 && /NOT as a background value/.test(m)
      );
    }),
    borderOnly +
      " is a captured BORDER colour, so painting it as a background must be " +
      "reported even though the value is somewhere in the capture, got: " +
      JSON.stringify(v),
  );
  // Non-vacuity: the very same colour on the property the capture recorded it
  // for passes, so this is a role check and not a blanket rejection.
  assert.deepEqual(
    F.checkBaseCssRules(
      "." + soleProducer + " { border-color: " + borderOnly + "; }\n",
      src.facts,
      {},
      src.uncaptured,
    ),
    [],
    "the same value painted as a border must pass: the capture recorded it there",
  );
});

test("checkBaseCssRules: a rule scoped to a class only a non-family slug produces is charged to THAT slug, not to tag-read-only", function () {
  // The distinction the fold-in made live. `.ds-tag-stage` and
  // `.ds-tag-stage__dot` survive in ds-base.css because search-result-card still
  // emits them, while NO slug claims the ds-tag-stage prefix any more. A rule
  // scoped to that class therefore belongs to search-result-card, and charging
  // it to tag-read-only (the only claimant of the ds-tag prefix) would check it
  // against the wrong component's capture. Both specimens are derived from the
  // two real captures, so neither can go stale.
  var index = F.classEmitterIndex();
  var scopeClass = "ds-tag-stage";
  var src = F.baseCssFactSources(ANATOMY);
  var reuser = (index.byClass[scopeClass] || [])[0];
  assert.ok(
    reuser && (index.byClass[scopeClass] || []).length === 1,
    scopeClass +
      " is not produced by exactly one slug any more, so this specimen no " +
      "longer isolates the reuse case: " +
      JSON.stringify(index.byClass[scopeClass]),
  );
  var modClass = Object.keys(index.byClass)
    .filter(function (cls) {
      return /^ds-tag--/.test(cls) && index.byClass[cls].indexOf(reuser) !== -1;
    })
    .sort()[0];
  assert.ok(
    modClass,
    reuser +
      " produces no .ds-tag--<modifier> class, so no scoped rule can " +
      "be attributed to it",
  );
  // Drawn from the BACKGROUND role of each capture, because the specimen is
  // painted as a background: a colour either capture holds only as a border
  // would be reported for the role mismatch instead, and this test would then
  // red for a reason that has nothing to do with attribution.
  var reuserColors = F.propertyFactColors(src.facts[reuser]).background;
  var tagColors = F.propertyFactColors(src.facts["tag-read-only"]).background;
  var reuserOnly = hexOnly(reuserColors).filter(function (c) {
    return !tagColors.has(c);
  })[0];
  var tagOnly = hexOnly(tagColors).filter(function (c) {
    return !reuserColors.has(c);
  })[0];
  assert.ok(
    reuserOnly && tagOnly,
    "the two captures do not disagree on any colour, so attribution cannot be " +
      "told apart here",
  );
  var scoped = "." + scopeClass + " ." + modClass + " { background: ";
  assert.deepEqual(
    F.checkBaseCssRules(
      scoped + reuserOnly + "; }\n",
      src.facts,
      {},
      src.uncaptured,
    ),
    [],
    "the scoped rule must be checked against " +
      reuser +
      "'s capture, which owns " +
      reuserOnly,
  );
  var v = F.checkBaseCssRules(
    scoped + tagOnly + "; }\n",
    src.facts,
    {},
    src.uncaptured,
  );
  assert.ok(
    v.some(function (m) {
      return m.indexOf(modClass) !== -1 && m.indexOf(tagOnly) !== -1;
    }),
    "a colour only tag-read-only owns must NOT pass on a rule only " +
      reuser +
      " can produce, got: " +
      JSON.stringify(v),
  );
});

test("checkBaseCssRules: a rule whose owner lost its capture is reported, not quietly checked against another member's", function () {
  // A rule whose PRODUCER exists but whose capture does not: the deletion the
  // 2026-08-12 sync made, seen from the other side. The producer relation is
  // stated by the fixture (tag-shared produces the rule) while the anatomy dist
  // has nothing for it, and the value is one tag-read-only really owns -- so a
  // resolver that reached for the nearest available capture would pass it.
  var real = A.readAppearance("tag-read-only", ANATOMY);
  var borrowed = hexOnly(F.factColors(real))[0];
  assert.ok(borrowed, "tag-read-only's capture carries no colour to borrow");
  var index = { byClass: { "ds-tag--shared": ["tag-shared"] }, failed: [] };
  var css = ".ds-tag--shared { background: " + borrowed + "; }\n";
  var v = F.checkBaseCssRules(
    css,
    { "tag-read-only": real },
    {},
    ["tag-shared"],
    index,
  );
  assert.ok(
    v.some(function (m) {
      return /\.ds-tag--shared/.test(m) && /tag-shared/.test(m);
    }),
    "the rule's own producer has no capture, so the rule must be reported as " +
      "unverifiable instead of borrowing tag-read-only's " +
      borrowed +
      ", got: " +
      JSON.stringify(v),
  );
  // Non-vacuity the other way: with the producer's capture present, the same rule
  // is checked normally against it and passes.
  var v2 = F.checkBaseCssRules(
    css,
    {
      "tag-read-only": real,
      "tag-shared": { variants: [{ background: borrowed }], byNode: [] },
    },
    {},
    [],
    index,
  );
  assert.deepEqual(
    v2,
    [],
    "a rule whose owner IS captured must still be checked against it, not reported",
  );
});

test("CLI: fidelity-check.js reaches a verdict when a retired slug's capture is gone, instead of dying on ENOENT", function () {
  var child_process = require("node:child_process");
  var os = require("node:os");
  var tmp = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "fidelity-enoent-")),
    "report.json",
  );
  var result = child_process.spawnSync(
    process.execPath,
    [
      path.join(REPO_ROOT, "scripts/render/fidelity-check.js"),
      "--report=" + tmp,
    ],
    { encoding: "utf8" },
  );
  var all = String(result.stdout) + String(result.stderr);
  assert.doesNotMatch(
    all,
    /ENOENT/,
    "a deleted anatomy file must be a reported condition, not an uncaught " +
      "throw that takes the whole gate down: " +
      all,
  );
  assert.match(
    result.stdout,
    /ORACLE COVERAGE/,
    "the gate must run all the way to its verdict: " + all,
  );
  assert.ok(
    fs.existsSync(tmp),
    "the run must still produce a report at the relocated path: " + all,
  );
});

test("checkBaseCssRules: a planted bad tag rule is caught", function () {
  var tokenMap = A.loadTokenMap(
    fs.readFileSync(path.join(REPO_ROOT, "tokens", "tokens.css"), "utf8"),
  );
  var src = F.baseCssFactSources(ANATOMY);
  // A modifier class the renderer really produces, so this exercises the
  // contradiction path against a real producer rather than the orphan path. It
  // was `.ds-tag--pink` until the fold-in deleted the Color axis: a hardcoded
  // modifier in a non-vacuity probe stops testing what it says it tests the
  // moment the axis behind it moves.
  var produced = Object.keys(F.classEmitterIndex().byClass)
    .filter(function (cls) {
      return /^ds-tag--/.test(cls);
    })
    .sort()[0];
  assert.ok(produced, "the renderer produces no .ds-tag--<modifier> class");
  // #123456 is in no appearance capture (planted fixture, not the real
  // ds-base.css), so this must red -- proving the gate is not a no-op that would
  // pass any input.
  var badCss = "." + produced + "{background:#123456}";
  var v = F.checkBaseCssRules(badCss, src.facts, tokenMap, src.uncaptured);
  assert.ok(
    v.some(function (m) {
      return (
        /^ds-base\.css/.test(m) &&
        m.indexOf("." + produced) !== -1 &&
        /#123456/.test(m)
      );
    }),
    "violation names ds-base.css, the selector, and the bad color, got: " +
      JSON.stringify(v),
  );
});

// Task 5: runFidelityReport walks every render slug, classifies every color
// declaration its owned CSS carries, and emits components/render/dist/
// fidelity-report.json. runFidelityReport reads no files of its own beyond
// readAppearance and the fragment markup Amendment 1 needs, so the test
// supplies the same stylesheet, token map, and fragments dir the CLI does.
var CLASSIFY_MOD = require("../../scripts/render/fidelity-classify.js");
var DERIVE = require("../../scripts/render/derive-from-renderer.js");
var FRAGMENTS_DIR = path.join(REPO_ROOT, "components/render/dist/fragments");
var BASE_CSS = fs.readFileSync(
  path.join(REPO_ROOT, "components/render/renderer/ds-base.css"),
  "utf8",
);
var TOKEN_MAP = A.loadTokenMap(
  fs.readFileSync(path.join(REPO_ROOT, "tokens/tokens.css"), "utf8") +
    "\n" +
    BASE_CSS,
);
function runReport() {
  return F.runFidelityReport({
    anatomyDir: ANATOMY,
    css: BASE_CSS,
    tokenMap: TOKEN_MAP,
    fragmentsDir: FRAGMENTS_DIR,
  });
}

// Amendment 3: the signature grew a fourth required field (fragmentsDir, for
// Amendment 1's per-slug filter) but stays all-required-or-throw, same as the
// original three.
// Finding 5: the guard used to list all four required keys in its message
// regardless of which one was actually absent, so a regex for any ONE key
// matched whichever key was truly missing -- the test was satisfiable by an
// unrelated failure (e.g. it would still pass if the code always blamed the
// wrong key). assertMissingCtxKey names the actually-missing key AND asserts
// the other three keys are absent from the message, so the test can no
// longer pass on a wrong-key report.
var ALL_CTX_KEYS = ["anatomyDir", "css", "tokenMap", "fragmentsDir"];
function assertMissingCtxKey(ctxPartial, missingKey) {
  assert.throws(
    function () {
      F.runFidelityReport(ctxPartial);
    },
    function (err) {
      assert.match(
        err.message,
        new RegExp("\\b" + missingKey + "\\b"),
        "message names the actually-missing key " + missingKey,
      );
      ALL_CTX_KEYS.filter(function (k) {
        return k !== missingKey;
      }).forEach(function (otherKey) {
        assert.doesNotMatch(
          err.message,
          new RegExp("\\b" + otherKey + "\\b"),
          "message must not name an unrelated key (" +
            otherKey +
            "), or this test is satisfiable by a wrong-key report: " +
            err.message,
        );
      });
      return true;
    },
  );
}

test("runFidelityReport requires anatomyDir, css, tokenMap, and fragmentsDir", function () {
  assertMissingCtxKey(
    { css: BASE_CSS, tokenMap: TOKEN_MAP, fragmentsDir: FRAGMENTS_DIR },
    "anatomyDir",
  );
  assertMissingCtxKey(
    { anatomyDir: ANATOMY, tokenMap: TOKEN_MAP, fragmentsDir: FRAGMENTS_DIR },
    "css",
  );
  assertMissingCtxKey(
    { anatomyDir: ANATOMY, css: BASE_CSS, fragmentsDir: FRAGMENTS_DIR },
    "tokenMap",
  );
  assertMissingCtxKey(
    { anatomyDir: ANATOMY, css: BASE_CSS, tokenMap: TOKEN_MAP },
    "fragmentsDir",
  );
});

test("runFidelityReport examines every render slug", function () {
  var report = runReport();
  assert.equal(
    Object.keys(report.bySlug).length,
    MATRIX.RENDER_SLUGS.length,
    "every render slug must appear in the report",
  );
  // The blind spot this work exists to close: the old loop examined zero.
  // A floor of 0 rather than a pinned count, because a hand-maintained number
  // here would be one more fact restated (see the standing rule in Global
  // Constraints). Correctness lives in the unit tests over known inputs.
  // verifiedViaTokenName (review finding 2) is part of the examined/checkable
  // set alongside verified and mismatch: the capture DID speak to those
  // declarations, it just agreed via the token name rather than the hex.
  var examined =
    report.totals.verified +
    report.totals.verifiedViaTokenName +
    report.totals.mismatch +
    report.totals.unverifiable;
  assert.ok(examined > 0, "the classifier examined nothing at all");
  assert.equal(
    examined,
    report.totals.examined,
    "totals.examined disagrees with its buckets",
  );

  // Deliberately NOT asserting every slug classified at least one declaration:
  // `loader-with-logo` owns rules that paint no color at all (verified 2026-07-24),
  // so a blanket per-slug floor would be false. The real failure mode, an
  // ownership entry that reaches no rules, is asserted directly in
  // tests/render/css-owners.test.js instead of inferred here.
});

test("runFidelityReport reports both honest numbers", function () {
  var report = runReport();
  // verifiedViaTokenName (review finding 2) is part of `checkable`: the
  // capture spoke to those declarations and agreed via the token name, so
  // excluding them would shrink checkable/examined under the exact same
  // declarations the report already counted before the split existed.
  var checkable =
    report.totals.verified +
    report.totals.verifiedViaTokenName +
    report.totals.mismatch;
  var total = checkable + report.totals.unverifiable;
  assert.equal(
    report.totals.oracleCoverage,
    Number((checkable / total).toFixed(4)),
  );
  // verifiedFidelity's numerator stays `verified` alone (a direct hex
  // match): a declaration that only agrees via token name is not folded
  // back into the headline "how much is right" number, so a hex divergence
  // a stale token snapshot produced stays visible instead of silently
  // rounding up to 100%.
  assert.equal(
    report.totals.verifiedFidelity,
    Number((report.totals.verified / checkable).toFixed(4)),
  );
  // Both ratios are derived from the buckets, so they are checked for internal
  // consistency rather than against a pinned expected value. A pinned coverage
  // number here would be a hand-maintained fact that goes stale the moment the
  // capture deepens, which is exactly what this work is meant to enable.
  assert.ok(
    report.totals.oracleCoverage >= 0 && report.totals.oracleCoverage <= 1,
    "oracle coverage is a ratio",
  );
  assert.equal(
    report.totals.verified +
      report.totals.verifiedViaTokenName +
      report.totals.mismatch +
      report.totals.unverifiable,
    total,
    "buckets must partition the examined declarations, with no double counting",
  );
});

// Amendment 1: fragment-aware rule attribution. CSS_OWNERS assigns the prefix
// ds-tag to five slugs, so without a per-slug filter every one of them is
// charged for every .ds-tag* rule in ds-base.css, including tag-stage's dot
// rules and the grouped tag-status rules that the OTHER family members never
// render at all.
test("fragmentClasses reads the full ds-* class tokens a fragment emits", function () {
  var html =
    '<span class="ds-tag ds-tag--catalog"><span class="ds-tag__icon">x</span></span>';
  var got = F.fragmentClasses(html);
  assert.ok(got.has("ds-tag"));
  assert.ok(got.has("ds-tag--catalog"));
  assert.ok(got.has("ds-tag__icon"));
  assert.equal(
    got.size,
    3,
    "only the three real ds-* tokens, nothing invented",
  );
});

test("filterCssForFragment drops a rule referencing any class the fragment does not emit, keeps rules whose classes are all emitted (shared prefix)", function () {
  var css =
    ".ds-tag { color: red; }\n" +
    ".ds-tag--pink { color: pink; }\n" +
    ".ds-tag--catalog { color: blue; }\n" +
    ".ds-tag--indigo .ds-tag-stage__dot { color: green; }\n";
  var emitted = new Set(["ds-tag", "ds-tag--catalog", "ds-tag__icon"]);
  // ds-tag is a shared prefix (multiple owners), so the fragment-emitted-class
  // test applies.
  var shared = { "ds-tag": ["tag-catalog", "tag-read-only"] };
  var filtered = F.filterCssForFragment(css, emitted, ["ds-tag"], shared);
  assert.match(filtered, /\.ds-tag\s*\{/);
  assert.match(filtered, /\.ds-tag--catalog\s*\{/);
  assert.doesNotMatch(
    filtered,
    /\.ds-tag--pink/,
    "a rule naming an unemitted class must be dropped entirely",
  );
  assert.doesNotMatch(
    filtered,
    /ds-tag-stage__dot/,
    "a descendant rule is dropped when EITHER of its classes is unemitted",
  );
});

test("filterCssForFragment keeps a rule whose selector carries a pseudo-class, not a class token (shared prefix)", function () {
  // .ds-link:hover references only ds-link -- the pseudo-class is not itself
  // a class token and must not cause a drop. ds-link is shared here so the
  // fragment-emitted-class test is actually exercised.
  var css = ".ds-link:hover { color: blue; }\n.ds-link { color: black; }\n";
  var emitted = new Set(["ds-link"]);
  var shared = { "ds-link": ["a", "b"] };
  var filtered = F.filterCssForFragment(css, emitted, ["ds-link"], shared);
  assert.match(filtered, /\.ds-link:hover/);
  assert.match(filtered, /\.ds-link\s*\{/);
});

// The narrowing this task makes: the fragment-emitted-class test must apply
// ONLY when the rule's owning prefix is shared by more than one slug. A
// single-owner prefix carries no cross-slug ambiguity, so its rules are the
// component's own -- even a variant the curated fragment specimen never
// happens to render -- and must be kept, not dropped.
test("filterCssForFragment keeps a rule under a single-owner prefix even when the fragment never emits its class (this is the case that would fail against a universal filter)", function () {
  var css =
    ".ds-button { color: black; }\n" +
    ".ds-button__icon { color: red; }\n" +
    ".ds-button--small { color: blue; }\n";
  // The fragment only ever emits the root class -- never the icon element or
  // the --small modifier -- but ds-button has exactly one owner (button), so
  // neither rule is ambiguous and both must survive the filter.
  var emitted = new Set(["ds-button"]);
  var shared = { "ds-button": ["button"] };
  var filtered = F.filterCssForFragment(css, emitted, ["ds-button"], shared);
  assert.match(
    filtered,
    /\.ds-button__icon\s*\{/,
    "a single-owner prefix's own BEM element must be kept even when the " +
      "fragment specimen never renders it",
  );
  assert.match(
    filtered,
    /\.ds-button--small\s*\{/,
    "a single-owner prefix's own unrendered variant must be kept, not " +
      "dropped as if it were a cross-slug misattribution",
  );
});

// A prefix shared by more than one slug still filters normally alongside a
// single-owner prefix in the same stylesheet -- the gate is per-rule, keyed
// off each rule's OWN owning prefix, not an all-or-nothing switch for the
// whole filter call.
test("filterCssForFragment applies the fragment test to a shared prefix's rules while keeping a single-owner prefix's rules unconditionally, in the same call", function () {
  var css =
    ".ds-tag--pink { color: pink; }\n" + ".ds-button__icon { color: red; }\n";
  var emitted = new Set([]);
  var prefixes = ["ds-tag", "ds-button"];
  var shared = {
    "ds-tag": ["tag-catalog", "tag-read-only"],
    "ds-button": ["button"],
  };
  var filtered = F.filterCssForFragment(css, emitted, prefixes, shared);
  assert.doesNotMatch(
    filtered,
    /\.ds-tag--pink/,
    "ds-tag is shared, so an unemitted class still drops its rule",
  );
  assert.match(
    filtered,
    /\.ds-button__icon/,
    "ds-button has a single owner, so its rule survives regardless of emitted classes",
  );
});

// Fragment-aware filtering against the REAL corpus, on whatever prefix is
// actually shared today.
//
// This was pinned to tag-catalog and an exact four-selector expectation
// (".ds-tag", ".ds-tag--catalog", ".ds-tag__icon", ".ds-tag__icon svg"). Both
// halves died with the 2026-08-12 fold-in: tag-catalog is no longer a render
// slug, and after the fold-in NO prefix is claimed by more than one slug, so
// the filter has no shared subject left in the corpus at all. Rather than
// leaving a specimen that cannot exist, the precondition is asserted the way
// this file's first test asserts its own ("zero source:derived renders today"),
// and the property itself is proved on a fixture by the three
// filterCssForFragment tests above, which do not need the corpus to contain a
// multi-owner prefix.
test("fragment-aware filtering: the corpus's shared prefixes are enumerated, so the real-CSS filter is never checked vacuously", function () {
  var shared = F.sharedPrefixMap();
  var multi = Object.keys(shared).filter(function (p) {
    return shared[p].length > 1;
  });
  if (!multi.length) {
    // No subject. Say so, and pin WHY it is legitimately absent so a future
    // reader does not read this as coverage of the filter.
    assert.deepEqual(
      MATRIX.RENDER_SLUGS.filter(function (slug) {
        return MATRIX.ownedPrefixes(slug).length > 1;
      }),
      [],
      "a prefix is shared but no slug owns more than one -- sharedPrefixMap " +
        "and ownedPrefixes disagree",
    );
    return;
  }
  // A shared prefix exists again: every slug claiming it must be charged only
  // for the rules its own fragment can trigger.
  multi.forEach(function (prefix) {
    shared[prefix].forEach(function (slug) {
      var emitted = F.fragmentClasses(DERIVE.deriveFragment(slug));
      var filtered = F.filterCssForFragment(
        BASE_CSS,
        emitted,
        [prefix],
        shared,
      );
      CLASSIFY_MOD.ownedRules(filtered, [prefix]).forEach(function (rule) {
        (rule.selector.match(/\.ds-[a-z0-9_-]+/g) || []).forEach(
          function (dotted) {
            var t = dotted.slice(1); // fragmentClasses keys are class tokens, no dot
            assert.ok(
              emitted.has(t),
              slug +
                " is charged for " +
                rule.selector +
                ", which references " +
                t +
                " -- a class its own fragment never emits",
            );
          },
        );
      });
    });
  });
});

function runReportWithCss(css) {
  return F.runFidelityReport({
    anatomyDir: ANATOMY,
    css: css,
    tokenMap: TOKEN_MAP,
    fragmentsDir: FRAGMENTS_DIR,
  });
}

function mismatchesFor(report, slug) {
  return report.mismatches.filter(function (m) {
    return m.slug === slug;
  });
}

// The brief evaluated and rejected de-duplicating declarations across slugs: a
// single shared `.ds-tag--<x>` rule is checked once per family member, against
// THAT member's own capture, so a genuine cross-capture contradiction stays
// visible instead of being collapsed.
//
// Both of these used to be run against the real corpus, with tag-read-only and
// tag-stage as the two members and a derived `.ds-tag--<colour>` /
// `.ds-tag-stage--<colour>` specimen. The 2026-08-12 fold-in retired every
// co-owner of `.ds-tag`, so the corpus now has exactly one owner of that prefix
// and NEITHER property has a real subject: "charged to every member" needs two
// members, and "scoped to one member alone" needs a member-scoped prefix.
//
// The property is not gone, only its corpus instance, so it is proved on a
// fixture rather than deleted -- and the corpus precondition is asserted
// separately (see "the corpus's shared prefixes are enumerated" above), so a
// future sixth family member reintroduces a real subject loudly instead of
// leaving these two silently synthetic forever.
//
// classifySlug takes `sharedPrefixes` and `facts` as arguments, which is
// exactly the seam runFidelityReport fills from the corpus, so a fixture
// exercises the same code path the corpus did.
var TWO_MEMBER_SHARED = { "ds-tag": ["tag-alpha", "tag-beta"] };

function classifyMember(slug, css, background) {
  return CLASSIFY_MOD.classifySlug({
    slug: slug,
    prefixes: ["ds-tag", "ds-" + slug],
    css: css,
    facts: {
      byNode: [
        {
          name: "Type=Default",
          appearance: {
            background: "#111111",
            variants: [
              { prop: "Type", values: ["Hue"], background: background },
            ],
          },
        },
      ],
      variants: [{ prop: "Type", values: ["Hue"], background: background }],
    },
    tokenMap: {},
    sharedPrefixes: TWO_MEMBER_SHARED,
  });
}

test("classification does not deduplicate a rule across slugs: one shared .ds-tag rule is charged to every family member that renders it", function () {
  var css = ".ds-tag--hue { background: #123456; }";
  // #123456 is wrong for BOTH captures, so both members must report it. If the
  // classifier ever collapsed a shared declaration to a single subject, one of
  // the two would come back clean.
  var alpha = classifyMember("tag-alpha", css, "#aaaaaa");
  var beta = classifyMember("tag-beta", css, "#bbbbbb");
  [
    ["tag-alpha", alpha],
    ["tag-beta", beta],
  ].forEach(function (pair) {
    assert.equal(
      pair[1].mismatch,
      1,
      pair[0] +
        " must be charged for the shared .ds-tag--hue declaration, got: " +
        JSON.stringify(pair[1].mismatches),
    );
    assert.match(pair[1].mismatches[0].message, /#123456/);
  });
  // Non-vacuity in the other direction: each member's OWN captured colour
  // verifies for that member and mismatches for the other, which is the
  // per-capture provenance the no-dedup rule exists to preserve.
  assert.equal(
    classifyMember(
      "tag-alpha",
      ".ds-tag--hue { background: #aaaaaa; }",
      "#aaaaaa",
    ).verified,
    1,
  );
  assert.equal(
    classifyMember(
      "tag-beta",
      ".ds-tag--hue { background: #aaaaaa; }",
      "#bbbbbb",
    ).mismatch,
    1,
  );
});

test("a member-scoped color rule is charged to that member alone, not to the shared tag family", function () {
  // `.ds-tag-beta--hue` is owned by ds-tag-beta, a prefix only tag-beta claims,
  // so the shared `.ds-tag--hue` declaration is `overridden` for tag-beta (its
  // own scoped rule wins the cascade) and untouched for tag-alpha.
  var css =
    ".ds-tag--hue { background: #aaaaaa; }\n.ds-tag-beta--hue { background: #123456; }\n";
  var beta = classifyMember("tag-beta", css, "#bbbbbb");
  assert.ok(
    beta.mismatches.some(function (m) {
      return /\.ds-tag-beta--hue/.test(m.selector) && /#123456/.test(m.message);
    }),
    "tag-beta must be charged for its own scoped rule, got: " +
      JSON.stringify(beta.mismatches),
  );
  var alpha = classifyMember("tag-alpha", css, "#aaaaaa");
  assert.deepEqual(
    alpha.mismatches.filter(function (m) {
      return /\.ds-tag-beta--hue/.test(m.selector);
    }),
    [],
    "tag-alpha must not be charged for a rule scoped to tag-beta's prefix",
  );
});

// Amendment 2: a report that lists a blind slug beside a verified one with no
// distinction is a false all-clear. See
// feedback_gate_must_assert_its_subject_was_present.
test("runFidelityReport reports blind slugs explicitly, not as an inferred zero", function () {
  var report = runReport();
  assert.ok(Array.isArray(report.blind), "the report must carry a blind list");
  assert.ok(
    report.blind.indexOf("loader-with-logo") !== -1,
    "loader-with-logo owns rules that paint no color at all (verified 2026-07-24), " +
      "so it must be reported blind, not silently indistinguishable from a verified slug",
  );
  report.blind.forEach(function (slug) {
    assert.equal(report.bySlug[slug].verified, 0);
    assert.equal(report.bySlug[slug].mismatch, 0);
    // Review finding 2: verifiedViaTokenName is a real positive signal too
    // (the capture spoke and agreed), so a genuinely blind slug must also
    // carry zero of it -- otherwise a slug like badge (0 verified, 0
    // mismatch, 1 verifiedViaTokenName) would misread as blind.
    assert.equal(report.bySlug[slug].verifiedViaTokenName, 0);
    // Finding 1: a blind slug must be self-marking on its own bySlug row, not
    // only present in the sibling top-level array -- a consumer filtering
    // bySlug directly (e.g. for mismatch === 0) must not have to remember to
    // join the top-level list to know the row is blind.
    assert.equal(
      report.bySlug[slug].blind,
      true,
      slug + ": a blind slug's own bySlug row must carry blind:true",
    );
  });
  Object.keys(report.bySlug).forEach(function (slug) {
    var b = report.bySlug[slug];
    var isBlind =
      b.verified === 0 && b.mismatch === 0 && b.verifiedViaTokenName === 0;
    assert.equal(
      report.blind.indexOf(slug) !== -1,
      isBlind,
      slug +
        ": blind-list membership disagrees with its own verified/mismatch/verifiedViaTokenName counts",
    );
    assert.equal(
      b.blind,
      isBlind,
      slug +
        ": the bySlug row's own blind field disagrees with its verified/mismatch/verifiedViaTokenName counts",
    );
  });
  // Non-vacuity: badge is exactly the case this guard exists for -- zero
  // verified, zero mismatch, but a real verifiedViaTokenName signal, so it
  // must NOT be blind.
  assert.equal(
    report.bySlug.badge.verified,
    0,
    "badge's one declaration verifies via token-name agreement, not a direct hex match",
  );
  assert.equal(report.bySlug.badge.verifiedViaTokenName, 1);
  assert.equal(
    report.bySlug.badge.blind,
    false,
    "badge must not read as blind: the capture spoke to it and agreed",
  );
  assert.equal(report.blind.indexOf("badge"), -1);
});

test("the emitted report is stamped and deterministic", function () {
  var p = path.join(REPO_ROOT, "components/render/dist/fidelity-report.json");
  var json = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(json._meta.auto_generated, true);
  assert.equal(json._meta.source, "scripts/render/fidelity-check.js");
  assert.ok(json._meta.do_not_edit);
  // bySlug keys sorted, so the dist cannot shift with iteration order.
  var keys = Object.keys(json.bySlug);
  assert.deepEqual(keys, keys.slice().sort());
  assert.ok(
    Array.isArray(json.blind),
    "the dist report must carry the blind list",
  );
  // Finding 1: every persisted bySlug row must carry an explicit boolean
  // blind field, consistent with membership in the top-level blind array --
  // a blind row (e.g. loader-with-logo) must not be indistinguishable from a
  // genuinely clean, fully-verified row.
  keys.forEach(function (slug) {
    assert.equal(
      typeof json.bySlug[slug].blind,
      "boolean",
      slug + ": bySlug row must carry an explicit boolean blind field",
    );
    assert.equal(
      json.bySlug[slug].blind,
      json.blind.indexOf(slug) !== -1,
      slug +
        ": bySlug row's blind field disagrees with the top-level blind list",
    );
  });
});

// Task 6: the gate blocks. Every candidate mismatch was triaged (four real
// token-binding defects in ds-base.css, two classifier bugs producing false
// mismatches), so a mismatch from here on is a regression and must red.
test("no unresolved fidelity mismatches remain", function () {
  var report = runReport();
  assert.deepEqual(
    report.mismatches.map(function (m) {
      return m.message;
    }),
    [],
    "a render paints a color the capture contradicts",
  );
});

// Non-vacuity for the assertion above. An empty mismatch list is only evidence
// of correctness if the pipeline that produced it CAN produce a non-empty one
// from this same corpus. Planting a wrong token on a rule that verifies today
// proves it end to end, through the real fragments, real captures, and real
// filtering -- not through a synthetic fixture.
test("the zero-mismatch result is not vacuous: a wrong token on a verifying rule is reported", function () {
  var target = "background: var(--zen-color-error-700);";
  assert.equal(
    BASE_CSS.split(target).length - 1,
    1,
    "the .ds-button--critical background declaration was located exactly once",
  );
  var report = runReportWithCss(
    BASE_CSS.replace(target, "background: var(--zen-color-bg-subtle);"),
  );
  assert.ok(
    mismatchesFor(report, "button").some(function (m) {
      return /ds-button--critical/.test(m.selector);
    }),
    "a wrong token on .ds-button--critical must be reported, got: " +
      JSON.stringify(report.mismatches),
  );
});

// The failure text is what a future engineer acts on, so its content is
// asserted rather than assumed. The two resolutions it names are the only two
// there are, and an ignore list is not one of them.
test("mismatchFailureMessage names every mismatch and both real resolutions, and rules out an ignore list", function () {
  var msg = F.mismatchFailureMessage([
    {
      message:
        "widget .ds-widget {background}: paints #000000 but the capture says #ffffff",
    },
    {
      message:
        "gadget .ds-gadget {border}: paints #111111 but the capture says #222222",
    },
  ]);
  assert.match(msg, /FIDELITY MISMATCHES \(2\)/);
  assert.match(msg, /\.ds-widget \{background\}/);
  assert.match(msg, /\.ds-gadget \{border\}/);
  assert.match(msg, /ds-base\.css/, "names where to fix a real defect");
  assert.match(
    msg,
    /fidelity-classify\.test\.js/,
    "names where to pin a classifier gap",
  );
  assert.match(msg, /ignore list is NOT an option/i);
  assert.doesNotMatch(
    msg,
    /task 6/i,
    "the shipped message must not reference an internal plan task",
  );
});

test("CLI: fidelity-check.js prints the blind count and blocks when a mismatch appears", function () {
  // Run against a baseline that does not exist yet, for two reasons. The first
  // is honesty about the subject: this test is about the mismatch/violation
  // exit, and it used to assert `status === 0` with the reason "the corpus
  // carries no mismatches", which stopped being why the status was what it was
  // the moment a legitimate per-slug coverage loss started blocking too. The
  // coverage comparison has its own file (fidelity-coverage-floor.test.js) with
  // fixtures that can actually control the baseline. The second is that the
  // no-argument form writes the TRACKED dist report, so this test used to
  // mutate a committed artifact as a side effect of asserting on stdout.
  var child_process = require("node:child_process");
  var os = require("node:os");
  var tmp = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "fidelity-cli-")),
    "report.json",
  );
  var result = child_process.spawnSync(
    process.execPath,
    [
      path.join(REPO_ROOT, "scripts/render/fidelity-check.js"),
      "--report=" + tmp,
    ],
    { encoding: "utf8" },
  );
  assert.equal(
    result.status,
    0,
    "no mismatch and no ds-base.css violation, and no baseline to compare " +
      "against, so nothing is left for the gate to block on: " +
      result.stdout +
      result.stderr,
  );
  assert.match(
    result.stdout,
    /blind/i,
    "the CLI summary must print the blind count",
  );
  // A green exit proves nothing on its own -- it would look identical if the
  // gate had been wired to never fail. The exit code is a pure function of the
  // mismatch list, so asserting the reported list is empty AND that a non-empty
  // list produces a failure message is what makes the green meaningful.
  assert.match(
    result.stdout,
    /mismatch: {5}0/,
    "the summary must show the mismatch count it is gating on: " +
      result.stdout,
  );
  assert.doesNotMatch(
    result.stdout + result.stderr,
    /not blocking/i,
    "the non-blocking wording is retired",
  );
});
