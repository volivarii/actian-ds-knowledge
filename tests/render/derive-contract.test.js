"use strict";

// tests/render/derive-contract.test.js
//
// The contract derive publishes what the renderer ACTUALLY implements per slug:
// the content props its branch reads, their fallback defaults, and which registry
// variant values it renders distinctly. It exists because consumers were restating
// those facts by hand and drifting: the plugin's flow-authoring reference documents
// 19 slugs when the renderer has 58, and 45 (slug, prop) bindings when the renderer
// exposes 177. A consumer that reads this file cannot drift, because the fact stays
// owned by the producer.
//
// Every assertion below is derived on BOTH sides (RENDER_SLUGS, the registry, the
// renderer source, or the renderer's own output). None of them pins a hand-written
// list, which is the trap the three slack gates of 2026-08-11 fell into.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var REPO_ROOT = path.resolve(__dirname, "..", "..");
var deriveContract = require(
  path.join(REPO_ROOT, "scripts", "render", "derive-contract.js"),
).deriveContract;
var matrix = require(
  path.join(REPO_ROOT, "components", "render", "renderer", "matrix.js"),
);
var dsMap = require(
  path.join(
    REPO_ROOT,
    "components",
    "render",
    "renderer",
    "html-renderers",
    "ds-html-map.js",
  ),
);

var CONTRACT = deriveContract();

function entry(slug) {
  return CONTRACT.slugs[slug];
}

test("every render slug the renderer implements has a contract entry", function () {
  // Both sides derived: RENDER_SLUGS itself reads the `case "<slug>":` branches.
  var missing = matrix.RENDER_SLUGS.filter(function (slug) {
    return !CONTRACT.slugs[slug];
  });
  assert.deepEqual(missing, [], "slugs with a renderer branch but no contract");
  assert.equal(
    Object.keys(CONTRACT.slugs).length,
    matrix.RENDER_SLUGS.length,
    "the contract must not invent slugs the renderer does not implement",
  );
});

test("a slug's props are exactly the ones its renderer branch reads", function () {
  var names = entry("alert-banner").props.map(function (p) {
    return p.name;
  });
  // alert-banner's branch reads props.Title and props.Message and nothing else.
  assert.deepEqual(names.slice().sort(), ["Message", "Title"]);
});

test("a prop carries the renderer's own fallback as its default", function () {
  var primary = entry("action-bar").props.find(function (p) {
    return p.name === "Primary";
  });
  assert.ok(primary, "action-bar reads props.Primary");
  assert.equal(
    primary.default,
    "Save",
    "the default must be the literal the renderer falls back to",
  );
});

test("a prop with no literal fallback carries no invented default", function () {
  // Re-pointed from Message to Title in the content-layer change: Message now
  // falls back to the captured "Info". Title stays the right specimen because
  // the Figma component has no title layer, so the renderer deliberately omits
  // the element and must not invent a value for it.
  var title = entry("alert-banner").props.find(function (p) {
    return p.name === "Title";
  });
  assert.ok(title);
  assert.ok(
    !Object.prototype.hasOwnProperty.call(title, "default") ||
      title.default === "",
    "props.Title has no literal fallback so the contract must not claim a value",
  );
});

test("every prop the contract lists actually reaches the rendered markup", function () {
  // Behavioural, not textual: a prop extracted from a comment or a dead branch
  // would pass a regex check and fail here. Scoped to the string-valued props of
  // one slug, because boolean and enum props legitimately do not echo their value.
  var probe = "ZZPROBEZZ";
  entry("alert-banner").props.forEach(function (p) {
    var props = {};
    props[p.name] = probe;
    var html = dsMap.renderDSComponent({
      dsSlug: "alert-banner",
      variant: "Type=Info",
      props: props,
    });
    assert.match(
      html,
      new RegExp(probe),
      "props." + p.name + " is claimed by the contract but never rendered",
    );
  });
});

test("variant axes and values are the registry's, verbatim", function () {
  var comp = JSON.parse(
    fs.readFileSync(
      path.join(REPO_ROOT, "components", "dist", "registries", "dskit.json"),
      "utf8",
    ),
  ).components["alert-banner"];
  var axis = entry("alert-banner").variants.Type;
  assert.deepEqual(axis.values, comp.variants.Type);
});

