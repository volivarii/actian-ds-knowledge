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

function parseDesignContext(text) {
  const out = {};
  // Split into element chunks by data-node-id occurrences.
  const re = /data-node-id="([^"]+)"/g;
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ id: m[1], idx: m.index });
  for (let i = 0; i < marks.length; i++) {
    const id = marks[i].id;
    if (/^I\d+[:-]\d+;/.test(id)) continue; // instance-internal -> skip (own-nodes only)
    // The class attribute for this element precedes its data-node-id within the same tag.
    const tagStart = text.lastIndexOf("<", marks[i].idx);
    const chunk = text.slice(tagStart, marks[i].idx);
    const props = {};
    for (const [rx, prop] of CLASS_PROP) {
      rx.lastIndex = 0;
      let mm;
      while ((mm = rx.exec(chunk))) {
        const p = prop();
        if (!(p in props)) props[p] = unescapeName(mm[1]);
      }
    }
    if (Object.keys(props).length) out[id] = props;
  }
  return out;
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

function buildSidecar(slug, parsedByNode, tokenNameSet, harvestedAt) {
  const byNodeId = {};

  // Sort node IDs for determinism
  const nodeIds = Object.keys(parsedByNode).sort();

  for (const nodeId of nodeIds) {
    const props = parsedByNode[nodeId];
    const bindings = [];

    // Collect all bindings for this node
    const propEntries = Object.entries(props);

    // Sort by property name for determinism
    propEntries.sort((a, b) => a[0].localeCompare(b[0]));

    for (const [property, varName] of propEntries) {
      const { token, grade } = normalizeBinding(varName, tokenNameSet);
      bindings.push({ property, token, grade });
    }

    byNodeId[nodeId] = bindings;
  }

  return {
    _schema_version: 1,
    slug,
    _meta: {
      auto_generated: true,
      source: "figma-mcp:get_design_context",
      harvested_at: harvestedAt,
      do_not_edit: true,
    },
    byNodeId,
  };
}

function bindingGradeStats(sidecars) {
  const stats = {};

  for (const [slug, doc] of Object.entries(sidecars)) {
    let semantic = 0;
    let primitive = 0;
    let total = 0;

    for (const bindings of Object.values(doc.byNodeId)) {
      for (const binding of bindings) {
        total++;
        if (binding.grade === "semantic") {
          semantic++;
        } else if (binding.grade === "primitive") {
          primitive++;
        }
      }
    }

    stats[slug] = { semantic, primitive, total };
  }

  return stats;
}

function renderCoverage(stats) {
  const slugs = Object.keys(stats).sort();

  let md = "# Token-binding coverage\n\n";
  md +=
    "> AUTO-GENERATED — DO NOT EDIT. Source: scripts/components/harvest-token-bindings.js\n\n";
  md += "| Component | Semantic | Primitive | Total |\n";
  md += "|-----------|----------|-----------|-------|\n";

  for (const slug of slugs) {
    const { semantic, primitive, total } = stats[slug];
    md += `| ${slug} | ${semantic}/${total} | ${primitive} | ${total} |\n`;
  }

  md += "\n";

  return md;
}

module.exports = {
  parseDesignContext,
  buildTokenNameSet,
  normalizeBinding,
  slug,
  buildSidecar,
  bindingGradeStats,
  renderCoverage,
};
