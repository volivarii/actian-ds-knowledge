"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "accessibility", "dist");

function loadDist() {
  const files = {};
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json") && e.name !== "a11y-index.json") {
        const j = JSON.parse(fs.readFileSync(p, "utf8"));
        if (j && typeof j.id === "string") files[j.id] = j;
      }
    }
  })(DIST);
  return files;
}

test("every a11y-index slug is addressable in the per-section dist (T5)", () => {
  const index = JSON.parse(
    fs.readFileSync(path.join(DIST, "a11y-index.json"), "utf8"),
  );
  const dist = loadDist();
  const deepestAnchor = (node) => {
    const a = node.anchors || {};
    const keys = Object.keys(a).sort(); // h2 < h3 < h4
    return keys.length ? a[keys[keys.length - 1]] : node.id;
  };
  const addressable = new Set(
    Object.values(dist).flatMap((n) => [n.id, deepestAnchor(n)]),
  );
  for (const s of index.sections) {
    assert.ok(
      addressable.has(s.slug),
      `index slug not addressable in dist: ${s.slug}`,
    );
  }
});

test("per-section dist validates against schemas/section.json", () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(ROOT, "schemas", "section.json"), "utf8"),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  for (const [id, node] of Object.entries(loadDist())) {
    assert.ok(validate(node), `${id}: ${JSON.stringify(validate.errors)}`);
  }
});

test("wcag on every section matches the index harvest for its slug", () => {
  const index = JSON.parse(
    fs.readFileSync(path.join(DIST, "a11y-index.json"), "utf8"),
  );
  const dist = loadDist();
  const idxBySlug = Object.fromEntries(index.sections.map((s) => [s.slug, s]));
  const deepestAnchor = (node) => {
    const a = node.anchors || {};
    const keys = Object.keys(a).sort(); // h2 < h3 < h4
    return keys.length ? a[keys[keys.length - 1]] : node.id;
  };

  // For EVERY per-section dist node carrying a `wcag` key, its (sorted) wcag
  // array must equal the index harvest for that node's deepest-anchor slug.
  // This locks the no-drift contract across the whole tree (not just
  // color-contrast). Subsumes the original color-contrast spot-check.
  let checked = 0;
  let sawColorContrast = false;
  for (const node of Object.values(dist)) {
    if (!("wcag" in node)) continue;
    const slug = deepestAnchor(node);
    const idxEntry = idxBySlug[slug];
    assert.ok(
      idxEntry,
      `dist node ${node.id} carries wcag but slug '${slug}' is absent from a11y-index`,
    );
    assert.deepEqual(
      [...(node.wcag || [])].sort(),
      [...(idxEntry.wcag || [])].sort(),
      `wcag drift for ${node.id} (slug '${slug}')`,
    );
    checked++;
    if (slug === "color-contrast") sawColorContrast = true;
  }

  assert.ok(checked > 0, "expected at least one dist node with a wcag array");
  assert.ok(
    sawColorContrast,
    "expected color-contrast among the checked nodes",
  );
});