test("an axis records which values the renderer cannot tell apart", function () {
  // side-nav reads no App-specific branch, so Studio renders as Admin. This is
  // measured by rendering both and comparing, so it self-corrects the moment the
  // renderer learns the difference.
  var app = entry("side-nav").variants.App;
  assert.deepEqual(app.values, ["Admin", "Studio"]);
  assert.equal(
    app.rendersAs.Studio,
    "Admin",
    "Studio must be recorded as indistinguishable from Admin",
  );
});

test("a value the renderer does differentiate is not recorded as an alias", function () {
  // The negative control for the test above: if rendersAs were populated
  // unconditionally, this would fail. side-nav's View axis IS honoured.
  var view = entry("side-nav").variants.View;
  assert.deepEqual(
    view.rendersAs,
    {},
    "Collapsed and Expanded render differently, so neither is an alias",
  );
});

test("the contract is stamped as generated, and names its source", function () {
  assert.equal(CONTRACT._meta.auto_generated, true);
  assert.match(CONTRACT._meta.source, /ds-html-map\.js/);
  assert.ok(CONTRACT._meta.do_not_edit);
});

test("the committed contract matches a fresh derive", function () {
  var distPath = path.join(
    REPO_ROOT,
    "components",
    "render",
    "dist",
    "render-contract.json",
  );
  assert.ok(fs.existsSync(distPath), "the contract dist is committed");
  var committed = JSON.parse(fs.readFileSync(distPath, "utf8"));
  assert.deepEqual(
    committed.slugs,
    CONTRACT.slugs,
    "run `npm run derive:render` and commit the result",
  );
});

test("the contract validates against schemas/render-contract.json", function () {
  var Ajv2020 = require("ajv/dist/2020");
  var addFormats = require("ajv-formats");
  var schema = require("../../schemas/render-contract.json");
  var ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  var validate = ajv.compile(schema);
  assert.ok(validate(CONTRACT), JSON.stringify(validate.errors));
});

// --- self-guards: the two ways this derive could lie quietly -----------------

test("the case-block partition covers the whole renderer source", function () {
  // If a `case "<slug>":` marker were matched inside a comment or a string, the
  // real branch around it would be split and every prop after the phantom marker
  // would be attributed to a slug nobody iterates, i.e. silently dropped. The
  // partition is checked structurally rather than by spot-checking a slug,
  // because a dropped prop looks exactly like a prop the renderer does not read.
  var D = require(
    path.join(REPO_ROOT, "scripts", "render", "derive-contract.js"),
  );
  var src = fs.readFileSync(
    path.join(
      REPO_ROOT,
      "components",
      "render",
      "renderer",
      "html-renderers",
      "ds-html-map.js",
    ),
    "utf8",
  );
  var blocks = D.caseBlocks(src);
  var covered = Object.keys(blocks).reduce(function (n, slug) {
    return n + blocks[slug].length;
  }, 0);
  var firstCase = src.search(/\n[ \t]*case "[a-z0-9-]+":/);
  assert.ok(firstCase > 0, "the renderer has at least one case branch");
  // The switch's own `default:` is the end of the case region. Located here by
  // searching from the last case marker, independently of how caseBlocks finds
  // it, so this stays a check rather than a restatement.
  var lastCase = src.lastIndexOf('case "');
  var defaultOffset = src.slice(lastCase).search(/\n[ \t]*default:/);
  assert.ok(defaultOffset > 0, "the switch has a default branch");
  assert.equal(
    covered,
    lastCase + defaultOffset - firstCase,
    "blocks must partition the source from the first case to the default branch",
  );
});

test("the derive refuses to run without the icon map instead of inventing aliases", function () {
  // rendersAs is measured from rendered markup, so two values differing only by
  // their glyph collapse into an alias when the icon map is missing. That would
  // publish "the renderer cannot tell these apart" about a renderer that can:
  // a false all-clear, inverted. Absent icons must stop the derive, not shrink it.
  var D = require(
    path.join(REPO_ROOT, "scripts", "render", "derive-contract.js"),
  );
  assert.throws(
    function () {
      D.deriveContract({ icons: {} });
    },
    /icon/i,
    "an empty icon map must throw and name the reason",
  );
});

