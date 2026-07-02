"use strict";

// Tailwind arbitrary-value class prefix -> CSS property (only var()-bound classes matter).
const CLASS_PROP = [
  [/\bbg-\[var\(--([^,\)\]]+)/g, () => "background-color"],
  [/\btext-\[color:var\(--([^,\)\]]+)/g, () => "color"],
  [/\bp-\[var\(--([^,\)\]]+)/g, () => "padding"],
  [/\bpx-\[var\(--([^,\)\]]+)/g, () => "padding-inline"],
  [/\bpy-\[var\(--([^,\)\]]+)/g, () => "padding-block"],
  [/\bpt-\[var\(--([^,\)\]]+)/g, () => "padding-top"],
  [/\bpb-\[var\(--([^,\)\]]+)/g, () => "padding-bottom"],
  [/\bpl-\[var\(--([^,\)\]]+)/g, () => "padding-left"],
  [/\bpr-\[var\(--([^,\)\]]+)/g, () => "padding-right"],
  [/\bgap-\[var\(--([^,\)\]]+)/g, () => "gap"],
  [/\brounded-\[var\(--([^,\)\]]+)/g, () => "border-radius"],
  [/\btext-\[length:var\(--([^,\)\]]+)/g, () => "font-size"],
  [/\bleading-\[var\(--([^,\)\]]+)/g, () => "line-height"],
  [/\btracking-\[var\(--([^,\)\]]+)/g, () => "letter-spacing"],
  [/\bfont-\[family-name:var\(--([^,\)\]]+)/g, () => "font-family"],
  [/\bfont-\[var\(--([^,\)\]]+)/g, () => "font-weight"],
  [/\bborder-\[length:var\(--([^,\)\]]+)/g, () => "border-width"],
  [/\bborder-\[var\(--([^,\)\]]+)/g, () => "border-color"],
  [/\bh-\[var\(--([^,\)\]]+)/g, () => "height"],
  [/\bw-\[var\(--([^,\)\]]+)/g, () => "width"],
  [/\bsize-\[var\(--([^,\)\]]+)/g, () => "height"],
  [/\bsize-\[var\(--([^,\)\]]+)/g, () => "width"],
];

function unescapeName(raw) {
  return raw.replace(/\\+/g, ""); // Strip all backslashes (handles both \/ and \\/)
}

// Parse one class-attribute chunk into [{property, varName}] (deduped by
// property, first match wins), applying unescapeName.
function parseClassEntries(chunk) {
  const seen = new Set();
  const entries = [];
  for (const [rx, prop] of CLASS_PROP) {
    rx.lastIndex = 0;
    let mm;
    while ((mm = rx.exec(chunk))) {
      const p = prop();
      if (seen.has(p)) continue;
      seen.add(p);
      entries.push({ property: p, varName: unescapeName(mm[1]) });
    }
  }
  return entries;
}

// Locate the set root: the element whose className is `{className || `…`}`
// immediately followed by a ternary id over "node-…" strings. Returns
// { classExpr, idExpr } or null (non-set captures, or drifted grammar -> the
// root is skipped and the miss shows in coverage).
function parseSetRoot(text) {
  const m = /className=\{className \|\| `([\s\S]*?)`\}\s+id=\{([^}]*)\}/.exec(
    text,
  );
  if (!m) return null;
  return { classExpr: m[1], idExpr: m[2] };
}

