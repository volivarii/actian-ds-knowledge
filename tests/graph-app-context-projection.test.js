"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var D = require("../scripts/graph/derive-graph.js");
var M = require("../scripts/lib/graph/model.js");
var ROOT = path.join(__dirname, "..");
var AC = JSON.parse(
  fs.readFileSync(path.join(ROOT, "app-context/dist/app-context.json"), "utf8"),
);

function project() {
  var g = new M.GraphBuilder();
  D.collectAppContext(g, AC);
  return g.build();
}

test("collectAppContext: node counts by type (3 app / 30 app_entity / 33 terminology_term / 30 ux_pattern)", function () {
  var out = project();
  var byType = {};
  out.nodes.forEach(function (n) {
    byType[n.type] = (byType[n.type] || 0) + 1;
  });
  assert.equal(byType.app, 3);
  assert.equal(byType.app_entity, 30);
  assert.equal(byType.terminology_term, 33);
  assert.equal(byType.ux_pattern, 30);
  assert.equal(out.nodes.length, 96);
});

test("collectAppContext: app node carries title<-label and description<-purpose", function () {
  var studio = project().nodes.find(function (n) {
    return n.id === "app:studio";
  });
  assert.equal(studio.type, "app");
  assert.equal(studio.title, "Studio");
  assert.equal(studio.description, AC.apps.studio.purpose);
});

test("collectAppContext: app_entity node carries title<-label and description", function () {
  var e = project().nodes.find(function (n) {
    return n.id === "entity:access-request";
  });
  assert.equal(e.type, "app_entity");
  assert.equal(e.title, "Access Request");
  assert.equal(e.description, AC.entities["access-request"].description);
});

test("collectAppContext: terminology_term maps use->title, meaning->definition, notUse->hiddenLabels", function () {
  var t = project().nodes.find(function (n) {
    return n.id === "term:studio";
  });
  assert.equal(t.type, "terminology_term");
  assert.equal(t.title, "Studio");
  assert.equal(t.definition, "Governance/catalog app");
  assert.deepEqual(t.hiddenLabels, ["admin panel", "backend"]);
});

test("collectAppContext: ux_pattern node carries title<-label and description", function () {
  var p = project().nodes.find(function (n) {
    return n.id === "pattern:marketplace-browsing";
  });
  assert.equal(p.type, "ux_pattern");
  assert.equal(p.title, "Marketplace browsing");
  assert.equal(p.description, AC.patterns["marketplace-browsing"].description);
});

test("derive(): emitted graph.json includes the app-context nodes (843 total)", function () {
  D.derive();
  var g = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph/dist/graph.json"), "utf8"),
  );
  assert.equal(g.nodes.length, 843);
  assert.ok(
    g.nodes.some(function (n) {
      return n.id === "app:studio";
    }),
  );
  assert.ok(
    g.nodes.some(function (n) {
      return n.id === "term:data-product";
    }),
  );
});