test("an absent graphics map is tolerated, unlike an absent icon map", function () {
  // graphics.json is a newer dist that legitimately may not exist in an older
  // checkout, and artwork absence cannot collapse two variant values the way a
  // missing glyph can. The asymmetry is deliberate, so it is pinned.
  var D = require(
    path.join(REPO_ROOT, "scripts", "render", "derive-contract.js"),
  );
  var contract = D.deriveContract({ graphics: {} });
  assert.equal(Object.keys(contract.slugs).length, matrix.RENDER_SLUGS.length);
});

// --- review findings 2026-08-14 ---------------------------------------------

test("a default in an or-chain binds to the prop the renderer prefers", function () {
  // `props.Headline || props.Title || "No policies available"` states one default
  // for a chain, and the prop a consumer should set is the FIRST one. Binding it
  // to the last alias before the literal inverts that, and because chain order
  // differs per slug it made siblings contradict each other: empty-state put its
  // default on Title and left Headline bare while confirmation did the reverse.
  // The content layer this field exists to seed would have filled the alias and
  // left the preferred prop empty.
  var props = entry("empty-state").props;
  var byName = {};
  props.forEach(function (p) {
    byName[p.name] = p;
  });
  assert.equal(
    byName.Headline.default,
    "No policies available",
    "the renderer prefers Headline, so the chain's default belongs to it",
  );
  assert.ok(
    !Object.prototype.hasOwnProperty.call(byName.Title, "default"),
    "Title is the fallback alias and must not claim the chain's default",
  );
});

test("the last case block stops at the switch's default branch", function () {
  // Without a bound, the final `case` absorbs the default branch, the catch,
  // BUILT_SLUGS and the exports block. Nothing there reads props today, so the
  // output is right by luck; the day a `props.X` read appears below the switch,
  // that slug silently gains a prop it never reads.
  var D = require(
    path.join(REPO_ROOT, "scripts", "render", "derive-contract.js"),
  );
  var src = fs.readFileSync(
    path.join(
      REPO_ROOT,
      "components",
      "render",
      "renderer",
      "html-renderers",
      "ds-html-map.js",
    ),
    "utf8",
  );
  var blocks = D.caseBlocks(src);
  var last = blocks["search-result-card"];
  assert.ok(last, "search-result-card is the final case branch");
  assert.doesNotMatch(
    last,
    /BUILT_SLUGS/,
    "the last block must not run past the switch into module-level code",
  );
});

test("an empty fallback earlier in a branch does not mask a real default later", function () {
  // This replaces a test that asserted a falsy literal survives. That test was
  // tautological: "0" is a truthy JS string, so the truthiness check it was
  // written against never dropped it, and it passed against the very code it
  // claimed to catch. The condition that DOES differ is where the empty literal
  // is discarded. Recorded, "" wins first-wins and then vanishes at emit, so the
  // prop publishes no default while the renderer plainly states one, and which
  // happens depends only on the order the two chains appear in the branch.
  var D = require(
    path.join(REPO_ROOT, "scripts", "render", "derive-contract.js"),
  );
  var emptyFirst = D.propsOf(
    'case "x": { esc(props.Label || ""); esc(props.Label || "Untitled"); }',
  );
  var realFirst = D.propsOf(
    'case "x": { esc(props.Label || "Untitled"); esc(props.Label || ""); }',
  );
  assert.deepEqual(emptyFirst, [{ name: "Label", default: "Untitled" }]);
  assert.deepEqual(
    realFirst,
    emptyFirst,
    "source order must not decide whether a stated default is published",
  );
});

test("an escaped newline in a default survives as a newline", function () {
  var D = require(
    path.join(REPO_ROOT, "scripts", "render", "derive-contract.js"),
  );
  var props = D.propsOf('case "x": { var a = props.Body || "a\\nb"; }');
  assert.equal(
    props[0].default,
    "a\nb",
    "\\n must not be published as the letter n",
  );
});