function parseDesignContext(text) {
  const nodes = {};
  // Plain elements carrying data-node-id (own-nodes first pass; instance
  // internals skipped). Unchanged v1 logic, list-shaped output.
  const re = /data-node-id="([^"]+)"/g;
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ id: m[1], idx: m.index });
  for (let i = 0; i < marks.length; i++) {
    const id = marks[i].id;
    if (/^I\d+[:-]\d+;/.test(id)) continue; // instance-internal -> skip (own-nodes only)
    const tagStart = text.lastIndexOf("<", marks[i].idx);
    const entries = parseClassEntries(text.slice(tagStart, marks[i].idx));
    if (entries.length && !(id in nodes)) nodes[id] = entries;
  }

  // Set root (conditional codegen).
  let root = null;
  const variantDefaults = {};
  const sr = parseSetRoot(text);
  if (sr) {
    const meta = parseSetMeta(text);
    const constMap = buildConstMap(text);

    // Root ids from the id ternary ("node-a_b" -> "a:b").
    const idChain = splitTernary(sr.idExpr);
    const ids = [];
    const pushId = (v) => {
      const mm = /^node-(\d+)_(\d+)$/.exec(String(v || "").trim());
      if (mm) ids.push(mm[1] + ":" + mm[2]);
    };
    idChain.branches.forEach((b) => pushId(b.value));
    pushId(idChain.elseValue);

    // Root bindings: template literals -> unscoped; ternary chains -> scoped.
    const bindings = [];
    const referenced = new Set();
    const seen = new Set(); // dedupe by property + scope signature, first wins
    const push = (entry, variant) => {
      const sig =
        entry.property +
        "|" +
        (variant ? variant.prop + "=" + variant.values.join(",") : "");
      if (seen.has(sig)) return;
      seen.add(sig);
      const b = { property: entry.property, varName: entry.varName };
      if (variant) {
        b.variant = variant;
        referenced.add(variant.prop);
      }
      bindings.push(b);
    };

    const { literals, exprs } = splitTemplate(sr.classExpr);
    literals.forEach((lit) =>
      parseClassEntries(lit).forEach((e) => push(e, null)),
    );
    exprs.forEach((expr) => {
      const asLiteral = readStringLiteral(expr);
      if (asLiteral && !asLiteral.rest.trim()) {
        parseClassEntries(asLiteral.value).forEach((e) => push(e, null));
        return;
      }
      const chain = splitTernary(expr);
      if (!chain.branches.length) return; // unrecognized expression: skip
      let prop = null;
      const covered = new Set();
      chain.branches.forEach((br) => {
        const scope = resolveCondition(br.cond, constMap);
        if (!scope) return; // unrecognized condition: skip branch
        prop = prop || scope.prop;
        if (scope.prop !== prop) return; // mixed-prop chain: skip branch
        scope.values.forEach((v) => covered.add(v));
        parseClassEntries(br.value).forEach((e) =>
          push(e, { prop: scope.prop, values: scope.values.slice() }),
        );
      });
      // Else branch = declared values minus covered (needs known meta).
      if (chain.elseValue != null && prop && meta.props[prop]) {
        const remaining = meta.props[prop].values.filter(
          (v) => !covered.has(v),
        );
        if (remaining.length) {
          parseClassEntries(chain.elseValue).forEach((e) =>
            push(e, { prop, values: remaining }),
          );
        }
      }
    });

    if (ids.length && bindings.length) {
      root = { ids, bindings };
      referenced.forEach((p) => {
        if (meta.props[p] && meta.props[p].default != null)
          variantDefaults[p] = meta.props[p].default;
      });
    }
  }

  return { nodes, root, variantDefaults };
}

