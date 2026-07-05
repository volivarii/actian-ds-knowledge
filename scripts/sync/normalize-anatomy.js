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
  var a = clamp01(
    (typeof color.a === "number" ? color.a : 1) *
      (typeof opacity === "number" ? opacity : 1),
  );
  var r = clamp01(typeof color.r === "number" ? color.r : 0) * 255;
  var g = clamp01(typeof color.g === "number" ? color.g : 0) * 255;
  var b = clamp01(typeof color.b === "number" ? color.b : 0) * 255;
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

// Figma paint arrays are ordered back-to-front (index 0 = bottom-most,
// last = top-most / actually rendered). Return the top-most visible paint
// (any type). A visible non-SOLID paint occludes any SOLID paint beneath it,
// so callers must key off THIS (not a same-type-only scan) to avoid emitting
// a color that Figma would not actually render.
function topVisiblePaint(paints) {
  if (!Array.isArray(paints)) return null;
  for (var i = paints.length - 1; i >= 0; i--) {
    var p = paints[i];
    if (p && p.visible !== false) return p;
  }
  return null;
}

// Thin wrapper over topVisiblePaint kept for its exported name and existing
// callers/tests: returns the top-most visible paint only if it is a SOLID.
// Unlike a same-type-only scan, this does NOT skip past a visible non-SOLID
// paint to find a SOLID underneath it (that solid would be occluded).
function topVisibleSolid(paints) {
  var p = topVisiblePaint(paints);
  return p && p.type === "SOLID" && p.color ? p : null;
}

function cornerCss(values) {
  var allEqual = values.every(function (v) {
    return v === values[0];
  });
  if (allEqual) return round3(values[0]) + "px";
  return values
    .map(function (v) {
      return round3(v) + "px";
    })
    .join(" ");
}

function cornerRadiusCss(node) {
  if (typeof node.cornerRadius === "number")
    return round3(node.cornerRadius) + "px";
  // Per-corner scalar fields (topLeftRadius etc.) are Plugin-API-only and are
  // dead on the Figma REST API (this pipeline's actual source); they are kept
  // as a harmless guarded fallback for callers that pass Plugin-API-shaped
  // nodes directly. Per-corner radius on non-RECTANGLE nodes is a known REST
  // capture gap, rescued only for RECTANGLE nodes via rectangleCornerRadii below.
  var perCorner = [
    node.topLeftRadius,
    node.topRightRadius,
    node.bottomRightRadius,
    node.bottomLeftRadius,
  ];
  if (
    perCorner.some(function (v) {
      return typeof v === "number";
    })
  ) {
    return cornerCss(
      perCorner.map(function (v) {
        return typeof v === "number" ? v : 0;
      }),
    );
  }
  // rectangleCornerRadii (RECTANGLE nodes): same [TL, TR, BR, BL] order.
  var rr = node.rectangleCornerRadii;
  if (Array.isArray(rr) && rr.length === 4) return cornerCss(rr);
  return null;
}

// Uniform per-side stroke weight when the scalar strokeWeight is absent. The
// Figma REST API exposes per-side stroke weights only as
// node.individualStrokeWeights = { top, right, bottom, left } (there is no
// REST equivalent of the Plugin API's strokeTopWeight/strokeRightWeight/
// strokeBottomWeight/strokeLeftWeight fields). Returns the shared value only
// when all four sides agree; mixed per-side widths are a follow-on (returns
// null -> width omitted).
function uniformSideWeight(node) {
  var isw = node.individualStrokeWeights;
  if (!isw || typeof isw !== "object") return null;
  var sides = [isw.top, isw.right, isw.bottom, isw.left];
  if (
    sides.some(function (s) {
      return typeof s !== "number";
    })
  )
    return null;
  return sides.every(function (s) {
    return s === sides[0];
  })
    ? sides[0]
    : null;
}

