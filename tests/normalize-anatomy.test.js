// tests/normalize-anatomy.test.js
"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var N = require("../scripts/sync/normalize-anatomy");
function resolveApp(n) {
  return N.resolveAppearance(n);
}

test("classifyKind maps Figma types", function () {
  assert.equal(N.classifyKind({ type: "INSTANCE" }), "instance");
  assert.equal(N.classifyKind({ type: "TEXT" }), "text");
  assert.equal(N.classifyKind({ type: "VECTOR" }), "vector");
  assert.equal(N.classifyKind({ type: "ELLIPSE" }), "vector");
  assert.equal(N.classifyKind({ type: "FRAME" }), "container");
  assert.equal(N.classifyKind({ type: "COMPONENT" }), "container");
});

test("normalizeLayout maps enums + captures spacing VALUE with a length-gated token beside it", function () {
  var node = {
    layoutMode: "HORIZONTAL",
    itemSpacing: 8,
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
    primaryAxisAlignItems: "CENTER",
    counterAxisAlignItems: "CENTER",
    layoutSizingHorizontal: "HUG",
    layoutSizingVertical: "HUG",
    boundVariables: { itemSpacing: { id: "V1" } },
  };
  // Second arg is the LENGTH name map (length-valued --zen-* tokens only).
  var out = N.normalizeLayout(node, { V1: "--zen-spacing-100" });
  assert.equal(out.axis, "row");
  assert.equal(out.gap, "8px"); // VALUE, never the bare name (invalid CSS)
  assert.equal(out.gapToken, "--zen-spacing-100"); // token rides in parallel
  assert.equal(out.padding.left, "16px");
  assert.deepEqual(out.align, { main: "center", cross: "center" });
  assert.deepEqual(out.sizing, { h: "hug", v: "hug" });
});

test("normalizeLayout captures per-side paddingTokens for bound sides only", function () {
  var node = {
    layoutMode: "HORIZONTAL",
    itemSpacing: 0,
    paddingTop: 16,
    paddingRight: 8,
    paddingBottom: 16,
    paddingLeft: 8,
    boundVariables: {
      paddingRight: { id: "P1" },
      paddingLeft: { id: "P1" },
    },
  };
  var out = N.normalizeLayout(node, { P1: "--zen-spacing-sm" });
  assert.equal(out.padding.left, "8px");
  assert.deepEqual(out.paddingTokens, {
    right: "--zen-spacing-sm",
    left: "--zen-spacing-sm",
  });
  assert.equal(out.gapToken, undefined); // gap unbound
});

test("normalizeLayout: an unbound layout carries no token keys (value-only, byte-identical to today)", function () {
  var node = {
    layoutMode: "VERTICAL",
    itemSpacing: 4,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
  };
  var out = N.normalizeLayout(node, {});
  assert.equal(out.gap, "4px");
  assert.equal(out.gapToken, undefined);
  assert.equal(out.paddingTokens, undefined);
});

test("normalizeLayout length-gate: a spacing id absent from the length map does not ride (value-only)", function () {
  // e.g. the bound id resolves only as a color name, never a spacing token —
  // the length gate keeps it out, exactly like the appearance color gate.
  var node = {
    layoutMode: "HORIZONTAL",
    itemSpacing: 8,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    boundVariables: { itemSpacing: { id: "COLOR1" } },
  };
  var out = N.normalizeLayout(node, { LEN1: "--zen-spacing-sm" }); // COLOR1 absent
  assert.equal(out.gap, "8px");
  assert.equal(out.gapToken, undefined);
});

test("normalizeLayout returns null when layoutMode is NONE", function () {
  assert.equal(N.normalizeLayout({ layoutMode: "NONE" }, {}), null);
});

test("buildAnatomyFile: lengthNameById reaches a recursed CHILD node's layout", function () {
  // The ctx must carry lengthNameById into child resolution, not just the root,
  // or nested auto-layout containers would silently miss their spacing tokens.
  var node = {
    type: "COMPONENT",
    name: "Card",
    layoutMode: "VERTICAL",
    itemSpacing: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    children: [
      {
        type: "FRAME",
        name: "Row",
        layoutMode: "HORIZONTAL",
        itemSpacing: 8,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        boundVariables: { itemSpacing: { id: "L1" } },
        children: [],
      },
    ],
  };
  var out = N.buildAnatomyFile(node, {
    slug: "card",
    kit: "dskit",
    syncedAt: "t",
    source: {},
    lengthNameById: { L1: "--zen-spacing-xs" },
  });
  assert.equal(out.root.children[0].layout.gap, "8px");
  assert.equal(out.root.children[0].layout.gapToken, "--zen-spacing-xs");
});

test("collectTokenRefs gathers fills/strokes/radius bindings, deduped", function () {
  var node = {
    boundVariables: {
      fills: [{ id: "C1" }],
      strokes: [{ id: "C1" }],
      cornerRadius: { id: "R1" },
    },
  };
  var refs = N.collectTokenRefs(node, {
    C1: "--zen-color-primary-500",
    R1: "--zen-radius-100",
  });
  assert.deepEqual(refs.sort(), [
    "--zen-color-primary-500",
    "--zen-radius-100",
  ]);
});

test("instanceProps strips #id suffix and keeps variant/boolean/text", function () {
  var node = {
    componentProperties: {
      "Size#1:2": { type: "VARIANT", value: "Small" },
      "Disabled#3:4": { type: "BOOLEAN", value: false },
    },
  };
  assert.deepEqual(N.instanceProps(node), { Size: "Small", Disabled: false });
});

function newCtx(over) {
  return Object.assign(
    {
      nodeIdToSlug: {},
      varNameById: {},
      total: 0,
      normalized: 0,
      degraded: [],
    },
    over || {},
  );
}

test("normalizeNode stops at resolved instance (R1) — no children", function () {
  var ctx = newCtx({ nodeIdToSlug: { "9:9": "checkbox-with-label" } });
  var node = {
    type: "INSTANCE",
    name: "Checkbox",
    componentId: "9:9",
    componentProperties: { "State#1": { type: "VARIANT", value: "Default" } },
    children: [{ type: "FRAME", name: "internal" }],
  };
  var out = N.normalizeNode(node, ctx);
  assert.equal(out.kind, "instance");
  assert.equal(out.slug, "checkbox-with-label");
  assert.deepEqual(out.props, { State: "Default" });
  assert.equal(out.children, undefined);
  assert.equal(ctx.normalized, 1);
});

test("unresolved instance is flagged, not crashed", function () {
  var ctx = newCtx();
  var out = N.normalizeNode(
    { type: "INSTANCE", name: "Ext", componentId: "x" },
    ctx,
  );
  assert.equal(out.unresolved, true);
  assert.equal(out.slug, undefined);
});

test("normalizeNode resolves an instance by key when the node-id path misses", function () {
  var ctx = newCtx({
    componentIdToKey: { "6001:1": "ICON_KEY" },
    keyToSlug: { ICON_KEY: "add" },
  });
  var out = N.normalizeNode(
    { type: "INSTANCE", name: "Leading icon", componentId: "6001:1" },
    ctx,
  );
  assert.equal(out.slug, "add");
  assert.equal(out.unresolved, undefined);
  assert.equal(ctx.normalized, 1);
});