test("every scripts/render derive that declares inputs has them watched by the workflow", function () {
  // The committed-vs-fresh test above runs inside the required manifest check on
  // every PR, while only render-derive.yml can repair a drift by regenerating and
  // auto-committing. An input the workflow does not watch therefore reds a
  // required check that no workflow can fix. The workflow already learned this
  // once for components/dist/anatomy; the relation is asserted here instead.
  var D = require(
    path.join(REPO_ROOT, "scripts", "render", "derive-contract.js"),
  );
  var wf = fs.readFileSync(
    path.join(REPO_ROOT, ".github", "workflows", "render-derive.yml"),
    "utf8",
  );
  var triggers = wf
    .slice(wf.indexOf("paths:"), wf.indexOf("concurrency:"))
    .split("\n")
    .map(function (l) {
      return (l.match(/^\s*-\s*'([^']+)'/) || [])[1];
    })
    .filter(Boolean);
  assert.ok(triggers.length, "the workflow declares trigger paths");

  // Matched the way GitHub matches, not by string prefix. A prefix test accepted
  // a bare '*' (which reduces to the empty string, and every input starts with
  // it) and accepted a truncated path like 'components/dist/icon', neither of
  // which matches anything in GitHub's globbing: a false all-clear on the one
  // check standing between a required gate and a workflow that cannot repair it.
  function watchedBy(triggerList, input) {
    return triggerList.some(function (t) {
      if (t === input) return true;
      // Only a `dir/**` trigger covers things beneath it, and it covers them by
      // whole path segments. That segment boundary is what rejects a truncation:
      // 'components/dist/icon/**' does not cover 'components/dist/icons/'.
      if (t.slice(-3) !== "/**") return false;
      return input.indexOf(t.slice(0, -2)) === 0;
    });
  }

  // Negative controls first, so this cannot pass by being permissive.
  assert.equal(
    watchedBy(["*"], "components/dist/icons/"),
    false,
    "a bare * must not count as watching a directory",
  );
  assert.equal(
    watchedBy(["components/dist/icon/**"], "components/dist/icons/"),
    false,
    "a truncated path must not count as watching the real one",
  );
  assert.equal(
    watchedBy(["components/dist/icons/**"], "components/dist/icons/"),
    true,
    "positive control: the real trigger shape does match",
  );

  // DISCOVERED, not listed. derive-retired-slugs.js declared INPUTS with a
  // comment saying this test asserted them, and this test only ever read
  // derive-contract.js's, so its trigger was unguarded: trimming
  // components/dist/identity.json from the workflow would have stayed green
  // until the next recorded rename, then redded the required manifest check
  // with no workflow able to regenerate the map and repair it (#604). A second
  // hand-kept list here would be the same defect one layer along, so the
  // modules are found by reading the directory.
  //
  // Candidates are found by MENTION and confirmed by EXPORT. A first version of
  // this matched /\bINPUTS\s*=/ against the source, which a module escapes by
  // the most natural refactor there is: folding the declaration into
  // `module.exports = { ..., INPUTS: [...] }`. Doing that to
  // derive-retired-slugs.js AND deleting its workflow trigger left this test
  // green, which is the #604 regression back, so the gate could not fail in the
  // one case it exists for. The export is the contract; the source scan only
  // decides who to ask.
  var renderDir = path.join(REPO_ROOT, "scripts", "render");
  var candidates = fs
    .readdirSync(renderDir)
    .filter(function (f) {
      return f.slice(-3) === ".js";
    })
    .filter(function (f) {
      return /\bINPUTS\b/.test(fs.readFileSync(path.join(renderDir, f), "utf8"));
    });

  var declaring = candidates.filter(function (file) {
    var mod = require(path.join(renderDir, file));
    return Array.isArray(mod.INPUTS);
  });

  // A candidate that names INPUTS and exports none is either a comment (fine,
  // and it drops out here) or a declaration nothing can read, which is the same
  // silence as not declaring it. Reported rather than assumed either way.
  candidates.forEach(function (file) {
    var mod = require(path.join(renderDir, file));
    if (!Array.isArray(mod.INPUTS)) return;
    mod.INPUTS.forEach(function (input) {
      assert.ok(
        watchedBy(triggers, input),
        file +
          " declares " +
          input +
          ", a derive input no workflow trigger watches",
      );
    });
  });

  // The subject has to be present, or the loop above runs zero times and
  // reports a clean bill of health for nothing. Both modules are named because
  // a count alone lets the ONE module this gate exists for drop out silently
  // while three others keep the number up.
  assert.ok(
    declaring.indexOf("derive-retired-slugs.js") !== -1,
    "derive-retired-slugs.js must be discovered: it is the module #604 was about",
  );
  assert.ok(
    declaring.indexOf("derive-contract.js") !== -1,
    "derive-contract.js must be discovered",
  );
  assert.ok(
    declaring.length >= 2,
    "expected several scripts/render modules to export INPUTS, found " +
      declaring.length,
  );
});