function slug(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[/\s]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildTokenNameSet(tokensJson) {
  const set = new Set();
  (function walk(o, path) {
    if (!o || typeof o !== "object") return;
    for (const k of Object.keys(o)) {
      if (k[0] === "$" || k[0] === "_") continue;
      const v = o[k];
      if (!v || typeof v !== "object") continue;
      if ("$value" in v) set.add(path.concat(k).join("-"));
      else walk(v, path.concat(k));
    }
  })(tokensJson, []);
  return set;
}

function normalizeBinding(varName, tokenNameSet) {
  const full = slug(varName);
  const candidates = [full];
  const slashIdx = varName.indexOf("/");
  if (slashIdx !== -1) {
    const firstSeg = slug(varName.slice(0, slashIdx));
    const afterFirst = slug(varName.slice(slashIdx + 1));
    // Only accept the drop-first-segment candidate when it is a
    // repeated-prefix form (e.g. "spacing/spacing-sm"), never a blind
    // strip that could collide with a token in a different domain
    // (e.g. "text/size-sm" must not match the unrelated "size-sm" token).
    if (afterFirst === firstSeg || afterFirst.startsWith(firstSeg + "-"))
      candidates.push(afterFirst);
  }
  for (const c of candidates)
    if (tokenNameSet.has(c)) return { token: "--zen-" + c, grade: "semantic" };
  return { token: "--zen-" + full, grade: "primitive" };
}

// Scope rank for the defensive-ordering invariant: under CSS last-wins a
// variant-UNAWARE consumer must resolve exactly the default variant, so
// same-property bindings order: non-default-scoped (0), unscoped (1),
// default-variant-scoped LAST (2).
function scopeRank(binding, defaults) {
  if (!binding.variant) return 1;
  const def = defaults[binding.variant.prop];
  return def != null && binding.variant.values.indexOf(def) !== -1 ? 2 : 0;
}

function buildSidecar(
  slugName,
  nodes,
  tokenNameSet,
  harvestedAt,
  variantDefaults,
) {
  const defaults = variantDefaults || {};
  const byNodeId = {};
  for (const nodeId of Object.keys(nodes).sort()) {
    const bindings = nodes[nodeId].map((e) => {
      const { token, grade } = normalizeBinding(e.varName, tokenNameSet);
      const b = { property: e.property, token, grade };
      if (e.variant)
        b.variant = { prop: e.variant.prop, values: e.variant.values.slice() };
      return b;
    });
    bindings.sort(
      (a, b) =>
        a.property.localeCompare(b.property) ||
        scopeRank(a, defaults) - scopeRank(b, defaults) ||
        a.token.localeCompare(b.token) ||
        ((a.variant && a.variant.values.join(",")) || "").localeCompare(
          (b.variant && b.variant.values.join(",")) || "",
        ),
    );
    byNodeId[nodeId] = bindings;
  }
  const doc = {
    _schema_version: 1,
    slug: slugName,
    _meta: {
      auto_generated: true,
      source: "figma-mcp:get_design_context",
      harvested_at: harvestedAt,
      do_not_edit: true,
    },
    byNodeId,
  };
  if (Object.keys(defaults).length) doc.variantDefaults = defaults;
  return doc;
}

function bindingGradeStats(sidecars) {
  const stats = {};
  for (const [slugName, doc] of Object.entries(sidecars)) {
    let semantic = 0;
    let primitive = 0;
    let scoped = 0;
    let total = 0;
    for (const bindings of Object.values(doc.byNodeId)) {
      for (const binding of bindings) {
        total++;
        if (binding.grade === "semantic") semantic++;
        else if (binding.grade === "primitive") primitive++;
        if (binding.variant) scoped++;
      }
    }
    stats[slugName] = { semantic, primitive, scoped, total };
  }
  return stats;
}

function renderCoverage(stats) {
  const slugs = Object.keys(stats).sort();
  let md = "# Token-binding coverage\n\n";
  md +=
    "> AUTO-GENERATED — DO NOT EDIT. Source: scripts/components/harvest-token-bindings.js\n\n";
  md += "| Component | Semantic | Primitive | Scoped | Total |\n";
  md += "|-----------|----------|-----------|--------|-------|\n";
  for (const slugName of slugs) {
    const { semantic, primitive, scoped, total } = stats[slugName];
    md += `| ${slugName} | ${semantic}/${total} | ${primitive} | ${scoped} | ${total} |\n`;
  }
  md += "\n";
  return md;
}

// ── Set-shape helpers (variant-prop component sets) ─────────────────────────
// A component SET emits ONE conditional codegen: variant metadata lives in the
// Props type union + destructure defaults, and per-variant facts live in
// ternary/includes() conditionals. All helpers are pure text parsers with the
// same doctrine as CLASS_PROP: an unrecognized shape yields null/skip, never
// a guessed binding.

// Declared variant values (from the Props type union) + default (from the
// exported function's destructure). Only quoted unions register: `className?:
// string` and single-value props don't (single-value sets emit no conditionals).
function parseSetMeta(text) {
  const props = {};
  const unionRe = /(\w+)\?:\s*("[^"]*"(?:\s*\|\s*"[^"]*")+)/g;
  let m;
  while ((m = unionRe.exec(text))) {
    const values = (m[2].match(/"([^"]*)"/g) || []).map((s) => s.slice(1, -1));
    props[m[1]] = { values, default: null };
  }
  const sig = /function\s+\w+\(\{([^}]*)\}/.exec(text);
  if (sig) {
    const defRe = /(\w+)\s*=\s*"([^"]*)"/g;
    while ((m = defRe.exec(sig[1]))) {
      if (props[m[1]]) props[m[1]].default = m[2];
    }
  }
  return { props };
}

