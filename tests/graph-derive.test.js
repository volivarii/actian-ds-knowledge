"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var D = require("../scripts/graph/derive-graph.js");

test("collectComponentsAndCategories: component nodes, category nodes, in_category edges", function () {
  var registries = {
    components: {
      button: { name: "Button", category: "Action" },
      "data-grid": { name: "Data Grid", category: "Data Display" },
      "app-icon": { name: "App Icon", category: "Icons" },
      "icon-only": { name: "Icon only" },
    },
  };
  var g = new (require("../scripts/lib/graph/model.js").GraphBuilder)();
  D.collectComponentsAndCategories(g, [registries]);
  var out = g.build();
  var ids = out.nodes.map(function (n) {
    return n.id;
  });
  assert.ok(ids.includes("component:button"));
  assert.ok(ids.includes("category:action"));
  assert.ok(ids.includes("category:data-display"));
  assert.ok(ids.includes("category:icons"));
  var cat = out.nodes.find(function (n) {
    return n.id === "category:action";
  });
  assert.equal(cat.provenance, "figma-dskit");
  assert.ok(
    out.edges.some(function (e) {
      return (
        e.type === "in_category" &&
        e.source === "component:button" &&
        e.target === "category:action"
      );
    }),
  );
  assert.ok(
    ids.includes("component:icon-only"),
    "no-category component still gets a node",
  );
  assert.ok(
    !out.edges.some(function (e) {
      return e.source === "component:icon-only";
    }),
    "no-category component gets no in_category edge",
  );
});

test("collectComponentsAndCategories: category overrides apply only when the registry carries no category (registry always wins)", function () {
  var registries = {
    components: {
      "radio-button": { name: "Radio Button" },
      button: { name: "Button", category: "Action" },
      "ghost-slug": {},
    },
  };
  var overrides = {
    overrides: {
      "radio-button": "Form (input & selection)",
      button: "Ignored Category",
      "unknown-slug": "Nowhere",
    },
  };
  var g = new (require("../scripts/lib/graph/model.js").GraphBuilder)();
  D.collectComponentsAndCategories(g, [registries], overrides);
  var out = g.build();
  assert.ok(
    out.edges.some(function (e) {
      return (
        e.type === "in_category" &&
        e.source === "component:radio-button" &&
        e.target === "category:form-input-selection"
      );
    }),
    "override applied for category-less component",
  );
  assert.ok(
    out.edges.some(function (e) {
      return (
        e.type === "in_category" &&
        e.source === "component:button" &&
        e.target === "category:action"
      );
    }),
    "registry category kept",
  );
  assert.ok(
    !out.edges.some(function (e) {
      return (
        e.source === "component:button" &&
        e.target === "category:ignored-category"
      );
    }),
    "override ignored when registry already carries a category (registry wins)",
  );
  assert.ok(
    !out.nodes.some(function (n) {
      return n.id === "category:nowhere";
    }),
    "override for a slug absent from all registries produces nothing",
  );
});

test("collectA11yCriteria: nodes from a11y-index sections", function () {
  var g = new (require("../scripts/lib/graph/model.js").GraphBuilder)();
  D.collectA11yCriteria(g, {
    sections: [
      { slug: "color-contrast", title: "Color & Contrast", wcag: ["1.4.1"] },
    ],
  });
  var n = g.build().nodes.find(function (x) {
    return x.id === "a11y:color-contrast";
  });
  assert.equal(n.type, "a11y_criterion");
  assert.deepEqual(n.wcag, ["1.4.1"]);
});
test("collectFoundationSections: nodes from the foundations bundle tree (recursive)", function () {
  var g = new (require("../scripts/lib/graph/model.js").GraphBuilder)();
  D.collectFoundationSections(g, {
    id: "",
    title: "root",
    children: [
      {
        id: "tokens",
        title: "Tokens",
        children: [{ id: "tokens/spacing", title: "Spacing" }],
      },
    ],
  });
  var ids = g.build().nodes.map(function (n) {
    return n.id;
  });
  assert.ok(ids.includes("foundation:tokens"));
  assert.ok(ids.includes("foundation:tokens/spacing"));
  assert.ok(!ids.includes("foundation:"));
});
test("collectMotionPatterns: nodes from motion.patterns keys", function () {
  var g = new (require("../scripts/lib/graph/model.js").GraphBuilder)();
  D.collectMotionPatterns(g, {
    patterns: { "skeleton-loading": { title: "Skeleton Loading" } },
  });
  var n = g.build().nodes.find(function (x) {
    return x.id === "motion:skeleton-loading";
  });
  assert.equal(n.type, "motion_pattern");
});

