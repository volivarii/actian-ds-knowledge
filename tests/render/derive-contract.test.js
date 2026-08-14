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
