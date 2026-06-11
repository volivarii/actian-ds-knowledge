// tests/normalize-anatomy.test.js
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var N = require("../scripts/sync/normalize-anatomy");

test("classifyKind maps Figma types", function () {
  assert.equal(N.classifyKind({ type: "INSTANCE" }), "instance");
  assert.equal(N.classifyKind({ type: "TEXT" }), "text");
  assert.equal(N.classifyKind({ type: "VECTOR" }), "vector");
  assert.equal(N.classifyKind({ type: "ELLIPSE" }), "vector");
  assert.equal(N.classifyKind({ type: "FRAME" }), "container");
  assert.equal(N.classifyKind({ type: "COMPONENT" }), "container");
});

test("normalizeLayout maps enums + resolves spacing tokens", function () {
  var node = {
    layoutMode: "HORIZONTAL", itemSpacing: 8,
    paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16,
    primaryAxisAlignItems: "CENTER", counterAxisAlignItems: "CENTER",
    layoutSizingHorizontal: "HUG", layoutSizingVertical: "HUG",
    boundVariables: { itemSpacing: { id: "V1" } },
  };
  var out = N.normalizeLayout(node, { V1: "--zen-spacing-100" });
  assert.equal(out.axis, "row");
  assert.equal(out.gap, "--zen-spacing-100");
  assert.equal(out.padding.left, "16px");
  assert.deepEqual(out.align, { main: "center", cross: "center" });
  assert.deepEqual(out.sizing, { h: "hug", v: "hug" });
});

test("normalizeLayout returns null when layoutMode is NONE", function () {
  assert.equal(N.normalizeLayout({ layoutMode: "NONE" }, {}), null);
});

test("collectTokenRefs gathers fills/strokes/radius bindings, deduped", function () {
  var node = { boundVariables: { fills: [{ id: "C1" }], strokes: [{ id: "C1" }], cornerRadius: { id: "R1" } } };
  var refs = N.collectTokenRefs(node, { C1: "--zen-color-primary-500", R1: "--zen-radius-100" });
  assert.deepEqual(refs.sort(), ["--zen-color-primary-500", "--zen-radius-100"]);
});

test("instanceProps strips #id suffix and keeps variant/boolean/text", function () {
  var node = { componentProperties: {
    "Size#1:2": { type: "VARIANT", value: "Small" },
    "Disabled#3:4": { type: "BOOLEAN", value: false } } };
  assert.deepEqual(N.instanceProps(node), { Size: "Small", Disabled: false });
});

function newCtx(over) {
  return Object.assign({ nodeIdToSlug: {}, varNameById: {}, total: 0, normalized: 0, degraded: [] }, over || {});
}

test("normalizeNode stops at resolved instance (R1) — no children", function () {
  var ctx = newCtx({ nodeIdToSlug: { "9:9": "checkbox-with-label" } });
  var node = { type: "INSTANCE", name: "Checkbox", componentId: "9:9",
    componentProperties: { "State#1": { type: "VARIANT", value: "Default" } },
    children: [{ type: "FRAME", name: "internal" }] };
  var out = N.normalizeNode(node, ctx);
  assert.equal(out.kind, "instance");
  assert.equal(out.slug, "checkbox-with-label");
  assert.deepEqual(out.props, { State: "Default" });
  assert.equal(out.children, undefined);
  assert.equal(ctx.normalized, 1);
});

test("unresolved instance is flagged, not crashed", function () {
  var ctx = newCtx();
  var out = N.normalizeNode({ type: "INSTANCE", name: "Ext", componentId: "x" }, ctx);
  assert.equal(out.unresolved, true);
  assert.equal(out.slug, undefined);
});

test("text node captures characters", function () {
  var ctx = newCtx();
  var out = N.normalizeNode({ type: "TEXT", name: "Label", characters: "Heads up" }, ctx);
  assert.equal(out.kind, "text");
  assert.equal(out.text, "Heads up");
});

test("NONE container with children degrades (R2)", function () {
  var ctx = newCtx();
  var out = N.normalizeNode({ type: "FRAME", name: "Overlay", layoutMode: "NONE",
    absoluteBoundingBox: { x: 12, y: -4 }, children: [{ type: "TEXT", name: "t", characters: "x" }] }, ctx);
  assert.equal(out.normalizable, false);
  assert.equal(out.rawHint.layoutMode, "NONE");
  assert.equal(out.rawHint.x, 12);
  assert.equal(ctx.degraded.length, 1);
  assert.ok(Array.isArray(out.children) && out.children.length === 1);
});

test("auto-layout container recurses children + counts", function () {
  var ctx = newCtx();
  var out = N.normalizeNode({ type: "FRAME", name: "Row", layoutMode: "HORIZONTAL",
    itemSpacing: 8, children: [{ type: "TEXT", name: "a", characters: "A" }, { type: "TEXT", name: "b", characters: "B" }] }, ctx);
  assert.equal(out.layout.axis, "row");
  assert.equal(out.children.length, 2);
  assert.equal(ctx.total, 3);
  assert.equal(ctx.normalized, 3);
});

test("buildAnatomyFile assembles envelope + quality ratio", function () {
  var root = { type: "FRAME", name: "Banner", layoutMode: "HORIZONTAL", itemSpacing: 8,
    children: [
      { type: "FRAME", name: "Abs", layoutMode: "NONE", children: [{ type: "TEXT", name: "t", characters: "x" }] },
      { type: "TEXT", name: "msg", characters: "Heads up" },
    ] };
  var file = N.buildAnatomyFile(root, { slug: "alert-banner", kit: "dskit", syncedAt: "2026-06-11",
    source: { fileKey: "F", nodeId: "1:1" } });
  assert.equal(file.slug, "alert-banner");
  assert.equal(file.synced_at, "2026-06-11");
  assert.equal(file.quality.nodesTotal, 4);
  assert.equal(file.quality.nodesNormalized, 3);
  assert.equal(file.quality.ratio, 0.75);
  assert.equal(file.quality.degraded.length, 1);
  assert.equal(file.root.children.length, 2);
});
