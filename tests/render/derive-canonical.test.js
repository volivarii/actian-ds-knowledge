"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");
var Ajv2020 = require("ajv/dist/2020");
var addFormats = require("ajv-formats");
var D = require("../../scripts/render/derive-canonical.js");

var SRC = path.resolve(__dirname, "../../components/render/src");

test("deriveCanonical: emits button render + a valid CEM declaration", function () {
  var out = D.deriveCanonical(SRC);
  assert.ok(
    out.renders.button.indexOf("@dsCard") >= 0,
    "render passed through with marker",
  );
  assert.equal(out.cem.schemaVersion, "1.0.0");
  var decl = out.cem.modules
    .flatMap(function (m) {
      return m.declarations || [];
    })
    .find(function (d) {
      return d.tagName === "zen-button";
    });
  assert.ok(decl, "zen-button declaration present");
  assert.ok(
    (decl.attributes || []).some(function (a) {
      return a.name === "emphasis";
    }),
    "emphasis attr",
  );
  assert.ok(
    (decl.cssParts || []).some(function (p) {
      return p.name === "label";
    }),
    "label part",
  );
});

test("deriveCanonical: cssProperties are the button's real consumed tokens, all defined", function () {
  var out = D.deriveCanonical(SRC);
  var decl = out.cem.modules
    .flatMap(function (m) {
      return m.declarations || [];
    })
    .find(function (d) {
      return d.tagName === "zen-button";
    });
  var names = (decl.cssProperties || []).map(function (p) {
    return p.name;
  });
  assert.ok(names.length > 0, "some cssProperties scraped");
  assert.ok(
    names.every(function (n) {
      return n.indexOf("--zen-") === 0;
    }),
    "every cssProperty is a --zen-* token",
  );
  // A token the button visibly consumes (primary fill) must be present, and a
  // token it does NOT consume (a random unrelated primitive) must be absent, so
  // the scrape is the button's real surface, not the whole inlined stylesheet.
  assert.ok(
    names.indexOf("--zen-color-bg-emphasis") >= 0,
    "consumes bg-emphasis",
  );
  assert.ok(
    names.indexOf("--zen-color-primary-500") < 0,
    "does not list an unconsumed primitive",
  );
});

test("deriveCanonical: manifest validates against schemas/canonical-render.json", function () {
  var out = D.deriveCanonical(SRC);
  var schema = require("../../schemas/canonical-render.json");
  var ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  var validate = ajv.compile(schema);
  var ok = validate(out.manifest);
  assert.ok(ok, JSON.stringify(validate.errors));
});
