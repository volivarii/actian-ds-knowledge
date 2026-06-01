"use strict";

// Guard for the per-component a11y_refs coverage work + WCAG 2.2 re-baseline.
// (Coverage assertions are appended in Task 3.)

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"));
}

// WCAG 2.2 re-baseline: 2.5.5 Target Size is AAA in 2.1/2.2; the AA equivalent
// is 2.5.8 Target Size (Minimum). No slug in the index may cite 2.5.5.
test("a11y-index cites no AAA target-size criterion (2.5.5)", () => {
  const indexText = fs.readFileSync(
    path.join(REPO_ROOT, "accessibility/dist/a11y-index.json"),
    "utf8",
  );
  assert.ok(
    !/\b2\.5\.5\b/.test(indexText),
    "2.5.5 (AAA) must be replaced by 2.5.8 (AA) after the WCAG 2.2 re-baseline",
  );
});

test("a11y intro states WCAG 2.2 AA as the target", () => {
  const intro = fs.readFileSync(
    path.join(REPO_ROOT, "accessibility/src/intro.md"),
    "utf8",
  );
  assert.ok(/WCAG 2\.2 AA/.test(intro), "intro must state WCAG 2.2 AA");
  assert.ok(
    !/WCAG 2\.1 AA/.test(intro),
    "intro must not still say WCAG 2.1 AA",
  );
});

// ── Coverage guard ──────────────────────────────────────────────────────────

// Coverage POLICY (not derivable from tier): component-pattern slugs that
// have no documented component host yet. Allowlisted — neither required to be
// referenced nor treated as a failure. Shrinks as these components are
// authored. (designer-handoff-checklist is header-tier, handled by tier.)
const KNOWN_GAP = new Set([
  "loading-patterns",
  "empty-states",
  "drag-drop",
  "ai-output-suggestions",
]);

function indexBySlug() {
  return readJson("accessibility/dist/a11y-index.json").bySlug || {};
}
function slugsOfTier(tier) {
  const by = indexBySlug();
  return Object.keys(by).filter((s) => by[s].tier === tier);
}

function allIndexSlugs() {
  const index = readJson("accessibility/dist/a11y-index.json");
  return new Set(Object.keys(index.bySlug || {}));
}

function allReferencedSlugs() {
  const refs = new Set();
  const catDir = path.join(REPO_ROOT, "components/dist/categories");
  fs.readdirSync(catDir)
    .filter((f) => /^[a-z][a-z0-9-]*-defaults\.json$/.test(f))
    .forEach((f) => {
      const def = readJson("components/dist/categories/" + f);
      // Category defaults use a11y_refs.requirementRefs (nested object shape).
      const catRefs = (def.a11y_refs && def.a11y_refs.requirementRefs) || [];
      catRefs.forEach((r) => refs.add(r.ref));
    });
  const gDir = path.join(REPO_ROOT, "components/dist/guidelines");
  fs.readdirSync(gDir)
    .filter((f) => f.endsWith(".json") && f !== "guidelines.bundle.json")
    .forEach((f) => {
      const doc = readJson("components/dist/guidelines/" + f);
      if (doc._alias_of) return;
      // Component guidelines use a flat array at meta.a11y_refs.
      ((doc.meta && doc.meta.a11y_refs) || []).forEach((r) => refs.add(r.ref));
    });
  return refs;
}

test("every a11y-index slug has a valid tier", () => {
  const by = indexBySlug();
  const VALID = new Set([
    "foundation",
    "component-pattern",
    "checklist",
    "header",
  ]);
  const bad = Object.keys(by).filter((s) => !VALID.has(by[s].tier));
  assert.deepEqual(
    bad,
    [],
    "slug(s) with missing/invalid tier: " + bad.join(", "),
  );
});

test("no a11y ref dangles (every ref resolves to an index slug)", () => {
  const slugs = allIndexSlugs();
  const dangling = [...allReferencedSlugs()].filter((r) => !slugs.has(r));
  assert.deepEqual(
    dangling,
    [],
    "dangling a11y ref(s) not in a11y-index: " + dangling.join(", "),
  );
});

test("every required component-pattern slug is referenced", () => {
  const referenced = allReferencedSlugs();
  const required = slugsOfTier("component-pattern").filter(
    (s) => !KNOWN_GAP.has(s),
  );
  const missing = required.filter((s) => !referenced.has(s));
  assert.deepEqual(
    missing,
    [],
    "component-pattern slug(s) not referenced by any component/category: " +
      missing.join(", "),
  );
});

test("thinness report: known-gap slugs are logged, not failed", () => {
  const referenced = allReferencedSlugs();
  const stillGap = [...KNOWN_GAP].filter((s) => !referenced.has(s));
  if (stillGap.length > 0) {
    console.log(
      "[a11y-coverage] known-gap slugs with no component/category host (informational): " +
        stillGap.join(", "),
    );
  }
  assert.ok(true);
});
