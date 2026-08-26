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

test("collectAppContext: node counts by type (3 app / 30 app_entity / 33 terminology_term / 31 ux_pattern)", function () {
  var out = project();
  var byType = {};
  out.nodes.forEach(function (n) {
    byType[n.type] = (byType[n.type] || 0) + 1;
  });
  assert.equal(byType.app, 3);
  assert.equal(byType.app_entity, 30);
  assert.equal(byType.terminology_term, 33);
  assert.equal(byType.ux_pattern, 31);
  assert.equal(out.nodes.length, 97);
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

test("derive(): emitted graph.json includes the app-context nodes (97 island nodes)", function () {
  D.derive();
  var g = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph/dist/graph.json"), "utf8"),
  );
  // Pinned the app-context island, not the whole graph. This asserted
  // `g.nodes.length === 815` and so broke on any Figma sync that added or
  // removed a component, which has nothing to do with app-context. See the
  // long note in the losslessness test below.
  var ISLAND_PREFIXES = ["app", "entity", "pattern", "term"];
  var islandNodes = g.nodes.filter(function (n) {
    return ISLAND_PREFIXES.indexOf(String(n.id).split(":")[0]) !== -1;
  });
  assert.equal(islandNodes.length, 97, "app-context island nodes");
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

test("collectAppContext: edge counts (95 in_app / 42 entity_related / 17 term_about, 154 total)", function () {
  var edges = project().edges;
  function n(type) {
    return edges.filter(function (e) {
      return e.type === type;
    }).length;
  }
  assert.equal(n("in_app"), 95);
  assert.equal(n("entity_related"), 42);
  assert.equal(n("term_about"), 17);
  assert.equal(edges.length, 154);
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

  // total @graph == nodes + edges of graph.json (lossless). Data-derived: it
  // holds at any graph size, so Figma churn cannot make it lie or nag.
  var g = JSON.parse(
    fs.readFileSync(path.join(ROOT, "graph/dist/graph.json"), "utf8"),
  );
  assert.equal(ld["@graph"].length, g.nodes.length + g.edges.length);

  // Size canary, scoped to THIS TEST'S SUBJECT: the app-context island.
  //
  // It used to pin the WHOLE graph (`815 + 1072`), which was a false alarm
  // generator. The total moves whenever Figma changes a component, so every
  // sync that touched composition turned this test red and a human had to
  // hand-restamp the constant (see "test(graph): restamp the pinned counts",
  // pushed onto sync #415). That is worse than useless: an ADDITIVE sync goes
  // red, fails to auto-merge, and the vendor queue stalls with nobody told,
  // which is precisely the silent-failure pattern the alarm was meant to serve.
  // A check that cries wolf on the system working normally teaches people to
  // scroll past it.
  //
  // The island is the right thing to pin here. It is projected from authored
  // app-context sources, NOT from Figma, so it does not move when a component
  // gains a slot. It moves when someone edits app-context, OR when a component
  // a pattern references leaves the registry so its pattern->component edge can
  // no longer form -- both are changes this test exists to surface. Verified:
  // the 2026-07-14 sync added 2 `composed_of` edges and left the island at
  // 96/245. The 2026-07-23 breaking sync then dropped it to 96/242: three
  // app-context patterns (marketplace-browsing, federated-catalog,
  // search-filtered-table) reference `search-filters`, which left the registry
  // that sync, so those three pattern->component edges no longer project. The
  // Those three references have since been REMOVED: #484's gate fails the graph
  // derive on a components[] entry that resolves to nothing, and search-filters
  // is a genuine removal rather than a rename (no component in any new registry
  // carries its Figma key 919ddc42...). Its authored guideline stays and is
  // guidance-only now, the same authored-without-a-registry-component state as
  // combo-box/multi-select in guideline-reachability's UNREACHABLE list. If it
  // is republished, the references and their edges can come back and this pin
  // moves up again. 2026-08-18 moved it from 96/242 to 97/252: the
  // `faceted-browse` pattern was added (the Studio Catalog page shape, which
  // had no pattern at all), contributing 1 node, 2 in_app edges for its two
  // apps, and 7 pattern->component edges for the registry components it names.
  // This is the pin behaving as designed: an app-context edit is exactly what
  // it exists to surface.
  //
  // Later the same day, 252 -> 263, edges only and no new node: the thin
  // `asset-detail-360` pattern was rewritten from a capture of the Studio
  // Dataset page, and its `components` list grew from 5 to 16 as a result.
  // Direction is up and that is the point of the edit: the pattern now names
  // the components the page actually uses, so 11 more pattern->component edges
  // exist that the graph could not previously see. `chip` is deliberately not
  // among them; the DS tier expresses a removable chip as `tag-interactive`.
  //
  // 263 -> 266: a review found two patterns whose CORRECTED prose disagreed with
  // their own `components`. `access-request-management` said "there are no
  // status tabs" while still asserting a uses_component edge to `tabs`, and
  // `import-wizard` described radio cards and an action bar it did not name.
  // Correcting prose and leaving the machine-read field is how a graph keeps
  // asserting something the record itself denies.
  //
  // 269 -> 266, edges only: `chat-with-ai-steward` left the registry when its
  // Figma component was unpublished on 2026-08-26 (an old version, being rebuilt,
  // archived in the file rather than deleted), and the three patterns that named
  // it (ai-analyst-panel, ask-ai, data-steward-agent-panel) dropped the
  // reference. Its authored guideline stays and is guidance-only, the same state
  // search-filters is in below. When it is republished the reference comes back
  // and so does this count. Before that, 272 -> 269, edges only: the 2026-08-24 breaking sync (#526) retired
  // card-for-items, and the three patterns that named it dropped the reference
  // rather than repointing it at a component nobody has verified for that
  // screen. Before that, 266 -> 272, again edges only: two Studio patterns were corrected against the
  // running product rather than counted. `analytics-dashboard` named
  // `card-for-items` where its completion cards are the `card-for-perimeter`
  // shape (+2 net), and `type-picker-grid` named `card-for-items` and `modal`
  // for what is a full page of radio cards (+4 net). Both were among the five
  // patterns cited as depending on `card-for-items` in the #526 hold, so the
  // recorded cost of that decision falls as a side effect of the correction.
  var ISLAND_PREFIXES = ["app", "entity", "pattern", "term"];
  var inIsland = function (id) {
    return ISLAND_PREFIXES.indexOf(String(id).split(":")[0]) !== -1;
  };
  var islandNodes = g.nodes.filter(function (n) {
    return inIsland(n.id);
  });
  var islandEdges = g.edges.filter(function (e) {
    return inIsland(e.source) || inIsland(e.target);
  });
  assert.equal(islandNodes.length, 97, "app-context island nodes");
  assert.equal(islandEdges.length, 266, "app-context island edges");
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
