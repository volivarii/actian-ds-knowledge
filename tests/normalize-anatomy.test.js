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

test("normalizeLayout maps enums + resolves spacing tokens", function () {
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

test("cornerRadiusCss handles uniform, per-corner scalars, rectangle array, rounding, and none", function () {
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
  // per-corner scalar fields (FRAME/COMPONENT), CSS order TL TR BR BL
  assert.equal(
    N.cornerRadiusCss({
      topLeftRadius: 8,
      topRightRadius: 8,
      bottomRightRadius: 0,
      bottomLeftRadius: 0,
    }),
    "8px 8px 0px 0px",
  );
  // per-corner scalars all equal collapse to a single value
  assert.equal(
    N.cornerRadiusCss({
      topLeftRadius: 6,
      topRightRadius: 6,
      bottomRightRadius: 6,
      bottomLeftRadius: 6,
    }),
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

test("resolveAppearance uses per-side stroke weight when scalar strokeWeight absent", function () {
  var node = {
    type: "FRAME",
    strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
    strokeTopWeight: 2,
    strokeBottomWeight: 2,
    strokeLeftWeight: 2,
    strokeRightWeight: 2,
  };
  assert.deepEqual(resolveApp(node).border, {
    color: "#000000",
    width: "2px",
  });
});

test("spacingValue rounds the px path to 3 decimals", function () {
  assert.equal(
    N.__spacingValue({ paddingLeft: 15.99949999999998 }, "paddingLeft", {}),
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
