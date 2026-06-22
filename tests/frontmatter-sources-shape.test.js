"use strict";

// Permanent source-shape guard — the durable replacement for the temporary
// old-vs-new equivalence harness that proved the categories-parser → yaml-lib
// swap byte-identical.
//
// The new strict-YAML parser (scripts/lib/frontmatter) does NOT tolerate the
// old parser's unquoted-comma-in-flow-map prose. An unquoted comma now SILENTLY
// mis-parses into phantom keys, e.g.
//   description: receives focus, hover, press
//     → { description: "receives focus", hover: null, press: null }
// Two of the four derive paths (foundations, graph) have NO post-parse schema
// validation, so such a mistake would flow straight into dist. This guard runs
// in `npm test` (the hard PR gate) and fails loudly on the phantom-key
// signature (a null-valued key) across every real source the derives parse.
// Authoring rule: quote any flow value containing `, : ; #` (see the AUTHORING
// quoting rule).

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const fm = require("../scripts/lib/frontmatter");
const ROOT = path.resolve(__dirname, "..");

function walk(dir, pred, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, pred, out);
    else if (pred(p, e.name)) out.push(p);
  }
  return out;
}

// Collect every key path whose value is null (the unquoted-comma phantom-key
// signature). No real source legitimately authors a null frontmatter value.
function nullKeyPaths(obj, trail, out) {
  if (obj && typeof obj === "object") {
    if (Array.isArray(obj)) {
      obj.forEach((v, i) => nullKeyPaths(v, `${trail}[${i}]`, out));
    } else {
      for (const k of Object.keys(obj)) {
        const here = trail ? `${trail}.${k}` : k;
        if (obj[k] === null) out.push(here);
        else nullKeyPaths(obj[k], here, out);
      }
    }
  }
  return out;
}

// Fenced .md sources (categories + content + foundations) parsed via parse().
const fencedMd = [
  ...walk(
    path.join(ROOT, "components/src/categories"),
    (_p, n) => n.endsWith(".md") && n !== "AUTHORING.md",
  ),
  ...walk(
    path.join(ROOT, "content/src"),
    (_p, n) => n.endsWith(".md") && n !== "AUTHORING.md",
  ),
  ...walk(
    path.join(ROOT, "foundations/src"),
    (_p, n) => n.endsWith(".md") && n !== "AUTHORING.md",
  ),
].filter((p) => fs.readFileSync(p, "utf8").startsWith("---"));

// Fence-less .yml sources (guidelines) parsed via parseFrontmatter(text, 0).
const ymls = walk(
  path.join(ROOT, "components/src"),
  (_p, n) => n === "_meta.yml" || n === "tokens.yml",
);

test("every fenced .md source parses with no phantom (null-valued) keys", () => {
  assert.ok(fencedMd.length > 0, "expected at least one fenced source");
  for (const p of fencedMd) {
    const data = fm.parse(fs.readFileSync(p, "utf8")).data;
    const nulls = nullKeyPaths(data, "", []);
    assert.deepEqual(
      nulls,
      [],
      `${path.relative(ROOT, p)} → null-valued key(s) ${JSON.stringify(nulls)} — likely an unquoted comma in a flow-map value; quote it (see AUTHORING quoting rule)`,
    );
  }
});

test("every .yml source parses with no phantom (null-valued) keys", () => {
  assert.ok(ymls.length > 0, "expected at least one .yml source");
  for (const p of ymls) {
    const data = fm.parseFrontmatter(fs.readFileSync(p, "utf8"), 0);
    const nulls = nullKeyPaths(data, "", []);
    assert.deepEqual(
      nulls,
      [],
      `${path.relative(ROOT, p)} → null-valued key(s) ${JSON.stringify(nulls)} — likely an unquoted comma in a flow-map value; quote it (see AUTHORING quoting rule)`,
    );
  }
});