test("normalizeNode prefers the node-id path over the key path when both resolve", function () {
  var ctx = newCtx({
    nodeIdToSlug: { "7:7": "checkbox-with-label" },
    componentIdToKey: { "7:7": "OTHER_KEY" },
    keyToSlug: { OTHER_KEY: "wrong-slug" },
  });
  var out = N.normalizeNode(
    { type: "INSTANCE", name: "Checkbox", componentId: "7:7" },
    ctx,
  );
  assert.equal(out.slug, "checkbox-with-label"); // fast path wins; key never consulted
  // the shared resolved-block still counts: a misplaced ctx.normalized++ moved
  // into the Tier-2 branch only would slip past the slug assertion above.
  assert.equal(ctx.normalized, 1);
});

test("normalizeNode flags unresolved when both the node-id and key paths miss", function () {
  var ctx = newCtx({
    componentIdToKey: { "6001:1": "ICON_KEY" },
    keyToSlug: {}, // key found but not mapped to any slug
  });
  var out = N.normalizeNode(
    { type: "INSTANCE", name: "Leading icon", componentId: "6001:1" },
    ctx,
  );
  assert.equal(out.unresolved, true);
  assert.equal(out.slug, undefined);
});

test("normalizeNode resolves a nested composite via the componentSetId bridge (Tier 3) when node-id and key miss", function () {
  var ctx = newCtx({
    nodeIdToSlug: { "20:0": "tag-catalog" }, // the SET's registry nodeId
    componentIdToSetId: { "99:2": "20:0" }, // variant 99:2 -> set 20:0
  });
  var out = N.normalizeNode(
    { type: "INSTANCE", name: "Tag", componentId: "99:2" },
    ctx,
  );
  assert.equal(out.slug, "tag-catalog");
  assert.equal(out.unresolved, undefined);
  assert.equal(ctx.normalized, 1);
});

test("normalizeNode prefers node-id/key over the componentSetId bridge (Tier 3 is a strict fallback)", function () {
  var ctx = newCtx({
    nodeIdToSlug: { "7:7": "checkbox-with-label", "20:0": "tag-catalog" },
    componentIdToSetId: { "7:7": "20:0" }, // would give tag-catalog via Tier 3
  });
  var out = N.normalizeNode(
    { type: "INSTANCE", name: "Checkbox", componentId: "7:7" },
    ctx,
  );
  assert.equal(out.slug, "checkbox-with-label"); // Tier 1 wins; Tier 3 not consulted
});

test("normalizeNode leaves a private set (not a registry nodeId) unresolved via Tier 3", function () {
  var ctx = newCtx({
    nodeIdToSlug: {}, // set 30:0 is not a registry component
    componentIdToSetId: { "99:9": "30:0" },
  });
  var out = N.normalizeNode(
    { type: "INSTANCE", name: ".private", componentId: "99:9" },
    ctx,
  );
  assert.equal(out.unresolved, true);
  assert.equal(out.slug, undefined);
});

test("normalizeNode prefers the key path (Tier 2) over the componentSetId bridge (Tier 3)", function () {
  var ctx = newCtx({
    componentIdToKey: { "6001:1": "K" },
    keyToSlug: { K: "from-key" },
    nodeIdToSlug: { "20:0": "from-set" },
    componentIdToSetId: { "6001:1": "20:0" }, // would give from-set via Tier 3
  });
  var out = N.normalizeNode(
    { type: "INSTANCE", name: "X", componentId: "6001:1" },
    ctx,
  );
  assert.equal(out.slug, "from-key"); // Tier 2 wins; Tier 3 not consulted
  assert.equal(ctx.normalized, 1);
});

test("text node captures characters", function () {
  var ctx = newCtx();
  var out = N.normalizeNode(
    { type: "TEXT", name: "Label", characters: "Heads up" },
    ctx,
  );
  assert.equal(out.kind, "text");
  assert.equal(out.text, "Heads up");
});

test("NONE container with children degrades (R2)", function () {
  var ctx = newCtx();
  var out = N.normalizeNode(
    {
      type: "FRAME",
      name: "Overlay",
      layoutMode: "NONE",
      absoluteBoundingBox: { x: 12, y: -4 },
      children: [{ type: "TEXT", name: "t", characters: "x" }],
    },
    ctx,
  );
  assert.equal(out.normalizable, false);
  assert.equal(out.rawHint.layoutMode, "NONE");
  assert.equal(out.rawHint.x, 12);
  assert.equal(ctx.degraded.length, 1);
  assert.ok(Array.isArray(out.children) && out.children.length === 1);
});

test("auto-layout container recurses children + counts", function () {
  var ctx = newCtx();
  var out = N.normalizeNode(
    {
      type: "FRAME",
      name: "Row",
      layoutMode: "HORIZONTAL",
      itemSpacing: 8,
      children: [
        { type: "TEXT", name: "a", characters: "A" },
        { type: "TEXT", name: "b", characters: "B" },
      ],
    },
    ctx,
  );
  assert.equal(out.layout.axis, "row");
  assert.equal(out.children.length, 2);
  assert.equal(ctx.total, 3);
  assert.equal(ctx.normalized, 3);
});

test("buildAnatomyFile assembles envelope + quality ratio", function () {
  var root = {
    type: "FRAME",
    name: "Banner",
    layoutMode: "HORIZONTAL",
    itemSpacing: 8,
    children: [
      {
        type: "FRAME",
        name: "Abs",
        layoutMode: "NONE",
        children: [{ type: "TEXT", name: "t", characters: "x" }],
      },
      { type: "TEXT", name: "msg", characters: "Heads up" },
    ],
  };
  var file = N.buildAnatomyFile(root, {
    slug: "alert-banner",
    kit: "dskit",
    syncedAt: "2026-06-11",
    source: { fileKey: "F", nodeId: "1:1" },
  });
  assert.equal(file._schema_version, 1);
  assert.equal(file.slug, "alert-banner");
  assert.equal(file.synced_at, "2026-06-11");
  assert.equal(file.quality.nodesTotal, 4);
  assert.equal(file.quality.nodesNormalized, 3);
  assert.equal(file.quality.ratio, 0.75);
  assert.equal(file.quality.degraded.length, 1);
  assert.equal(file.root.children.length, 2);
});

test("figmaColorToCss emits hex for opaque, rgba for alpha", function () {
  assert.equal(N.figmaColorToCss({ r: 1, g: 1, b: 1, a: 1 }), "#ffffff");
  assert.equal(N.figmaColorToCss({ r: 0, g: 0, b: 0, a: 1 }), "#000000");
  assert.equal(
    N.figmaColorToCss({ r: 0.949, g: 0.965, b: 0.973, a: 1 }),
    "#f2f6f8",
  );
  assert.equal(
    N.figmaColorToCss({ r: 0, g: 0, b: 0, a: 0.5 }),
    "rgba(0, 0, 0, 0.5)",
  );
  assert.equal(
    N.figmaColorToCss({ r: 0, g: 0, b: 0, a: 1 }, 0.5),
    "rgba(0, 0, 0, 0.5)",
  );
});