function resolveAppearance(node, ctx) {
  // Node-level opacity dims the node's own paints; fold it into each paint's alpha.
  var nodeOpacity = typeof node.opacity === "number" ? node.opacity : 1;
  function paintAlpha(p) {
    return (typeof p.opacity === "number" ? p.opacity : 1) * nodeOpacity;
  }
  if (node.type === "TEXT") {
    var t = {};
    var tf = topVisiblePaint(node.fills);
    if (tf && tf.type === "SOLID" && tf.color)
      t.color = figmaColorToCss(tf.color, paintAlpha(tf));
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
  // Key off the TOP visible paint of ANY type, not a same-type-only scan: a
  // visible non-SOLID paint occludes any SOLID paint beneath it, so scanning
  // past it for a SOLID would emit a color Figma never actually renders.
  var fill = topVisiblePaint(node.fills);
  if (fill && fill.type === "SOLID" && fill.color) {
    a.background = figmaColorToCss(fill.color, paintAlpha(fill));
  } else if (fill && fill.type === "SOLID" && ctx && ctx.degraded) {
    // SOLID paint present but missing .color -- malformed, not "non-solid";
    // keep the reason distinct so it does not read as self-contradictory.
    ctx.degraded.push({
      name: node.name || "",
      reason: "malformed-fill:SOLID",
    });
  } else if (fill && ctx && ctx.degraded) {
    ctx.degraded.push({
      name: node.name || "",
      reason: "non-solid-fill:" + fill.type,
    });
  }
  var stroke = topVisiblePaint(node.strokes);
  if (stroke && stroke.type === "SOLID" && stroke.color) {
    var border = { color: figmaColorToCss(stroke.color, paintAlpha(stroke)) };
    var w =
      typeof node.strokeWeight === "number"
        ? node.strokeWeight
        : uniformSideWeight(node);
    if (typeof w === "number") border.width = round3(w) + "px";
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
  return round3(n) + "px";
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
  var appearance = resolveAppearance(node, ctx);

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
    if (appearance) out.appearance = appearance;
    return out; // R1: no recursion
  }

  var n = { name: node.name || "", kind: kind };
  if (refs.length) n.tokenRefs = refs;
  if (typeof node.id === "string" && node.id) n.id = node.id;
  if (appearance) n.appearance = appearance;

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

function parseVariantName(name) {
  if (typeof name !== "string" || name.indexOf("=") === -1) return null;
  var props = {};
  var ok = false;
  name.split(",").forEach(function (seg) {
    var eq = seg.indexOf("=");
    if (eq === -1) return;
    var key = seg.slice(0, eq).trim();
    if (!key) return;
    props[key] = seg.slice(eq + 1).trim(); // value verbatim (may itself contain '=')
    ok = true;
  });
  return ok ? props : null;
}

function nodeAtPath(root, path) {
  var n = root;
  for (var i = 0; i < path.length; i++) {
    if (!n || !Array.isArray(n.children)) return null;
    n = n.children[path[i]];
  }
  return n || null;
}

function attachVariantDeltas(root, allDeltas) {
  // allDeltas: [{ path:number[], prop, value, appearance }]
  var groups = {};
  allDeltas.forEach(function (d) {
    var key =
      d.path.join(".") + "|" + d.prop + "|" + JSON.stringify(d.appearance);
    if (!groups[key])
      groups[key] = {
        path: d.path,
        prop: d.prop,
        appearance: d.appearance,
        values: [],
      };
    if (groups[key].values.indexOf(d.value) === -1)
      groups[key].values.push(d.value);
  });
  Object.keys(groups).forEach(function (key) {
    var g = groups[key];
    var node = nodeAtPath(root, g.path);
    if (!node) return;
    if (!node.appearance) node.appearance = {};
    if (!node.appearance.variants) node.appearance.variants = [];
    var entry = { prop: g.prop, values: g.values.slice().sort() };
    Object.keys(g.appearance).forEach(function (k) {
      entry[k] = g.appearance[k];
    });
    node.appearance.variants.push(entry);
  });
  sortVariants(root);
}

// Total-order 3-way compare on the JSON.stringify form of two plain-object
// entries: -1 / 0 / 1, with 0 on equal (byte-identical) entries. A comparator
// that returns 1 on ties (rather than 0) is not a valid total order and can
// yield inconsistent results across sort implementations; this is the single
// shared implementation used by both sortVariants and sortByJson below.
function jsonCompare(a, b) {
  var as = JSON.stringify(a);
  var bs = JSON.stringify(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

function sortVariants(node) {
  if (node && node.appearance && Array.isArray(node.appearance.variants))
    node.appearance.variants.sort(jsonCompare);
  if (node && Array.isArray(node.children)) node.children.forEach(sortVariants);
}

// Sort a flat array of plain-object entries by their JSON.stringify form (the
// same stable key sortVariants uses). Keeps quality.structuralVariants and
// quality.uncapturedValues byte-stable regardless of Figma's COMPONENT_SET
// child order (dist must not churn on cosmetic Figma-side reordering).
function sortByJson(entries) {
  return entries.slice().sort(jsonCompare);
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

  var variantExtras = {};
  var variantDefaults = opts.defaultVariantName
    ? parseVariantName(opts.defaultVariantName)
    : null;
  if (variantDefaults && Array.isArray(opts.variants) && opts.variants.length) {
    // Finding M5: a variant COMPONENT child whose name does not parse (no
    // "key=value" segments) used to be dropped silently here. Record it
    // instead so its existence is visible in quality.uncapturedValues.
    var unparseable = [];
    var parsed = opts.variants
      .map(function (vn) {
        return { node: vn, props: parseVariantName(vn.name) || {} };
      })
      .filter(function (pv) {
        if (Object.keys(pv.props).length) return true;
        var rawName =
          pv.node && typeof pv.node.name === "string" && pv.node.name
            ? pv.node.name
            : "(unnamed)";
        unparseable.push({
          prop: "(unparseable)",
          value: rawName,
          reason: "unparseable variant name",
        });
        return false;
      });
    var sel = selectIsolatedVariants(parsed, variantDefaults);
    var allDeltas = [];
    var structural = [];
    sel.isolated.forEach(function (iso) {
      var vctx = {
        nodeIdToSlug: ctx.nodeIdToSlug,
        componentIdToKey: ctx.componentIdToKey,
        keyToSlug: ctx.keyToSlug,
        varNameById: ctx.varNameById,
        total: 0,
        normalized: 0,
        degraded: [],
      };
      var vroot = normalizeNode(iso.node, vctx);
      var a = { deltas: [], structural: [] };
      collectDeltas(root, vroot, [], a);
      a.deltas.forEach(function (dd) {
        allDeltas.push({
          path: dd.path,
          prop: iso.prop,
          value: iso.value,
          appearance: dd.appearance,
        });
      });
      a.structural.forEach(function (s) {
        structural.push({
          prop: iso.prop,
          value: iso.value,
          path: s.path.join("."),
          reason: s.reason,
        });
      });
      // Finding D4: an isolated variant's own vctx.degraded was discarded here,
      // so a gradient/unnormalizable node appearing ONLY in a non-default
      // variant was invisible in quality.degraded. Fold it into the file's
      // ctx.degraded (default-tree entries stay untouched), tagging each entry
      // with its variant scope so it is distinguishable and cannot collide with
      // a default-tree entry of the same name. ctx.total/ctx.normalized (and
      // thus quality.ratio) intentionally stay default-tree-only -- vctx.total/
      // vctx.normalized are NOT folded in.
      vctx.degraded.forEach(function (dd) {
        ctx.degraded.push({
          name: dd.name,
          reason: dd.reason + " (variant " + iso.prop + "=" + iso.value + ")",
        });
      });
    });
    attachVariantDeltas(root, allDeltas);
    variantExtras.variantDefaults = variantDefaults;
    if (structural.length)
      variantExtras.structuralVariants = sortByJson(structural);
    var uncapturedValues = sel.uncaptured.concat(unparseable);
    if (uncapturedValues.length)
      variantExtras.uncapturedValues = sortByJson(uncapturedValues);
  }

  var file = {
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
  if (variantExtras.variantDefaults)
    file.variantDefaults = variantExtras.variantDefaults;
  if (variantExtras.structuralVariants)
    file.quality.structuralVariants = variantExtras.structuralVariants;
  if (variantExtras.uncapturedValues)
    file.quality.uncapturedValues = variantExtras.uncapturedValues;
  return file;
}

function diffAppearance(base, variant) {
  base = base || {};
  variant = variant || {};
  var diff = {};
  ["background", "radius", "border", "text"].forEach(function (k) {
    var bv = base[k],
      vv = variant[k];
    // Both bv and vv are resolveAppearance output, whose keys are always
    // inserted in the same fixed order, so JSON.stringify is a valid,
    // order-stable deep-equal check here (not a general-purpose one).
    var sameJson =
      JSON.stringify(bv === undefined ? null : bv) ===
      JSON.stringify(vv === undefined ? null : vv);
    if (sameJson) return;
    diff[k] = vv === undefined ? null : vv; // null = removed relative to base
  });
  return Object.keys(diff).length ? diff : null;
}

function collectDeltas(cNode, vNode, path, acc) {
  if (!cNode || !vNode) return;
  if (cNode.kind !== vNode.kind) {
    acc.structural.push({
      path: path.slice(),
      reason: "kind:" + cNode.kind + "!=" + vNode.kind,
    });
    return;
  }
  var d = diffAppearance(cNode.appearance, vNode.appearance);
  // Instance nodes are R1 leaves whose rendered content IS the referenced
  // component; a variant that points the instance at a different component
  // (e.g. tag-status swapping the per-status icon) is a content delta, not a
  // paint delta. Capture it as a slug swap so consumers can render the right
  // glyph per variant. Only a RESOLVED variant slug is captured: an
  // unresolved variant instance is a lookup miss, and emitting a removal for
  // it would make consumers drop the default glyph on good data.
  if (cNode.kind === "instance" && vNode.slug && vNode.slug !== cNode.slug) {
    d = d || {};
    d.slug = vNode.slug;
  }
  if (d) acc.deltas.push({ path: path.slice(), appearance: d });
  var cc = Array.isArray(cNode.children) ? cNode.children : [];
  var vc = Array.isArray(vNode.children) ? vNode.children : [];
  if (cc.length !== vc.length) {
    if (cc.length || vc.length)
      acc.structural.push({
        path: path.slice(),
        reason: "childCount:" + cc.length + "!=" + vc.length,
      });
    return; // indices no longer correspond -> stop, own delta already kept
  }
  // Children are paired by INDEX (kind-gated by the check above), not by name
  // or identity. This means a same-kind sibling REORDER within a variant
  // (identical child count, identical kind sequence, but the children
  // shuffled relative to the default tree) is an uncaught limitation: index i
  // in the default is diffed against index i in the variant even though they
  // may no longer be "the same" node, which can misattribute a delta to the
  // wrong sibling instead of flagging a divergence. A name-keyed LCS-style
  // salvage (align by structural identity, not raw index) is the tracked
  // follow-on for this case.
  for (var i = 0; i < cc.length; i++)
    collectDeltas(cc[i], vc[i], path.concat(i), acc);
}

function selectIsolatedVariants(parsed, variantDefaults) {
  var isolated = [];
  var uncaptured = [];
  var axes = Object.keys(variantDefaults);
  axes.forEach(function (axis) {
    var seen = {};
    parsed.forEach(function (pv) {
      var val = pv.props[axis];
      if (val === undefined || val === variantDefaults[axis] || seen[val])
        return;
      seen[val] = true;
      var match = parsed.find(function (cand) {
        if (cand.props[axis] !== val) return false;
        return axes.every(function (a) {
          return a === axis || cand.props[a] === variantDefaults[a];
        });
      });
      if (match) isolated.push({ prop: axis, value: val, node: match.node });
      else
        uncaptured.push({
          prop: axis,
          value: val,
          reason: "no isolated variant",
        });
    });
  });
  return { isolated: isolated, uncaptured: uncaptured };
}

module.exports = {
  classifyKind,
  normalizeLayout,
  collectTokenRefs,
  instanceProps,
  normalizeNode,
  buildAnatomyFile,
  parseVariantName,
  figmaColorToCss,
  topVisibleSolid,
  cornerRadiusCss,
  resolveAppearance,
  diffAppearance,
  collectDeltas,
  selectIsolatedVariants,
  __spacingValue: spacingValue,
};
