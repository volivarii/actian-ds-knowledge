// scripts/sync/normalize-anatomy.js
"use strict";

var VECTOR_TYPES = ["VECTOR", "BOOLEAN_OPERATION", "LINE", "ELLIPSE", "STAR", "POLYGON", "RECTANGLE"];

function classifyKind(node) {
  var t = node.type;
  if (t === "INSTANCE") return "instance";
  if (t === "TEXT") return "text";
  if (VECTOR_TYPES.indexOf(t) >= 0) return "vector";
  return "container"; // FRAME / COMPONENT / COMPONENT_SET / GROUP
}

var AXIS = { HORIZONTAL: "row", VERTICAL: "column" };
var MAIN_ALIGN = { MIN: "start", CENTER: "center", MAX: "end", SPACE_BETWEEN: "space-between" };
var CROSS_ALIGN = { MIN: "start", CENTER: "center", MAX: "end", BASELINE: "baseline" };
var SIZING = { FIXED: "fixed", HUG: "hug", FILL: "fill" };

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
  if (node.layoutMode !== "HORIZONTAL" && node.layoutMode !== "VERTICAL") return null;
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
    if (Array.isArray(bv[k])) bv[k].forEach(function (e) { if (e && e.id) add(e.id); });
  });
  ["cornerRadius", "topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"].forEach(function (k) {
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
    if (v && (v.type === "VARIANT" || v.type === "BOOLEAN" || v.type === "TEXT")) props[clean] = v.value;
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
    var slug = node.componentId && ctx.nodeIdToSlug[node.componentId];
    if (slug) { out.slug = slug; ctx.normalized++; }
    else { out.unresolved = true; }
    var props = instanceProps(node);
    if (props) out.props = props;
    if (refs.length) out.tokenRefs = refs;
    return out; // R1: no recursion
  }

  var n = { name: node.name || "", kind: kind };
  if (refs.length) n.tokenRefs = refs;

  if (kind === "text") {
    n.text = typeof node.characters === "string" ? node.characters : "";
    ctx.normalized++;
    return n;
  }

  if (kind === "container") {
    var layout = normalizeLayout(node, ctx.varNameById);
    var children = Array.isArray(node.children) ? node.children : [];
    if (layout) {
      n.layout = layout;
      ctx.normalized++;
    } else if (children.length > 0) {
      n.normalizable = false; // R2
      n.rawHint = rawHintFor(node);
      ctx.degraded.push({ name: node.name || "", reason: "layoutMode:" + (node.layoutMode || "NONE") });
    } else {
      ctx.normalized++; // empty leaf container is trivially fine
    }
    if (children.length) n.children = children.map(function (c) { return normalizeNode(c, ctx); });
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
    varNameById: opts.varNameById || {},
    total: 0, normalized: 0, degraded: [],
  };
  var root = normalizeNode(rootNode, ctx);
  var ratio = ctx.total === 0 ? 1 : Math.round((ctx.normalized / ctx.total) * 100) / 100;
  return {
    slug: opts.slug,
    kit: opts.kit || "dskit",
    synced_at: opts.syncedAt,
    source: opts.source || {},
    quality: { nodesTotal: ctx.total, nodesNormalized: ctx.normalized, ratio: ratio, degraded: ctx.degraded },
    root: root,
  };
}

module.exports = { classifyKind, normalizeLayout, collectTokenRefs, instanceProps, normalizeNode, buildAnatomyFile };