test("topVisibleSolid returns the top-most solid, skips hidden and non-solid", function () {
  assert.equal(N.topVisibleSolid(null), null);
  assert.equal(N.topVisibleSolid([]), null);
  assert.equal(N.topVisibleSolid([{ type: "GRADIENT_LINEAR" }]), null);
  // a hidden top layer is skipped, falling through to the visible one below it
  var solid = { type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } };
  assert.deepEqual(
    N.topVisibleSolid([
      solid,
      { type: "SOLID", visible: false, color: { r: 1, g: 1, b: 1, a: 1 } },
    ]),
    solid,
  );
  // two visible solids: the LAST (top-most, actually rendered) wins, not the first
  var top = { type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } };
  assert.deepEqual(
    N.topVisibleSolid([
      { type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } },
      top,
    ]),
    top,
  );
});

test("cornerRadiusCss handles uniform cornerRadius, rectangleCornerRadii array, rounding, and none", function () {
  assert.equal(N.cornerRadiusCss({ cornerRadius: 4 }), "4px");
  // Figma float drift is rounded (like the text metrics are)
  assert.equal(N.cornerRadiusCss({ cornerRadius: 3.9999999999999996 }), "4px");
  assert.equal(
    N.cornerRadiusCss({ rectangleCornerRadii: [4, 4, 4, 4] }),
    "4px",
  );
  assert.equal(
    N.cornerRadiusCss({ rectangleCornerRadii: [4, 4, 0, 0] }),
    "4px 4px 0px 0px",
  );
  // REST shape (RECTANGLE nodes): rectangleCornerRadii array, CSS order TL TR BR BL
  assert.equal(
    N.cornerRadiusCss({ rectangleCornerRadii: [8, 8, 0, 0] }),
    "8px 8px 0px 0px",
  );
  // rectangleCornerRadii all equal collapse to a single value
  assert.equal(
    N.cornerRadiusCss({ rectangleCornerRadii: [6, 6, 6, 6] }),
    "6px",
  );
  assert.equal(N.cornerRadiusCss({}), null);
});

test("resolveAppearance maps fill/stroke/radius on a container", function () {
  var node = {
    type: "COMPONENT",
    fills: [{ type: "SOLID", color: { r: 0.949, g: 0.965, b: 0.973, a: 1 } }],
    strokes: [{ type: "SOLID", color: { r: 0.376, g: 0.49, b: 0.549, a: 1 } }],
    strokeWeight: 1,
    cornerRadius: 4,
  };
  assert.deepEqual(N.resolveAppearance(node), {
    background: "#f2f6f8",
    border: { color: "#607d8c", width: "1px" },
    radius: "4px",
  });
});

test("resolveAppearance maps color + type on a text node", function () {
  var node = {
    type: "TEXT",
    fills: [{ type: "SOLID", color: { r: 0.314, g: 0.314, b: 0.365, a: 1 } }],
    style: {
      fontSize: 14,
      fontWeight: 400,
      lineHeightPx: 20,
      letterSpacing: 0.14,
    },
  };
  assert.deepEqual(N.resolveAppearance(node), {
    text: {
      color: "#50505d",
      size: "14px",
      weight: 400,
      lineHeight: "20px",
      letterSpacing: "0.14px",
    },
  });
});

test("resolveAppearance returns null when nothing to capture", function () {
  assert.equal(N.resolveAppearance({ type: "FRAME" }), null);
  assert.equal(N.resolveAppearance({ type: "TEXT" }), null);
});

test("resolveAppearance folds node-level opacity into paint alpha", function () {
  var node = {
    type: "COMPONENT",
    opacity: 0.5,
    fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }],
  };
  assert.deepEqual(N.resolveAppearance(node), {
    background: "rgba(255, 0, 0, 0.5)",
  });
});

test("resolveAppearance rounds strokeWeight float drift", function () {
  var node = {
    type: "COMPONENT",
    strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
    strokeWeight: 1.0000000000000002,
  };
  assert.deepEqual(N.resolveAppearance(node), {
    border: { color: "#000000", width: "1px" },
  });
});

function bareCtx() {
  return {
    nodeIdToSlug: {},
    componentIdToKey: {},
    keyToSlug: {},
    varNameById: {},
    total: 0,
    normalized: 0,
    degraded: [],
  };
}

test("normalizeNode attaches appearance on a container with a fill", function () {
  var out = N.normalizeNode(
    {
      type: "COMPONENT",
      name: "Tag",
      fills: [{ type: "SOLID", color: { r: 0.949, g: 0.965, b: 0.973, a: 1 } }],
      layoutMode: "HORIZONTAL",
      itemSpacing: 4,
      paddingTop: 0,
      paddingRight: 8,
      paddingBottom: 0,
      paddingLeft: 8,
      children: [],
    },
    bareCtx(),
  );
  assert.equal(out.appearance.background, "#f2f6f8");
});

test("normalizeNode attaches text appearance on a text node", function () {
  var out = N.normalizeNode(
    {
      type: "TEXT",
      name: "Label",
      characters: "Purple",
      fills: [{ type: "SOLID", color: { r: 0.314, g: 0.314, b: 0.365, a: 1 } }],
      style: { fontSize: 14 },
    },
    bareCtx(),
  );
  assert.equal(out.appearance.text.color, "#50505d");
  assert.equal(out.appearance.text.size, "14px");
});

test("normalizeNode omits appearance when node has no paints", function () {
  var out = N.normalizeNode(
    { type: "FRAME", name: "Wrap", layoutMode: "VERTICAL", children: [] },
    bareCtx(),
  );
  assert.equal("appearance" in out, false);
});

test("figmaColorToCss guards missing rgb channels and clamps alpha", function () {
  // malformed SOLID: only alpha present -> channels default to 0, not NaN
  assert.equal(N.figmaColorToCss({ a: 1 }), "#000000");
  // alpha < 0 clamps to 0 -> rgba branch reads the clamped value, not the raw negative
  assert.equal(
    N.figmaColorToCss({ r: 0, g: 0, b: 0, a: -0.5 }),
    "rgba(0, 0, 0, 0)",
  );
});

test("resolveAppearance uses per-side stroke weight when scalar strokeWeight absent (REST individualStrokeWeights)", function () {
  // REST shape: the Figma REST API exposes per-side stroke weights only as
  // node.individualStrokeWeights = { top, right, bottom, left }. The Plugin-API
  // field names (strokeTopWeight etc.) never appear in REST payloads.
  var node = {
    type: "FRAME",
    strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
    individualStrokeWeights: { top: 2, right: 2, bottom: 2, left: 2 },
  };
  assert.deepEqual(resolveApp(node).border, {
    color: "#000000",
    width: "2px",
  });
});

test("spacingValue rounds the px path to 3 decimals", function () {
  // Value-only now (token capture is a separate length-gated lookup).
  assert.equal(
    N.__spacingValue({ paddingLeft: 15.99949999999998 }, "paddingLeft"),
    "15.999px",
  );
});

test("resolveAppearance records a non-SOLID fill in ctx.degraded", function () {
  var ctx = { degraded: [] };
  var node = {
    type: "FRAME",
    name: "Hero",
    fills: [{ type: "GRADIENT_LINEAR", visible: true }],
  };
  N.resolveAppearance(node, ctx);
  assert.deepEqual(ctx.degraded, [
    { name: "Hero", reason: "non-solid-fill:GRADIENT_LINEAR" },
  ]);
});

