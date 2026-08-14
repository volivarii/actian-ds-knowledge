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
  var title = entry("chat-with-ai-steward").props.find(function (p) {
    return p.name === "Title";
  });
  assert.ok(title, "chat-with-ai-steward reads props.Title");
  assert.equal(
    title.default,
    "AI Steward",
    "the default must be the literal the renderer falls back to",
  );
});

test("a prop with no literal fallback carries no invented default", function () {
  var message = entry("alert-banner").props.find(function (p) {
    return p.name === "Message";
  });
  assert.ok(message);
  assert.ok(
    !Object.prototype.hasOwnProperty.call(message, "default") ||
      message.default === "",
    'props.Message falls back to "" so the contract must not claim a value',
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

test("a falsy default literal is published, not dropped", function () {
  // `props.Count || "0"` gives a real default. Testing the extractor directly
  // because no such literal exists in the renderer today, and a latent silent
  // drop is exactly what a contract consumer cannot detect.
  var D = require(
    path.join(REPO_ROOT, "scripts", "render", "derive-contract.js"),
  );
  var props = D.propsOf('case "x": { var a = esc(props.Count || "0"); }');
  assert.deepEqual(props, [{ name: "Count", default: "0" }]);
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

test("the derive declares its inputs, and the derive workflow watches all of them", function () {
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
  D.INPUTS.forEach(function (input) {
    var watched = triggers.some(function (t) {
      var prefix = t.replace(/\*+$/, "");
      return input.indexOf(prefix) === 0 || t === input;
    });
    assert.ok(
      watched,
      input + " is a derive input no workflow trigger watches",
    );
  });
});
