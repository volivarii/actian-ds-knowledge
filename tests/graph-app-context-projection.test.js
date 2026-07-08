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
  assert.equal(t.title, AC.terminology.studio.use);
  assert.equal(t.definition, AC.terminology.studio.meaning);
  assert.deepEqual(t.hiddenLabels, AC.terminology.studio.notUse);
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

var V = require("../scripts/graph/validate-graph.js");
var VOCAB = JSON.parse(
  fs.readFileSync(path.join(ROOT, "graph/vocabulary.json"), "utf8"),
);

test("collectAppContext: edge counts (93 in_app / 42 entity_related / 17 term_about)", function () {
  var edges = project().edges;
  function n(type) {
    return edges.filter(function (e) {
      return e.type === type;
    }).length;
  }
  assert.equal(n("in_app"), 93);
  assert.equal(n("entity_related"), 42);
  assert.equal(n("term_about"), 17);
  assert.equal(edges.length, 152);
});

test("collectAppContext: in_app edges point entities/patterns to apps, asserted + provenance cites the dist", function () {
  var inApp = project().edges.filter(function (e) {
    return e.type === "in_app";
  });
  inApp.forEach(function (e) {
    assert.ok(e.target.startsWith("app:"));
    assert.ok(
      e.source.startsWith("entity:") || e.source.startsWith("pattern:"),
    );
    assert.equal(e.confidence, "asserted");
    assert.equal(e.provenance.source_file, "app-context/dist/app-context.json");
    assert.equal(e.provenance.deriver, "derive-graph.js");
  });
  assert.ok(
    inApp.some(function (e) {
      return e.source === "entity:access-request" && e.target === "app:studio";
    }),
  );
  assert.ok(
    inApp.some(function (e) {
      return (
        e.source === "pattern:marketplace-browsing" &&
        e.target === "app:explorer"
      );
    }),
  );
});

test("collectAppContext: entity_related carries the predicate name; endpoints are entity->entity", function () {
  var rel = project().edges.filter(function (e) {
    return e.type === "entity_related";
  });
  rel.forEach(function (e) {
    assert.ok(e.source.startsWith("entity:") && e.target.startsWith("entity:"));
    assert.equal(typeof e.predicate, "string");
    assert.equal(e.confidence, "asserted");
    assert.equal(e.provenance.method, "entities.relationships");
  });
  var preds = new Set(
    rel.map(function (e) {
      return e.predicate;
    }),
  );
  assert.equal(preds.size, 36);
  assert.ok(
    rel.some(function (e) {
      return (
        e.source === "entity:data-product" &&
        e.predicate === "hasInputPorts" &&
        e.target === "entity:input-port"
      );
    }),
  );
});

test("collectAppContext: term_about bridges (11 entity + 3 app + 3 pattern), inferred", function () {
  var ta = project().edges.filter(function (e) {
    return e.type === "term_about";
  });
  assert.equal(ta.length, 17);
  ta.forEach(function (e) {
    assert.equal(e.confidence, "inferred");
    assert.ok(e.source.startsWith("term:"));
    assert.equal(e.provenance.source_file, "app-context/dist/app-context.json");
    assert.equal(e.provenance.method, "term-slug-match");
  });
  assert.ok(
    ta.some(function (e) {
      return (
        e.source === "term:data-product" && e.target === "entity:data-product"
      );
    }),
  );
  assert.ok(
    ta.some(function (e) {
      return e.source === "term:studio" && e.target === "app:studio";
    }),
  );
  assert.ok(
    ta.some(function (e) {
      return e.source === "term:ask-ai" && e.target === "pattern:ask-ai";
    }),
  );
});

test("collectAppContext: the projected island has no dangling refs and no typed-edge violations", function () {
  var r = V.analyze(project(), VOCAB);
  assert.deepEqual(r.dangling, []);
  assert.deepEqual(r.typeViolations, []);
});

test("app-context nodes + edges survive losslessly into graph.jsonld", function () {
  D.derive();
  var ld = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph/dist/graph.jsonld"), "utf8"),
  );
  var byId = {};
  ld["@graph"].forEach(function (o) {
    if (o["@id"]) byId[o["@id"]] = o;
  });

  // terminology_term -> @type Term (context expands to skos:Concept), keeps definition + hiddenLabels
  var term = byId["term:studio"];
  assert.equal(term["@type"], "Term");
  assert.equal(term.definition, AC.terminology.studio.meaning);
  assert.deepEqual(term.hiddenLabels, AC.terminology.studio.notUse);

  // app_entity -> DomainEntity; app -> App; ux_pattern -> UXPattern
  assert.equal(byId["entity:data-product"]["@type"], "DomainEntity");
  assert.equal(byId["app:studio"]["@type"], "App");
  assert.equal(byId["pattern:marketplace-browsing"]["@type"], "UXPattern");

  // entity_related edges keep their predicate through reification
  var rel = ld["@graph"].filter(function (o) {
    return o["@type"] === "Edge" && o.edgeType === "entity_related";
  });
  assert.equal(rel.length, 42);
  assert.ok(
    rel.every(function (e) {
      return typeof e.predicate === "string";
    }),
  );

  // total @graph == nodes + edges of graph.json (lossless)
  var g = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph/dist/graph.json"), "utf8"),
  );
  assert.equal(ld["@graph"].length, g.nodes.length + g.edges.length);
  assert.equal(ld["@graph"].length, 843 + 1081);
});

test("collectAppContext: optional fields are omitted when absent; title falls back to slug/key", function () {
  // Synthetic minimal records: the real dist populates every optional field, so
  // this exercises the false branches the fixture data never hits. The contract
  // (plan): description/definition/hiddenLabels are carried only when present.
  var g = new M.GraphBuilder();
  D.collectAppContext(g, {
    apps: { bare: {} }, // no label, no purpose
    entities: { lonely: {} }, // no label, no description, no apps/relationships
    terminology: { plain: { use: "Plain" } }, // no meaning, no notUse
    patterns: {},
  });
  var out = g.build();
  var app = out.nodes.find(function (n) {
    return n.id === "app:bare";
  });
  assert.equal(app.title, "bare"); // fell back to slug
  assert.ok(!("description" in app)); // purpose absent -> omitted
  var ent = out.nodes.find(function (n) {
    return n.id === "entity:lonely";
  });
  assert.equal(ent.title, "lonely");
  assert.ok(!("description" in ent));
  var term = out.nodes.find(function (n) {
    return n.id === "term:plain";
  });
  assert.ok(!("definition" in term)); // meaning absent -> omitted
  assert.ok(!("hiddenLabels" in term)); // notUse absent -> omitted
  // no apps/relationships anywhere -> no edges
  assert.equal(out.edges.length, 0);
});

test("collectAppContext: empty / undefined input produces no nodes and does not throw", function () {
  var g1 = new M.GraphBuilder();
  assert.doesNotThrow(function () {
    D.collectAppContext(g1, {});
  });
  assert.equal(g1.build().nodes.length, 0);
  var g2 = new M.GraphBuilder();
  assert.doesNotThrow(function () {
    D.collectAppContext(g2, undefined);
  });
  assert.equal(g2.build().nodes.length, 0);
});