test("resolveAppearance does not emit an occluded SOLID background when a visible non-SOLID paint sits on top", function () {
  // Figma paint arrays are back-to-front: index 0 = bottom-most, last = top-most
  // / actually rendered. A visible gradient on top OCCLUDES the red solid below
  // it, so the rendered result has no flat background color at all -- emitting
  // the red would be wrong.
  var ctx = { degraded: [] };
  var node = {
    type: "FRAME",
    name: "Occluded",
    fills: [
      { type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 }, visible: true },
      { type: "GRADIENT_LINEAR", visible: true },
    ],
  };
  var a = N.resolveAppearance(node, ctx);
  // no capturable appearance at all (no background, no border, no radius) -> null
  assert.equal(a, null);
  assert.deepEqual(ctx.degraded, [
    { name: "Occluded", reason: "non-solid-fill:GRADIENT_LINEAR" },
  ]);
});

test("resolveAppearance does not emit an occluded SOLID border when a visible non-SOLID stroke sits on top", function () {
  // Mirrors the fill-occlusion regression above: strokes are the same
  // back-to-front paint array shape, so a visible gradient stroke on top
  // occludes the green solid stroke below it -- no border should be emitted.
  var node = {
    type: "FRAME",
    name: "StrokeOccluded",
    strokes: [
      { type: "SOLID", color: { r: 0, g: 1, b: 0, a: 1 }, visible: true },
      { type: "GRADIENT_LINEAR", visible: true },
    ],
  };
  var a = N.resolveAppearance(node);
  // pre-fix behavior (same-type-only scan) would have found the green SOLID
  // underneath and emitted border.color: "#00ff00" -- it must not appear here.
  assert.equal(a, null);
});

test("resolveAppearance emits border.color for a single visible SOLID stroke (no occlusion)", function () {
  var node = {
    type: "FRAME",
    name: "StrokeSolid",
    strokes: [
      { type: "SOLID", color: { r: 0, g: 1, b: 0, a: 1 }, visible: true },
    ],
  };
  assert.deepEqual(N.resolveAppearance(node).border, { color: "#00ff00" });
});

test("resolveAppearance does not emit an occluded SOLID text color when a visible non-SOLID fill sits on top", function () {
  // Text fills use the same topVisiblePaint occlusion logic as containers: a
  // visible gradient on top occludes the blue solid text fill below it -- no
  // text.color should be emitted.
  var node = {
    type: "TEXT",
    name: "TextOccluded",
    fills: [
      { type: "SOLID", color: { r: 0, g: 0, b: 1, a: 1 }, visible: true },
      { type: "GRADIENT_LINEAR", visible: true },
    ],
  };
  var a = N.resolveAppearance(node);
  // pre-fix behavior (same-type-only scan) would have found the blue SOLID
  // underneath and emitted text.color: "#0000ff" -- it must not appear here.
  assert.equal(a, null);
});

test("resolveAppearance emits text.color for a single visible SOLID text fill (no occlusion)", function () {
  var node = {
    type: "TEXT",
    name: "TextSolid",
    fills: [
      { type: "SOLID", color: { r: 0, g: 0, b: 1, a: 1 }, visible: true },
    ],
  };
  assert.deepEqual(N.resolveAppearance(node).text.color, "#0000ff");
});

test("resolveAppearance records a malformed color-less SOLID fill distinctly from a non-SOLID fill", function () {
  var ctx = { degraded: [] };
  var node = {
    type: "FRAME",
    name: "NoColor",
    fills: [{ type: "SOLID", visible: true }], // SOLID but no .color -- malformed, not "non-solid"
  };
  var a = N.resolveAppearance(node, ctx);
  assert.equal(a, null);
  assert.deepEqual(ctx.degraded, [
    { name: "NoColor", reason: "malformed-fill:SOLID" },
  ]);
});

test("parseVariantName parses clean and dirty names verbatim", function () {
  assert.deepEqual(N.parseVariantName("Intent=Default, Emphasis=Filled"), {
    Intent: "Default",
    Emphasis: "Filled",
  });
  // apostrophe typo + spaces preserved verbatim
  assert.deepEqual(
    N.parseVariantName("Type=Primary, Orientation'=Horizontal"),
    { Type: "Primary", "Orientation'": "Horizontal" },
  );
  // ampersand/space in prop, emoji in value, unit values
  assert.deepEqual(
    N.parseVariantName("Size & Type=1200px, Dev status=🟢 Ready"),
    { "Size & Type": "1200px", "Dev status": "🟢 Ready" },
  );
  // un-renamed placeholder
  assert.deepEqual(N.parseVariantName("Property 1=Default"), {
    "Property 1": "Default",
  });
});

test("parseVariantName returns null for unparseable names", function () {
  assert.equal(N.parseVariantName("Background/Explore"), null);
  assert.equal(N.parseVariantName(""), null);
  assert.equal(N.parseVariantName(null), null);
});

test("diffAppearance returns only differing keys, null for removals", function () {
  assert.deepEqual(
    N.diffAppearance(
      { background: "#fff", radius: "4px" },
      { background: "#f00", radius: "4px" },
    ),
    { background: "#f00" },
  );
  // border object change -> whole border in delta
  assert.deepEqual(
    N.diffAppearance(
      { border: { color: "#aaa", width: "1px" } },
      { border: { color: "#f00", width: "1px" } },
    ),
    { border: { color: "#f00", width: "1px" } },
  );
  // removal: base has border, variant does not
  assert.deepEqual(
    N.diffAppearance({ border: { color: "#aaa", width: "1px" } }, {}),
    { border: null },
  );
  // identical -> null
  assert.equal(
    N.diffAppearance({ background: "#fff" }, { background: "#fff" }),
    null,
  );
  // undefined base
  assert.deepEqual(N.diffAppearance(undefined, { background: "#f00" }), {
    background: "#f00",
  });
});

function acc() {
  return { deltas: [], structural: [] };
}

test("collectDeltas records a root recolor delta", function () {
  var c = {
    kind: "container",
    appearance: { background: "#fff4ec" },
    children: [],
  };
  var v = {
    kind: "container",
    appearance: { background: "#f0ffec" },
    children: [],
  };
  var a = acc();
  N.collectDeltas(c, v, [], a);
  assert.deepEqual(a.deltas, [
    { path: [], appearance: { background: "#f0ffec" } },
  ]);
  assert.deepEqual(a.structural, []);
});

test("collectDeltas keeps an aligned sibling delta while flagging a kind-mismatch sibling (text-input Error)", function () {
  var c = {
    kind: "container",
    children: [
      {
        kind: "container",
        appearance: { border: { color: "#e1e1e6", width: "1px" } },
        children: [],
      },
      { kind: "text", appearance: { text: { color: "#40404a" } } },
    ],
  };
  var v = {
    kind: "container",
    children: [
      {
        kind: "container",
        appearance: { border: { color: "#dc3514", width: "1px" } },
        children: [],
      },
      { kind: "container", children: [] },
    ],
  };
  var a = acc();
  N.collectDeltas(c, v, [], a);
  assert.deepEqual(a.deltas, [
    { path: [0], appearance: { border: { color: "#dc3514", width: "1px" } } },
  ]);
  assert.deepEqual(a.structural, [
    {
      path: [1],
      reason: "kind:text!=container",
      base: ["text:"],
      variant: ["container:"],
    },
  ]);
});

