// scripts/sync/normalize-anatomy.js
"use strict";

var VECTOR_TYPES = [
  "VECTOR",
  "BOOLEAN_OPERATION",
  "LINE",
  "ELLIPSE",
  "STAR",
  "POLYGON",
  "RECTANGLE",
];

function classifyKind(node) {
  var t = node.type;
  if (t === "INSTANCE") return "instance";
  if (t === "TEXT") return "text";
  if (VECTOR_TYPES.indexOf(t) >= 0) return "vector";
  return "container"; // FRAME / COMPONENT / COMPONENT_SET / GROUP
}

var AXIS = { HORIZONTAL: "row", VERTICAL: "column" };
var MAIN_ALIGN = {
  MIN: "start",
  CENTER: "center",
  MAX: "end",
  SPACE_BETWEEN: "space-between",
};
var CROSS_ALIGN = {
  MIN: "start",
  CENTER: "center",
  MAX: "end",
  BASELINE: "baseline",
  STRETCH: "stretch",
};
var SIZING = { FIXED: "fixed", HUG: "hug", FILL: "fill" };

function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function hex2(n) {
  var s = Math.round(n).toString(16);
  return s.length === 1 ? "0" + s : s;
}
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function figmaColorToCss(color, opacity) {
  if (!color) return null;
  var a =
    (typeof color.a === "number" ? color.a : 1) *
    (typeof opacity === "number" ? opacity : 1);
  var r = clamp01(color.r) * 255;
  var g = clamp01(color.g) * 255;
  var b = clamp01(color.b) * 255;
  if (a >= 0.999) return "#" + hex2(r) + hex2(g) + hex2(b);
  return (
    "rgba(" +
    Math.round(r) +
    ", " +
    Math.round(g) +
    ", " +
    Math.round(b) +
    ", " +
    round3(a) +
    ")"
  );
}

function firstVisibleSolid(paints) {
  if (!Array.isArray(paints)) return null;
  for (var i = 0; i < paints.length; i++) {
    var p = paints[i];
    if (p && p.type === "SOLID" && p.visible !== false && p.color) return p;
  }
  return null;
}

function cornerRadiusCss(node) {
  if (typeof node.cornerRadius === "number") return node.cornerRadius + "px";
  var rr = node.rectangleCornerRadii;
  if (Array.isArray(rr) && rr.length === 4) {
    var allEqual = rr.every(function (v) {
      return v === rr[0];
    });
    if (allEqual) return rr[0] + "px";
    return rr
      .map(function (v) {
        return v + "px";
      })
      .join(" ");
  }
  return null;
}

function resolveAppearance(node) {
  if (node.type === "TEXT") {
    var t = {};
    var tf = firstVisibleSolid(node.fills);
    if (tf) t.color = figmaColorToCss(tf.color, tf.opacity);
    var st = node.style || {};
    if (typeof st.fontSize === "number") t.size = round3(st.fontSize) + "px";
    if (typeof st.fontWeight === "number") t.weight = st.fontWeight;
    if (typeof st.lineHeightPx === "number")
      t.lineHeight = round3(st.lineHeightPx) + "px";
    if (typeof st.letterSpacing === "number" && st.letterSpacing !== 0)
      t.letterSpacing = round3(st.letterSpacing) + "px";
    return Object.keys(t).length ? { text: t } : null;
  }
  var a = {};
  var fill = firstVisibleSolid(node.fills);
  if (fill) a.background = figmaColorToCss(fill.color, fill.opacity);
  var stroke = firstVisibleSolid(node.strokes);
  if (stroke) {
    var border = { color: figmaColorToCss(stroke.color, stroke.opacity) };
    if (typeof node.strokeWeight === "number")
      border.width = node.strokeWeight + "px";
    a.border = border;
  }
  var radius = cornerRadiusCss(node);
  if (radius) a.radius = radius;
  return Object.keys(a).length ? a : null;
}

function tokenForBound(boundVariables, field, varNameById) {
  var b = boundVariables && boundVariables[field];
  if (b && b.id && varNameById && varNameById[b.id]) return varNameById[b.id];
  return null;
}

function spacingValue(node, field, varNameById) {
  var tok = tokenForBound(node.boundVariables, field, varNameById);
  if (tok) return tok;
  var n = typeof node[field] === "number" ? node[field] : 0;
  return n + "px";
}

function normalizeLayout(node, varNameById) {
  if (node.layoutMode !== "HORIZONTAL" && node.layoutMode !== "VERTICAL")
    return null;
  return {
    axis: AXIS[node.layoutMode],
    gap: spacingValue(node, "itemSpacing", varNameById),
    padding: {
      top: spacingValue(node, "paddingTop", varNameById),
      right: spacingValue(node, "paddingRight", varNameById),
      bottom: spacingValue(node, "paddingBottom", varNameById),
      left: spacingValue(node, "paddingLeft", varNameById),
    },
    align: {
      main: MAIN_ALIGN[node.primaryAxisAlignItems || "MIN"] || "start",
      cross: CROSS_ALIGN[node.counterAxisAlignItems || "MIN"] || "start",
    },
    sizing: {
      h: SIZING[node.layoutSizingHorizontal] || "fixed",
      v: SIZING[node.layoutSizingVertical] || "fixed",
    },
  };
}