// `const isFail = status === "Fail";` declarations -> condition name map.
function buildConstMap(text) {
  const map = {};
  const re = /const\s+(is\w+)\s*=\s*(\w+)\s*===\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(text))) map[m[1]] = { prop: m[2], values: [m[3]] };
  return map;
}

// Resolve a ternary condition to a single-prop variant scope, or null.
// Recognized: an isX const name, or `["A","B"].includes(prop)`.
function resolveCondition(cond, constMap) {
  const c = String(cond || "").trim();
  if (constMap[c])
    return { prop: constMap[c].prop, values: constMap[c].values.slice() };
  const inc = /^\[((?:\s*"[^"]*"\s*,?)+)\]\.includes\((\w+)\)$/.exec(c);
  if (inc) {
    const values = (inc[1].match(/"([^"]*)"/g) || []).map((s) =>
      s.slice(1, -1),
    );
    return { prop: inc[2], values };
  }
  return null;
}

// Read a leading string literal ("…" or String.raw`…`) off `s`.
// Returns { value, rest } or null when `s` doesn't start with one.
function readStringLiteral(s) {
  s = s.trim();
  const raw = /^String\.raw`/.exec(s);
  if (raw) {
    const end = s.indexOf("`", raw[0].length);
    if (end === -1) return null;
    return { value: s.slice(raw[0].length, end), rest: s.slice(end + 1) };
  }
  if (s[0] === '"') {
    const end = s.indexOf('"', 1);
    if (end === -1) return null;
    return { value: s.slice(1, end), rest: s.slice(end + 1) };
  }
  return null;
}

// Find the first '?' outside quoted/backticked spans.
function indexOfTopLevelQuestion(s) {
  let inTick = false;
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inTick) {
      if (ch === "`") inTick = false;
    } else if (inQuote) {
      if (ch === '"') inQuote = false;
    } else if (ch === "`") inTick = true;
    else if (ch === '"') inQuote = true;
    else if (ch === "?") return i;
  }
  return -1;
}

// `cond ? "A" : cond2 ? \`B\` : "C"` -> { branches: [{cond,value}], elseValue }.
// elseValue is null when the trailing expression isn't a recognized literal
// (caller skips the else branch; never mis-emit).
function splitTernary(expr) {
  const branches = [];
  let s = String(expr || "").trim();
  for (;;) {
    const q = indexOfTopLevelQuestion(s);
    if (q === -1) {
      const lit = readStringLiteral(s);
      return { branches, elseValue: lit ? lit.value : null };
    }
    const cond = s.slice(0, q).trim();
    const lit = readStringLiteral(s.slice(q + 1));
    if (!lit) return { branches, elseValue: null }; // unrecognized value form
    branches.push({ cond, value: lit.value });
    s = lit.rest.replace(/^\s*:\s*/, "");
  }
}

// Split a template-literal BODY into raw literal segments and ${…} expression
// bodies. Brace-depth aware; quotes/backticks inside ${…} are respected.
function splitTemplate(tpl) {
  const literals = [];
  const exprs = [];
  let cur = "";
  const s = String(tpl || "");
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "$" && s[i + 1] === "{") {
      literals.push(cur);
      cur = "";
      let depth = 1;
      let j = i + 2;
      const start = j;
      let inTick = false;
      let inQuote = false;
      for (; j < s.length && depth > 0; j++) {
        const ch = s[j];
        if (inTick) {
          if (ch === "`") inTick = false;
        } else if (inQuote) {
          if (ch === '"') inQuote = false;
        } else if (ch === "`") inTick = true;
        else if (ch === '"') inQuote = true;
        else if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      exprs.push(s.slice(start, j - 1));
      i = j - 1;
    } else {
      cur += s[i];
    }
  }
  literals.push(cur);
  return { literals, exprs };
}

module.exports = {
  parseDesignContext,
  parseSetRoot,
  buildTokenNameSet,
  normalizeBinding,
  slug,
  buildSidecar,
  bindingGradeStats,
  renderCoverage,
  parseSetMeta,
  buildConstMap,
  resolveCondition,
  splitTernary,
  splitTemplate,
};