test("collectDeltas flags a child-count mismatch and keeps the root delta (button Hover overlay)", function () {
  var c = {
    kind: "container",
    appearance: { background: "#0f5fdc" },
    children: [{ kind: "vector" }, { kind: "text" }, { kind: "vector" }],
  };
  var v = {
    kind: "container",
    appearance: { background: "#0f5fdc" },
    children: [
      { kind: "container" },
      { kind: "vector" },
      { kind: "text" },
      { kind: "vector" },
    ],
  };
  var a = acc();
  N.collectDeltas(c, v, [], a);
  assert.deepEqual(a.deltas, []); // bg identical -> no root delta
  assert.deepEqual(a.structural, [
    {
      path: [],
      reason: "childCount:3!=4",
      base: ["vector:", "text:", "vector:"],
      variant: ["container:", "vector:", "text:", "vector:"],
    },
  ]);
});

test("collectDeltas aligns children whose names differ (tag status icons)", function () {
  var c = {
    kind: "container",
    children: [
      { kind: "vector", name: "misuse--outline" },
      { kind: "text", appearance: { text: { color: "#50505d" } } },
    ],
  };
  var v = {
    kind: "container",
    children: [
      { kind: "vector", name: "warning--alt" },
      { kind: "text", appearance: { text: { color: "#50505d" } } },
    ],
  };
  var a = acc();
  N.collectDeltas(c, v, [], a);
  assert.deepEqual(a.deltas, []); // icons align by index+kind; label color identical
  assert.deepEqual(a.structural, []); // differing names are NOT a divergence
});

test("collectDeltas records an instance icon slug swap as a variant delta", function () {
  var c = {
    kind: "container",
    children: [
      { kind: "instance", name: "Icon", slug: "x-circle--outline" },
      { kind: "text", appearance: { text: { color: "#50505d" } } },
    ],
  };
  var v = {
    kind: "container",
    children: [
      { kind: "instance", name: "Icon", slug: "check-circle--outline" },
      { kind: "text", appearance: { text: { color: "#50505d" } } },
    ],
  };
  var a = acc();
  N.collectDeltas(c, v, [], a);
  assert.deepEqual(a.deltas, [
    { path: [0], appearance: { slug: "check-circle--outline" } },
  ]);
  assert.deepEqual(a.structural, []);
});

test("collectDeltas emits no slug delta when the variant instance is unresolved", function () {
  var c = {
    kind: "container",
    children: [{ kind: "instance", name: "Icon", slug: "x-circle--outline" }],
  };
  var v = {
    kind: "container",
    children: [{ kind: "instance", name: "Icon", unresolved: true }],
  };
  var a = acc();
  N.collectDeltas(c, v, [], a);
  assert.deepEqual(a.deltas, []);
  assert.deepEqual(a.structural, []);
});

test("collectDeltas captures a variant-only slug when the default instance is unresolved", function () {
  var c = {
    kind: "container",
    children: [{ kind: "instance", name: "Icon", unresolved: true }],
  };
  var v = {
    kind: "container",
    children: [
      { kind: "instance", name: "Icon", slug: "check-circle--outline" },
    ],
  };
  var a = acc();
  N.collectDeltas(c, v, [], a);
  assert.deepEqual(a.deltas, [
    { path: [0], appearance: { slug: "check-circle--outline" } },
  ]);
});

test("collectDeltas merges a slug swap with a paint delta on the same instance", function () {
  var c = {
    kind: "instance",
    name: "Icon",
    slug: "x-circle--outline",
    appearance: { background: "#ffffff" },
  };
  var v = {
    kind: "instance",
    name: "Icon",
    slug: "check-circle--outline",
    appearance: { background: "#f0ffec" },
  };
  var a = acc();
  N.collectDeltas(c, v, [], a);
  assert.deepEqual(a.deltas, [
    {
      path: [],
      appearance: { background: "#f0ffec", slug: "check-circle--outline" },
    },
  ]);
});

// ─── P2 name layer: per-slot token names from boundVariables ────────────────
var P2_CTX = {
  colorNameById: {
    "VariableID:9:1": "--zen-color-bg-selected",
    "VariableID:9:2": "--zen-color-text-secondary",
    "VariableID:9:3": "--zen-color-primary-500",
  },
  lengthNameById: { "VariableID:9:4": "--zen-border-radius-sm" },
};

test("resolveAppearance records backgroundToken from the TOP VISIBLE paint's bound variable", function () {
  var node = {
    type: "FRAME",
    fills: [
      { type: "SOLID", visible: false, color: { r: 1, g: 0, b: 0, a: 1 } },
      { type: "SOLID", color: { r: 0.953, g: 0.961, b: 0.976, a: 1 } },
    ],
    boundVariables: {
      fills: [
        { type: "VARIABLE_ALIAS", id: "VariableID:9:3" },
        { type: "VARIABLE_ALIAS", id: "VariableID:9:1" },
      ],
    },
  };
  var a = N.resolveAppearance(node, P2_CTX);
  // index 1 is the top visible paint; its alias (9:1), NOT the hidden fill's (9:3).
  assert.equal(a.backgroundToken, "--zen-color-bg-selected");
});

test("resolveAppearance records border.colorToken from the stroke's bound variable", function () {
  var node = {
    type: "FRAME",
    strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
    strokeWeight: 1,
    // A bound cornerRadius is deliberately NOT captured as a token: the REST
    // corner-radius bound-variable shape is unverified, so radiusToken waits.
    cornerRadius: 6,
    boundVariables: {
      strokes: [{ type: "VARIABLE_ALIAS", id: "VariableID:9:3" }],
      cornerRadius: { type: "VARIABLE_ALIAS", id: "VariableID:9:4" },
    },
  };
  var a = N.resolveAppearance(node, P2_CTX);
  assert.equal(a.border.colorToken, "--zen-color-primary-500");
  assert.equal(a.radiusToken, undefined);
});

test("resolveAppearance records text.colorToken on TEXT nodes", function () {
  var node = {
    type: "TEXT",
    fills: [{ type: "SOLID", color: { r: 0.25, g: 0.25, b: 0.29, a: 1 } }],
    style: { fontSize: 12 },
    boundVariables: {
      fills: [{ type: "VARIABLE_ALIAS", id: "VariableID:9:2" }],
    },
  };
  var a = N.resolveAppearance(node, P2_CTX);
  assert.equal(a.text.colorToken, "--zen-color-text-secondary");
});

test("a color slot never binds a non-color variable (type gate)", function () {
  var node = {
    type: "FRAME",
    fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
    boundVariables: {
      fills: [{ type: "VARIABLE_ALIAS", id: "VariableID:9:4" }], // a LENGTH var
    },
  };
  var a = N.resolveAppearance(node, P2_CTX);
  assert.equal(a.background, "#ffffff");
  assert.equal(a.backgroundToken, undefined);
});