function collectTokenRefs(node, varNameById) {
  var refs = [];
  var bv = node.boundVariables || {};
  function add(id) {
    var nm = varNameById && varNameById[id];
    if (nm && refs.indexOf(nm) === -1) refs.push(nm);
  }
  ["fills", "strokes"].forEach(function (k) {
    if (Array.isArray(bv[k]))
      bv[k].forEach(function (e) {
        if (e && e.id) add(e.id);
      });
  });
  [
    "cornerRadius",
    "topLeftRadius",
    "topRightRadius",
    "bottomLeftRadius",
    "bottomRightRadius",
  ].forEach(function (k) {
    if (bv[k] && bv[k].id) add(bv[k].id);
  });
  return refs;
}

function instanceProps(node) {
  var cp = node.componentProperties;
  if (!cp || typeof cp !== "object") return null;
  var props = {};
  Object.keys(cp).forEach(function (k) {
    var clean = k.indexOf("#") >= 0 ? k.slice(0, k.indexOf("#")) : k;
    var v = cp[k];
    if (
      v &&
      (v.type === "VARIANT" || v.type === "BOOLEAN" || v.type === "TEXT")
    )
      props[clean] = v.value;
  });
  return Object.keys(props).length ? props : null;
}

function rawHintFor(node) {
  var hint = { layoutMode: node.layoutMode || "NONE" };
  if (node.absoluteBoundingBox) {
    hint.x = node.absoluteBoundingBox.x;
    hint.y = node.absoluteBoundingBox.y;
  }
  if (node.constraints) hint.constraints = node.constraints;
  return hint;
}

function normalizeNode(node, ctx) {
  ctx.total++;
  var kind = classifyKind(node);
  var refs = collectTokenRefs(node, ctx.varNameById);

  if (kind === "instance") {
    var out = { name: node.name || "", kind: "instance" };
    // Tier 1 — node-id fast path (unchanged).
    var slug = node.componentId && ctx.nodeIdToSlug[node.componentId];
    // Tier 2 — key fallback: componentId -> key -> slug. Bridges remote/library
    // node ids, node-id drift between syncs, and the registry-node vs
    // instance-node mismatch (e.g. icon swap-defaults in a different node space).
    if (!slug && node.componentId && ctx.componentIdToKey) {
      var key = ctx.componentIdToKey[node.componentId];
      if (key && ctx.keyToSlug) slug = ctx.keyToSlug[key];
    }
    if (slug) {
      out.slug = slug;
      ctx.normalized++;
    } else {
      out.unresolved = true;
    }
    var props = instanceProps(node);
    if (props) out.props = props;
    if (refs.length) out.tokenRefs = refs;
    if (typeof node.id === "string" && node.id) out.id = node.id;
    return out; // R1: no recursion
  }

  var n = { name: node.name || "", kind: kind };
  if (refs.length) n.tokenRefs = refs;
  if (typeof node.id === "string" && node.id) n.id = node.id;

  if (kind === "text") {
    n.text = typeof node.characters === "string" ? node.characters : "";
    ctx.normalized++;
    return n;
  }

  if (kind === "container") {
    var layout = normalizeLayout(node, ctx.varNameById);
    // filter null/undefined entries defensively — a malformed child must not throw.
    var children = (Array.isArray(node.children) ? node.children : []).filter(
      Boolean,
    );
    if (layout) {
      n.layout = layout;
      ctx.normalized++;
    } else if (children.length > 0) {
      n.normalizable = false; // R2
      n.rawHint = rawHintFor(node);
      ctx.degraded.push({
        name: node.name || "",
        reason: "layoutMode:" + (node.layoutMode || "NONE"),
      });
    } else {
      ctx.normalized++; // empty leaf container is trivially fine
    }
    if (children.length)
      n.children = children.map(function (c) {
        return normalizeNode(c, ctx);
      });
    return n;
  }

  // vector / other
  ctx.normalized++;
  return n;
}

function buildAnatomyFile(rootNode, opts) {
  opts = opts || {};
  var ctx = {
    nodeIdToSlug: opts.nodeIdToSlug || {},
    componentIdToKey: opts.componentIdToKey || {},
    keyToSlug: opts.keyToSlug || {},
    varNameById: opts.varNameById || {},
    total: 0,
    normalized: 0,
    degraded: [],
  };
  var root = normalizeNode(rootNode, ctx);
  var ratio =
    ctx.total === 0 ? 1 : Math.round((ctx.normalized / ctx.total) * 100) / 100;
  return {
    // Explicit (don't rely on writeJson's auto-injection) — the schema requires it,
    // and consumers/tests should see a complete, valid artifact from the builder.
    _schema_version: 1,
    slug: opts.slug,
    kit: opts.kit || "dskit",
    synced_at: opts.syncedAt,
    source: opts.source || {},
    quality: {
      nodesTotal: ctx.total,
      nodesNormalized: ctx.normalized,
      ratio: ratio,
      degraded: ctx.degraded,
    },
    root: root,
  };
}

module.exports = {
  classifyKind,
  normalizeLayout,
  collectTokenRefs,
  instanceProps,
  normalizeNode,
  buildAnatomyFile,
  figmaColorToCss,
  firstVisibleSolid,
  cornerRadiusCss,
  resolveAppearance,
};
