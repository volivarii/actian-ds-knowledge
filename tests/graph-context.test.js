"use strict";
var { test } = require("node:test");
var assert = require("node:assert");
var fs = require("fs");
var path = require("path");
var ROOT = path.resolve(__dirname, "..");

var ctx = JSON.parse(
  fs.readFileSync(path.join(ROOT, "graph/context.jsonld"), "utf8"),
)["@context"];
var vocab = JSON.parse(
  fs.readFileSync(path.join(ROOT, "graph/vocabulary.json"), "utf8"),
);

test("context is valid JSON-LD @context with the standard prefixes", function () {
  ["actian-ds", "schema", "skos", "prov", "dcterms"].forEach(function (p) {
    assert.ok(
      typeof ctx[p] === "string" && /^https?:\/\//.test(ctx[p]),
      "prefix " + p,
    );
  });
});

test("context defines an IRI prefix for every node-id prefix in the vocabulary", function () {
  Object.values(vocab.nodeTypes).forEach(function (nt) {
    assert.ok(
      typeof ctx[nt.prefix] === "string" && /\/$/.test(ctx[nt.prefix]),
      "node-id prefix '" +
        nt.prefix +
        "' must be a slash-terminated IRI prefix in the context",
    );
  });
});

test("context defines a type term for every node type", function () {
  var TERM = {
    component: "Component",
    category: "Category",
    a11y_criterion: "A11yCriterion",
    foundation_section: "FoundationSection",
    motion_pattern: "MotionPattern",
    content_topic: "ContentTopic",
    app: "App",
    app_entity: "DomainEntity",
    terminology_term: "Term",
    ux_pattern: "UXPattern",
  };
  Object.keys(vocab.nodeTypes).forEach(function (t) {
    assert.ok(ctx[TERM[t]], "type term for '" + t + "' (" + TERM[t] + ")");
  });
});

test("context maps the core node + edge fields", function () {
  [
    "title",
    "wcag",
    "edgeType",
    "source",
    "target",
    "scope",
    "confidence",
    "note",
    "provenance",
  ].forEach(function (f) {
    assert.ok(f in ctx, "field term '" + f + "'");
  });
  assert.strictEqual(ctx.source["@type"], "@id");
  assert.strictEqual(ctx.target["@type"], "@id");
});

test("context maps the app-context node + edge field terms", function () {
  ["description", "definition", "hiddenLabels", "predicate"].forEach(
    function (f) {
      assert.ok(f in ctx, "field term '" + f + "'");
    },
  );
});