test("no token maps in ctx -> byte-identical appearance (values only)", function () {
  var node = {
    type: "FRAME",
    fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
    boundVariables: {
      fills: [{ type: "VARIABLE_ALIAS", id: "VariableID:9:1" }],
    },
  };
  assert.deepEqual(N.resolveAppearance(node, {}), { background: "#ffffff" });
});

test("no token rides without its captured value (non-solid fill carries no backgroundToken)", function () {
  var node = {
    type: "FRAME",
    fills: [{ type: "GRADIENT_LINEAR" }],
    boundVariables: {
      fills: [{ type: "VARIABLE_ALIAS", id: "VariableID:9:1" }],
    },
  };
  var ctx = Object.assign({ degraded: [] }, P2_CTX);
  var a = N.resolveAppearance(node, ctx);
  assert.equal(a, null);
});

test("diffAppearance separates deltas that differ only by token binding", function () {
  var d = N.diffAppearance(
    { background: "#ffffff", backgroundToken: "--zen-color-white" },
    { background: "#ffffff" },
  );
  assert.deepEqual(d, { backgroundToken: null });
});

test("buildAnatomyFile carries token names into per-variant deltas", function () {
  var mk = function (name, hex, aliasId) {
    return {
      type: "COMPONENT",
      name: name,
      layoutMode: "HORIZONTAL",
      itemSpacing: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      fills: [{ type: "SOLID", color: hex }],
      boundVariables: {
        fills: [{ type: "VARIABLE_ALIAS", id: aliasId }],
      },
      children: [],
    };
  };
  var out = N.buildAnatomyFile(
    mk("Type=Default", { r: 1, g: 1, b: 1, a: 1 }, "VariableID:9:1"),
    {
      slug: "banner",
      kit: "dskit",
      syncedAt: "2026-07-06",
      source: {},
      colorNameById: {
        "VariableID:9:1": "--zen-color-bg-default",
        "VariableID:9:2": "--zen-color-bg-selected",
      },
      variants: [
        mk("Type=Default", { r: 1, g: 1, b: 1, a: 1 }, "VariableID:9:1"),
        mk(
          "Type=Selected",
          { r: 0.953, g: 0.961, b: 0.976, a: 1 },
          "VariableID:9:2",
        ),
      ],
      defaultVariantName: "Type=Default",
    },
  );
  assert.equal(out.root.appearance.backgroundToken, "--zen-color-bg-default");
  assert.deepEqual(out.root.appearance.variants, [
    {
      prop: "Type",
      values: ["Selected"],
      background: "#f3f5f9",
      backgroundToken: "--zen-color-bg-selected",
    },
  ]);
});

test("buildAnatomyFile captures per-variant icon slug swaps grouped across values", function () {
  var mk = function (name, iconId) {
    return {
      type: "COMPONENT",
      name: name,
      layoutMode: "HORIZONTAL",
      itemSpacing: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      children: [
        { type: "INSTANCE", name: "Icon", componentId: iconId },
        { type: "TEXT", name: "Label", characters: "Status" },
      ],
    };
  };
  var variants = [
    mk("Status=Fail", "9:1"),
    mk("Status=Success", "9:2"),
    mk("Status=Done", "9:2"),
    mk("Status=Offline", "9:1"), // shares the default icon -> no delta
  ];
  var out = N.buildAnatomyFile(variants[0], {
    slug: "tag-status",
    kit: "dskit",
    syncedAt: "2026-07-06",
    source: {},
    nodeIdToSlug: {
      "9:1": "x-circle--outline",
      "9:2": "check-circle--outline",
    },
    variants: variants,
    defaultVariantName: "Status=Fail",
  });
  var icon = out.root.children[0];
  assert.equal(icon.slug, "x-circle--outline"); // default slug stays on the node
  assert.deepEqual(icon.appearance.variants, [
    {
      prop: "Status",
      values: ["Done", "Success"],
      slug: "check-circle--outline",
    },
  ]);
});

test("selectIsolatedVariants isolates each axis at default, records missing", function () {
  var D = { Intent: "Default", Size: "Default" };
  var parsed = [
    { node: { name: "d" }, props: { Intent: "Default", Size: "Default" } }, // default
    { node: { name: "crit" }, props: { Intent: "Critical", Size: "Default" } }, // Intent iso
    { node: { name: "sm" }, props: { Intent: "Default", Size: "Small" } }, // Size iso
    { node: { name: "critSm" }, props: { Intent: "Critical", Size: "Small" } }, // not isolated
  ];
  var r = N.selectIsolatedVariants(parsed, D);
  assert.deepEqual(r.isolated, [
    { prop: "Intent", value: "Critical", node: { name: "crit" } },
    { prop: "Size", value: "Small", node: { name: "sm" } },
  ]);
  assert.deepEqual(r.uncaptured, []);
});

test("selectIsolatedVariants records a value with no isolated row", function () {
  var D = { Intent: "Default", Size: "Default" };
  var parsed = [
    { node: { name: "d" }, props: { Intent: "Default", Size: "Default" } },
    { node: { name: "ghostSm" }, props: { Intent: "Ghost", Size: "Small" } }, // Ghost only paired with Small
  ];
  var r = N.selectIsolatedVariants(parsed, D);
  assert.deepEqual(r.isolated, []);
  assert.deepEqual(r.uncaptured, [
    { prop: "Intent", value: "Ghost", reason: "no isolated variant" },
    { prop: "Size", value: "Small", reason: "no isolated variant" },
  ]);
});

test("buildAnatomyFile attaches per-variant deltas merged across values", function () {
  var mk = function (name, bg) {
    return {
      type: "COMPONENT",
      name: name,
      layoutMode: "HORIZONTAL",
      itemSpacing: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      fills: [{ type: "SOLID", color: bg }],
      children: [],
    };
  };
  var white = { r: 1, g: 1, b: 1, a: 1 };
  var red = { r: 0.863, g: 0.208, b: 0.078, a: 1 }; // #dc3514
  var green = { r: 0.941, g: 1, b: 0.925, a: 1 }; // #f0ffec
  var variants = [
    mk("Type=Default", white),
    mk("Type=Danger", red),
    mk("Type=Success", green),
  ];
  var out = N.buildAnatomyFile(variants[0], {
    slug: "banner",
    kit: "dskit",
    syncedAt: "2026-07-03",
    source: {},
    variants: variants,
    defaultVariantName: "Type=Default",
  });
  assert.deepEqual(out.variantDefaults, { Type: "Default" });
  assert.deepEqual(out.root.appearance.variants, [
    { prop: "Type", values: ["Danger"], background: "#dc3514" },
    { prop: "Type", values: ["Success"], background: "#f0ffec" },
  ]);
});