test("collectTransversalRefs: category→target edges with note, per ref kind", function () {
  var g = new (require("../scripts/lib/graph/model.js").GraphBuilder)();
  D.collectTransversalRefs(g, "data-display", {
    a11y_refs: {
      requirementRefs: [{ ref: "color-contrast", note: "non-color cue" }],
    },
    motion_refs: { patternRefs: [{ ref: "skeleton-loading" }] },
    foundations_refs: { sectionRefs: [{ ref: "tokens" }] },
  });
  var e = g.build().edges;
  assert.ok(
    e.some(function (x) {
      return (
        x.type === "a11y_ref" &&
        x.source === "category:data-display" &&
        x.target === "a11y:color-contrast" &&
        x.note === "non-color cue"
      );
    }),
  );
  assert.ok(
    e.some(function (x) {
      return x.type === "motion_ref" && x.target === "motion:skeleton-loading";
    }),
  );
  assert.ok(
    e.some(function (x) {
      return x.type === "foundations_ref" && x.target === "foundation:tokens";
    }),
  );
});
test("collectRelated: content_topic node + related edges to components", function () {
  var g = new (require("../scripts/lib/graph/model.js").GraphBuilder)();
  D.collectRelated(g, [
    {
      slug: "forms",
      title: "Forms",
      relatedComponents: ["text-input", "checkbox"],
    },
  ]);
  var out = g.build();
  assert.ok(
    out.nodes.some(function (n) {
      return n.id === "content:forms" && n.type === "content_topic";
    }),
  );
  assert.ok(
    out.edges.some(function (e) {
      return (
        e.type === "related" &&
        e.source === "content:forms" &&
        e.target === "component:text-input"
      );
    }),
  );
});
test("collectFoundationChildEdges: parent→child from the tree", function () {
  var g = new (require("../scripts/lib/graph/model.js").GraphBuilder)();
  D.collectFoundationChildEdges(g, {
    id: "",
    children: [{ id: "tokens", children: [{ id: "tokens/spacing" }] }],
  });
  var e = g.build().edges;
  assert.ok(
    e.some(function (x) {
      return (
        x.type === "narrower" &&
        x.source === "foundation:tokens" &&
        x.target === "foundation:tokens/spacing"
      );
    }),
  );
});

test("collectMotionPatterns: node id uses the pattern .slug, not the object key", function () {
  var g = new (require("../scripts/lib/graph/model.js").GraphBuilder)();
  D.collectMotionPatterns(g, {
    patterns: {
      accordion: { slug: "accordion-expand-collapse", name: "Accordion" },
    },
  });
  var ids = g.build().nodes.map(function (n) {
    return n.id;
  });
  assert.ok(ids.includes("motion:accordion-expand-collapse"), "uses .slug");
  assert.ok(!ids.includes("motion:accordion"), "not the object key");
});

test("collectTransversalRefs: edges carry scope=category + provenance + confidence", function () {
  var g = new (require("../scripts/lib/graph/model.js").GraphBuilder)();
  D.collectTransversalRefs(g, "action", {
    _meta: { source: "components/src/categories/action.md" },
    a11y_refs: {
      requirementRefs: [{ ref: "focus-keyboard", note: "Enter/Space" }],
    },
  });
  var e = g.build().edges.find(function (x) {
    return x.type === "a11y_ref" && x.target === "a11y:focus-keyboard";
  });
  assert.equal(e.scope, "category");
  assert.equal(e.confidence, "asserted");
  assert.equal(e.provenance.source_file, "components/src/categories/action.md");
  assert.equal(e.provenance.method, "a11y_refs.requirementRefs");
  assert.equal(e.note, "Enter/Space");
});

test("collectComponentRefs: keys by registry-slug (filename), guards node existence", function () {
  var M = require("../scripts/lib/graph/model.js");
  var g = new M.GraphBuilder();
  g.addNode({ id: "component:button", type: "component", title: "Button" });
  g.addNode({
    id: "component:checkbox-with-label",
    type: "component",
    title: "Checkbox",
  });
  D.collectComponentRefs(g, [
    {
      slug: "button",
      doc: {
        slug: "button",
        _meta: { source: "components/src/button/" },
        meta: {
          a11y_refs: [{ ref: "buttons" }],
          foundations_refs: [{ ref: "tokens", note: "spacing" }],
        },
      },
    },
    {
      slug: "checkbox-with-label",
      doc: {
        slug: "checkbox",
        _alias_of: "checkbox",
        meta: { a11y_refs: [{ ref: "forms" }] },
      },
    },
    {
      slug: "checkbox",
      doc: { slug: "checkbox", meta: { a11y_refs: [{ ref: "forms" }] } },
    },
    {
      slug: "card",
      doc: { slug: "card", meta: { a11y_refs: [{ ref: "cards" }] } },
    },
  ]);
  var e = g.build().edges;
  var btn = e.find(function (x) {
    return (
      x.type === "a11y_ref" &&
      x.source === "component:button" &&
      x.target === "a11y:buttons"
    );
  });
  assert.ok(btn, "button edge emitted");
  assert.equal(btn.scope, "component");
  assert.equal(btn.confidence, "asserted");
  assert.equal(btn.provenance.method, "meta.a11y_refs");
  assert.equal(btn.provenance.source_file, "components/src/button/");
  assert.ok(
    e.some(function (x) {
      return (
        x.type === "foundations_ref" &&
        x.source === "component:button" &&
        x.target === "foundation:tokens" &&
        x.note === "spacing"
      );
    }),
    "button → foundation:tokens with note",
  );
  assert.ok(
    e.some(function (x) {
      return (
        x.source === "component:checkbox-with-label" &&
        x.target === "a11y:forms"
      );
    }),
    "alias filename emits under registry slug",
  );
  assert.ok(
    !e.some(function (x) {
      return x.source === "component:checkbox";
    }),
    "canonical non-node slug skipped (no dangling)",
  );
  assert.ok(
    !e.some(function (x) {
      return x.source === "component:card";
    }),
    "orphan guidance (no node) skipped",
  );
});