test("unicode and hex escapes in a default survive as their characters", function () {
  // The escape table's comment claimed to cover "the escapes a JS string literal
  // can carry"; \u, \x, \b, \f, \v and \0 are all such escapes and all fell
  // through to the bare letter, so "é" published as the text u00e9. Defaults
  // are user-facing copy, so that reads as a plausible string rather than as an
  // error, which is the silent shape this file keeps trying to eliminate.
  var D = require(
    path.join(REPO_ROOT, "scripts", "render", "derive-contract.js"),
  );
  assert.equal(
    D.propsOf('case "x": { props.L || "\\u00e9t\\u00e9"; }')[0].default,
    "été",
  );
  assert.equal(
    D.propsOf('case "x": { props.M || "a\\x41b"; }')[0].default,
    "aAb",
  );
});

test("a switch with no default branch is an error, not a silent run to EOF", function () {
  // The -1 fallback reproduced exactly the over-extension this file just fixed,
  // and only the test against the real renderer would have noticed. This module
  // throws on both of its other impossible states, so it throws here too.
  var D = require(
    path.join(REPO_ROOT, "scripts", "render", "derive-contract.js"),
  );
  assert.throws(function () {
    D.caseBlocks('\n        case "a": { var x = props.A; }\n      }\n');
  }, /default/i);
});

test("a nested switch's default branch does not truncate the outer case block", function () {
  // The end marker is matched at the case markers' own indentation, so a deeper
  // `default:` inside the final branch cannot end it early and drop every prop
  // after it. No nested switch exists in the renderer today; this is the guard
  // that keeps that from mattering.
  var D = require(
    path.join(REPO_ROOT, "scripts", "render", "derive-contract.js"),
  );
  var src = [
    '        case "a": {',
    "          switch (inner) {",
    "            default: { var y = props.Ignored; }",
    "          }",
    "          var z = props.Kept;",
    "        }",
    "        default: {",
    "          var w = props.OutsideTheSwitch;",
    "        }",
  ].join("\n");
  var names = D.propsOf(D.caseBlocks("\n" + src).a).map(function (p) {
    return p.name;
  });
  assert.ok(
    names.indexOf("Kept") !== -1,
    "props after a nested default survive",
  );
  assert.ok(
    names.indexOf("OutsideTheSwitch") === -1,
    "the block still stops at the outer default",
  );
});

test("consecutive fall-through case labels both get a block", function () {
  // Widening the marker regex to capture the following indent made it CONSUME
  // the newline after the label, so `case "a":` immediately followed by
  // `case "b":` swallowed the second. matrix.js still reported both, so the
  // derive threw "no renderer branch found for b" about a branch that exists.
  // The captured group was never read, so the widening bought nothing at all.
  var D = require(
    path.join(REPO_ROOT, "scripts", "render", "derive-contract.js"),
  );
  var src = [
    '        case "a":',
    '        case "b": {',
    "          var x = props.Shared;",
    "        }",
    "        default: {}",
  ].join("\n");
  var blocks = D.caseBlocks("\n" + src);
  assert.deepEqual(Object.keys(blocks).sort(), ["a", "b"]);
});

test("a malformed escape is left as written, and does not crash the derive", function () {
  // The extractor scans comments as plain text, so a Windows path in a comment
  // puts a lone \u before non-hex characters. That fell through to the bare
  // single-character branch with seq === "u", making parseInt("") NaN and
  // String.fromCodePoint(NaN) throw, turning a documentation comment into a hard
  // derive failure whose message names neither the file nor the literal.
  var D = require(
    path.join(REPO_ROOT, "scripts", "render", "derive-contract.js"),
  );
  // The VALUE is asserted, not merely the absence of a throw. doesNotThrow alone
  // is too weak here: changing the out-of-range fallback from `return seq` to
  // `return ""` keeps every test green while silently deleting text from a
  // default, which is the "stops throwing, starts producing garbage" case.
  assert.equal(
    D.propsOf('case "x": { /* props.Path || "C:\\users\\bin" */ }')[0].default,
    "C:users\bin",
    "a malformed \\u is left as the bare letter, and \\b is a real backspace",
  );
  assert.equal(
    D.propsOf('case "x": { props.P || "a\\u{110000}b"; }')[0].default,
    "au{110000}b",
    "an out-of-range codepoint is left as written, and nothing around it is lost",
  );
});