test("buildAnatomyFile emits uncapturedValues sorted deterministically regardless of variant order", function () {
  var mk = function (name) {
    return {
      type: "COMPONENT",
      name: name,
      layoutMode: "HORIZONTAL",
      itemSpacing: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      children: [],
    };
  };
  var def = mk("Z=Default, A=Default");
  var v1 = mk("Z=Bee, A=Foo");
  var v2 = mk("Z=Aardvark, A=Bar");
  var expected = [
    { prop: "A", value: "Bar", reason: "no isolated variant" },
    { prop: "A", value: "Foo", reason: "no isolated variant" },
    { prop: "Z", value: "Aardvark", reason: "no isolated variant" },
    { prop: "Z", value: "Bee", reason: "no isolated variant" },
  ];
  var outA = N.buildAnatomyFile(def, {
    slug: "banner",
    kit: "dskit",
    syncedAt: "d",
    source: {},
    variants: [def, v1, v2],
    defaultVariantName: "Z=Default, A=Default",
  });
  var outB = N.buildAnatomyFile(def, {
    slug: "banner",
    kit: "dskit",
    syncedAt: "d",
    source: {},
    variants: [def, v2, v1], // shuffled Figma child order
    defaultVariantName: "Z=Default, A=Default",
  });
  assert.deepEqual(outA.quality.uncapturedValues, expected);
  assert.deepEqual(outB.quality.uncapturedValues, expected);
});

test("buildAnatomyFile emits structuralVariants sorted deterministically regardless of variant order", function () {
  var bg = { r: 1, g: 1, b: 1, a: 1 };
  var leaf = function (name) {
    return {
      type: "COMPONENT",
      name: name,
      layoutMode: "HORIZONTAL",
      itemSpacing: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      fills: [{ type: "SOLID", color: bg }],
      children: [],
    };
  };
  var withChild = function (name) {
    return {
      type: "COMPONENT",
      name: name,
      layoutMode: "HORIZONTAL",
      itemSpacing: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      fills: [{ type: "SOLID", color: bg }],
      children: [{ type: "TEXT", name: "t", characters: "x" }],
    };
  };
  // default is a leaf (0 children); isolated Z and isolated A each add one child,
  // so both diverge structurally from the canonical (childCount 0 != 1).
  var def = leaf("Z=Default, A=Default");
  var isoZ = withChild("Z=Bee, A=Default");
  var isoA = withChild("Z=Default, A=Foo");
  var expected = [
    {
      prop: "A",
      value: "Foo",
      path: "",
      reason: "childCount:0!=1",
      base: [],
      variant: ["text:t"],
    },
    {
      prop: "Z",
      value: "Bee",
      path: "",
      reason: "childCount:0!=1",
      base: [],
      variant: ["text:t"],
    },
  ];
  var outA = N.buildAnatomyFile(def, {
    slug: "banner",
    kit: "dskit",
    syncedAt: "d",
    source: {},
    variants: [def, isoZ, isoA],
    defaultVariantName: "Z=Default, A=Default",
  });
  var outB = N.buildAnatomyFile(def, {
    slug: "banner",
    kit: "dskit",
    syncedAt: "d",
    source: {},
    variants: [def, isoA, isoZ], // shuffled Figma child order
    defaultVariantName: "Z=Default, A=Default",
  });
  // Production order (collectDeltas walks variantDefaults' key order, Z then A)
  // is [Z, A], so this assertion only passes because buildAnatomyFile sorts it to
  // [A, Z]; removing the sort flips this to a failing assertion.
  assert.deepEqual(outA.quality.structuralVariants, expected);
  assert.deepEqual(outB.quality.structuralVariants, expected);
});

test("buildAnatomyFile surfaces a non-SOLID fill found only in an isolated variant, tagged with its variant scope", function () {
  // Finding D4: each isolated variant is normalized with a throwaway vctx whose
  // vctx.degraded is otherwise discarded, so a gradient/unnormalizable node that
  // appears ONLY in a non-default variant would be invisible in quality.degraded.
  var mk = function (name, fills) {
    return {
      type: "COMPONENT",
      name: name,
      layoutMode: "HORIZONTAL",
      itemSpacing: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      fills: fills,
      children: [],
    };
  };
  var white = { r: 1, g: 1, b: 1, a: 1 };
  var def = mk("State=Default", [{ type: "SOLID", color: white }]);
  var special = mk("State=Special", [
    { type: "GRADIENT_LINEAR", visible: true },
  ]);
  var out = N.buildAnatomyFile(def, {
    slug: "x",
    kit: "dskit",
    syncedAt: "d",
    source: {},
    variants: [def, special],
    defaultVariantName: "State=Default",
  });
  // default tree itself is clean -> before the fix quality.degraded is []
  assert.deepEqual(out.quality.degraded, [
    {
      name: "State=Special",
      reason: "non-solid-fill:GRADIENT_LINEAR (variant State=Special)",
    },
  ]);
  // ctx.total/ctx.normalized (and thus quality.ratio) stay default-tree-only:
  // the isolated variant's own node must not inflate nodesTotal.
  assert.equal(out.quality.nodesTotal, 1);
  assert.equal(out.quality.nodesNormalized, 1);
});

test("buildAnatomyFile records an unparseable variant child name in uncapturedValues instead of dropping it", function () {
  // Finding M5: variant COMPONENT children whose name does not parse
  // (parseVariantName returns null) were filtered out silently.
  var mk = function (name) {
    return {
      type: "COMPONENT",
      name: name,
      layoutMode: "HORIZONTAL",
      itemSpacing: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      children: [],
    };
  };
  var def = mk("Type=Default");
  var broken = mk("BrokenName"); // no "=" -> parseVariantName returns null
  var out = N.buildAnatomyFile(def, {
    slug: "x",
    kit: "dskit",
    syncedAt: "d",
    source: {},
    variants: [def, broken],
    defaultVariantName: "Type=Default",
  });
  assert.deepEqual(out.quality.uncapturedValues, [
    {
      prop: "(unparseable)",
      value: "BrokenName",
      reason: "unparseable variant name",
    },
  ]);
});

test("buildAnatomyFile output unchanged when no variants passed (P1A byte-compat)", function () {
  var raw = {
    type: "COMPONENT",
    name: "x",
    layoutMode: "HORIZONTAL",
    itemSpacing: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }],
    children: [],
  };
  var a = N.buildAnatomyFile(raw, {
    slug: "x",
    kit: "dskit",
    syncedAt: "d",
    source: {},
  });
  assert.equal("variantDefaults" in a, false);
  assert.equal("variants" in a.root.appearance, false);
});

// ---------------------------------------------------------------------------
// #641: the per-variant evidence the substrate already fetches but discards.
//
// Measured on v0.34.178: of the 44 unexplained variant collapses, 20 belong to
// values whose ISOLATED VARIANT WAS FETCHED, NORMALIZED AND DIFFED — and the
// diff came out empty, because collectDeltas compares paint only and
// normalizeLayout records no dimension. 14 of those 20 carry a bare
// "childCount:1!=5" in quality.structuralVariants: a signal that something
// differs, with the what discarded. These tests pin the three producer gaps.
// ---------------------------------------------------------------------------

test("normalizeLayout records an AUTHORED fixed width, not a hugged one", function () {
  var node = {
    layoutMode: "VERTICAL",
    itemSpacing: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "HUG",
    absoluteBoundingBox: { x: 0, y: 0, width: 450, height: 171 },
    children: [],
  };
  var out = N.normalizeLayout(node);
  // The fixed axis is a design decision and is recorded; the hug axis is a
  // consequence of content, and recording it would invite a consumer to pin a
  // height that must grow with its text.
  assert.deepEqual(out.size, { w: "450px" });
});