test("graph.json: component-scoped a11y_ref edges are present after derive", function () {
  var fs = require("node:fs"),
    path = require("node:path");
  var graph = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "graph", "dist", "graph.json"),
      "utf8",
    ),
  );
  assert.equal(graph._schema_version, 2);
  var compA11y = graph.edges.filter(function (e) {
    return e.type === "a11y_ref" && e.scope === "component";
  });
  assert.ok(
    compA11y.length >= 1,
    "expected >=1 component-scoped a11y_ref edge",
  );
  assert.ok(
    compA11y.some(function (e) {
      return (
        e.source === "component:checkbox-with-label" &&
        e.target === "a11y:forms"
      );
    }),
    "expected component:checkbox-with-label -> a11y:forms",
  );
});

test("graph.json: category-override stopgap keeps in_category edges for category-less dskit components", function () {
  var fs = require("node:fs"),
    path = require("node:path");
  var graph = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "graph", "dist", "graph.json"),
      "utf8",
    ),
  );
  assert.ok(
    graph.edges.some(function (e) {
      return (
        e.type === "in_category" &&
        e.source === "component:radio-button" &&
        e.target === "category:form-input-selection"
      );
    }),
    "expected component:radio-button -> category:form-input-selection via the curated override (components/src/category-overrides.json)",
  );
});

test("collectTransversalRefs: skips malformed refs missing .ref (no throw, no edge)", function () {
  var M = require("../scripts/lib/graph/model.js");
  var g = new M.GraphBuilder();
  g.addNode({
    id: M.nodeId("category", "action"),
    type: "category",
    title: "Action",
  });
  g.addNode({
    id: M.nodeId("a11y_criterion", "contrast"),
    type: "a11y_criterion",
    title: "Contrast",
  });
  assert.doesNotThrow(function () {
    D.collectTransversalRefs(g, "action", {
      a11y_refs: {
        requirementRefs: [{ ref: "contrast" }, { note: "no ref" }, {}],
      },
    });
  });
  var edges = g.build().edges.filter(function (e) {
    return e.type === "a11y_ref";
  });
  assert.equal(edges.length, 1);
});

test("bundleToTree: reconstructs tree from bundle format; scoped sibling lookup + leaf fallback", function () {
  var bundle = {
    _index: {
      id: "",
      title: "Root",
      children: [
        { id: "tokens", title: "Tokens" },
        { id: "design-guidelines", title: "Guidelines" },
      ],
    },
    tokens: {
      _index: {
        id: "tokens",
        title: "Tokens",
        children: [{ id: "tokens/breakpoints", title: "Breakpoints" }],
      },
      breakpoints: {
        id: "tokens/breakpoints",
        title: "Breakpoints",
        blocks: [],
      },
    },
    "design-guidelines": {
      _index: {
        id: "design-guidelines",
        title: "Guidelines",
        children: [
          { id: "design-guidelines/breakpoints", title: "Breakpoints" },
        ],
      },
      breakpoints: {
        _index: {
          id: "design-guidelines/breakpoints",
          title: "Breakpoints",
          children: [
            { id: "design-guidelines/breakpoints/grid", title: "Grid" },
          ],
        },
        grid: {
          id: "design-guidelines/breakpoints/grid",
          title: "Grid",
          blocks: [],
        },
      },
    },
  };
  var tree = D.bundleToTree(bundle);
  var tokensNode = tree.children.find(function (c) {
    return c.id === "tokens";
  });
  assert.equal(tokensNode.children[0].id, "tokens/breakpoints"); // scoped: not the design-guidelines one
  assert.equal(tokensNode.children[0].children, undefined); // leaf: no _index → no children
  var dgNode = tree.children.find(function (c) {
    return c.id === "design-guidelines";
  });
  assert.equal(
    dgNode.children[0].children[0].id,
    "design-guidelines/breakpoints/grid",
  ); // recurses
});
