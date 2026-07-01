"use strict";

// Tailwind arbitrary-value class prefix -> CSS property (only var()-bound classes matter).
const CLASS_PROP = [
  [/\bbg-\[var\(--([^,\)\]]+)/g, () => "background-color"],
  [/\btext-\[color:var\(--([^,\)\]]+)/g, () => "color"],
  [/\bp-\[var\(--([^,\)\]]+)/g, () => "padding"],
  [/\bpx-\[var\(--([^,\)\]]+)/g, () => "padding-inline"],
  [/\bpy-\[var\(--([^,\)\]]+)/g, () => "padding-block"],
  [/\bpt-\[var\(--([^,\)\]]+)/g, () => "padding-top"],
  [/\bgap-\[var\(--([^,\)\]]+)/g, () => "gap"],
  [/\brounded-\[var\(--([^,\)\]]+)/g, () => "border-radius"],
  [/\btext-\[length:var\(--([^,\)\]]+)/g, () => "font-size"],
  [/\bleading-\[var\(--([^,\)\]]+)/g, () => "line-height"],
  [/\btracking-\[var\(--([^,\)\]]+)/g, () => "letter-spacing"],
  [/\bfont-\[family-name:var\(--([^,\)\]]+)/g, () => "font-family"],
  [/\bfont-\[var\(--([^,\)\]]+)/g, () => "font-weight"],
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
  if (varName.indexOf("/") !== -1)
    candidates.push(slug(varName.slice(varName.indexOf("/") + 1)));
  for (const c of candidates)
    if (tokenNameSet.has(c)) return { token: "--zen-" + c, grade: "semantic" };
  return { token: "--zen-" + full, grade: "primitive" };
}

module.exports = {
  parseDesignContext,
  buildTokenNameSet,
  normalizeBinding,
  slug,
};