test("normalizeLayout omits size entirely when neither axis is authored fixed", function () {
  var node = {
    layoutMode: "HORIZONTAL",
    itemSpacing: 8,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    layoutSizingHorizontal: "HUG",
    layoutSizingVertical: "HUG",
    absoluteBoundingBox: { x: 0, y: 0, width: 88, height: 24 },
    children: [],
  };
  assert.equal("size" in N.normalizeLayout(node), false);
});

test("normalizeLayout omits size when the bounding box is absent, however it sizes", function () {
  var node = {
    layoutMode: "HORIZONTAL",
    itemSpacing: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    children: [],
  };
  assert.equal("size" in N.normalizeLayout(node), false);
});

test("normalizeLayout records both dimensions when both are authored fixed", function () {
  var node = {
    layoutMode: "HORIZONTAL",
    itemSpacing: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "FIXED",
    absoluteBoundingBox: { x: 0, y: 0, width: 320.5, height: 40 },
    children: [],
  };
  assert.deepEqual(N.normalizeLayout(node).size, { w: "320.5px", h: "40px" });
});

test("a degraded node's rawHint carries the size, not only the origin", function () {
  var ctx = {
    nodeIdToSlug: {},
    varNameById: {},
    total: 0,
    normalized: 0,
    degraded: [],
  };
  var out = N.normalizeNode(
    {
      type: "FRAME",
      name: "Badge overlay",
      absoluteBoundingBox: { x: 12, y: -4, width: 24, height: 24 },
      children: [{ type: "TEXT", name: "n", characters: "3" }],
    },
    ctx,
  );
  assert.equal(out.normalizable, false);
  assert.deepEqual(out.rawHint, {
    layoutMode: "NONE",
    x: 12,
    y: -4,
    w: 24,
    h: 24,
  });
});

test("diffLayout returns only the differing keys, null when the layout is identical", function () {
  var base = {
    axis: "row",
    gap: "8px",
    padding: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
    align: { main: "start", cross: "start" },
    sizing: { h: "hug", v: "hug" },
  };
  assert.equal(N.diffLayout(base, JSON.parse(JSON.stringify(base))), null);
  var wider = JSON.parse(JSON.stringify(base));
  wider.gap = "16px";
  wider.size = { w: "450px" };
  assert.deepEqual(N.diffLayout(base, wider), {
    gap: "16px",
    size: { w: "450px" },
  });
});

test("diffLayout records a removal as null, the way diffAppearance does", function () {
  var base = { axis: "row", gap: "8px", size: { w: "1200px" } };
  var variant = { axis: "row", gap: "8px" };
  assert.deepEqual(N.diffLayout(base, variant), { size: null });
});

test("collectDeltas records a layout delta (modal's size axis), separate from paint", function () {
  var lay = function (w) {
    var l = {
      axis: "column",
      gap: "24px",
      padding: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
      align: { main: "start", cross: "start" },
      sizing: { h: "fixed", v: "hug" },
    };
    if (w) l.size = { w: w };
    return l;
  };
  var c = { kind: "container", layout: lay("1200px"), children: [] };
  var v = { kind: "container", layout: lay("450px"), children: [] };
  var a = acc();
  N.collectDeltas(c, v, [], a);
  assert.deepEqual(a.deltas, []); // paint is identical
  assert.deepEqual(a.layoutDeltas, [
    { path: [], layout: { size: { w: "450px" } } },
  ]);
  assert.deepEqual(a.structural, []);
});

test("collectDeltas flags a layout that appears or disappears as structural, not as a delta", function () {
  var c = {
    kind: "container",
    layout: {
      axis: "row",
      gap: "0px",
      padding: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
      align: { main: "start", cross: "start" },
      sizing: { h: "hug", v: "hug" },
    },
    children: [],
  };
  var v = { kind: "container", children: [] }; // degraded in this variant
  var a = acc();
  N.collectDeltas(c, v, [], a);
  assert.deepEqual(a.layoutDeltas, []);
  assert.deepEqual(a.structural, [{ path: [], reason: "layout:row!=none" }]);
});

test("a child-count mismatch names what sits on each side, not just how many", function () {
  var c = {
    kind: "container",
    children: [
      { kind: "container", name: "Header" },
      { kind: "container", name: "Body" },
      { kind: "container", name: "Footer" },
    ],
  };
  var v = {
    kind: "container",
    children: [{ kind: "text", name: "Message" }],
  };
  var a = acc();
  N.collectDeltas(c, v, [], a);
  assert.deepEqual(a.structural, [
    {
      path: [],
      reason: "childCount:3!=1",
      base: ["container:Header", "container:Body", "container:Footer"],
      variant: ["text:Message"],
    },
  ]);
});

test("a kind mismatch names the node on each side", function () {
  var a = acc();
  N.collectDeltas(
    { kind: "container", name: "Title" },
    { kind: "text", name: "Title" },
    [1],
    a,
  );
  assert.deepEqual(a.structural, [
    {
      path: [1],
      reason: "kind:container!=text",
      base: ["container:Title"],
      variant: ["text:Title"],
    },
  ]);
});

test("buildAnatomyFile attaches per-variant layout deltas under layout.variants", function () {
  var mk = function (name, width) {
    return {
      type: "COMPONENT",
      name: name,
      layoutMode: "VERTICAL",
      itemSpacing: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      layoutSizingHorizontal: "FIXED",
      layoutSizingVertical: "HUG",
      absoluteBoundingBox: { x: 0, y: 0, width: width, height: 171 },
      children: [],
    };
  };
  var variants = [
    mk("Size=1200px", 1200),
    mk("Size=450px warning", 450),
    mk("Size=450px confirm", 450),
  ];
  var out = N.buildAnatomyFile(variants[0], {
    slug: "modal",
    kit: "dskit",
    syncedAt: "2026-09-03",
    source: {},
    variants: variants,
    defaultVariantName: "Size=1200px",
  });
  assert.deepEqual(out.root.layout.size, { w: "1200px" });
  // Both 450px values carry the SAME delta, so they merge into one entry —
  // the same grouping appearance.variants uses.
  assert.deepEqual(out.root.layout.variants, [
    {
      prop: "Size",
      values: ["450px confirm", "450px warning"],
      size: { w: "450px" },
    },
  ]);
});

test("buildAnatomyFile emits no layout.variants when every variant lays out alike (byte-compat)", function () {
  var mk = function (name, bg) {
    return {
      type: "COMPONENT",
      name: name,
      layoutMode: "HORIZONTAL",
      itemSpacing: 8,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      fills: [{ type: "SOLID", color: bg }],
      children: [],
    };
  };
  var out = N.buildAnatomyFile(mk("Type=Default", { r: 1, g: 1, b: 1, a: 1 }), {
    slug: "banner",
    kit: "dskit",
    syncedAt: "d",
    source: {},
    variants: [
      mk("Type=Default", { r: 1, g: 1, b: 1, a: 1 }),
      mk("Type=Danger", { r: 0.863, g: 0.208, b: 0.078, a: 1 }),
    ],
    defaultVariantName: "Type=Default",
  });
  assert.equal("variants" in out.root.layout, false);
  assert.equal(out.root.appearance.variants.length, 1); // paint delta still lands
});
