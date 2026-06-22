"use strict";

// Tests for the Phase 2 v2 category-defaults derive pipeline (PR δ, v0.4.5+).
//
// Two test layers:
//   1. Derive transformer (deriveCategoryFile)
//   2. End-to-end pipeline (live MD files in components/src/categories/
//      validate + derive cleanly, idempotently, with slug refs that resolve)
//
// Frontmatter-parser correctness lives in tests/frontmatter-lib.test.js
// (the shared scripts/lib/frontmatter module the deriver now uses).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const FIXTURES = path.join(__dirname, "fixtures", "categories");

const derive = require(
  path.join(REPO_ROOT, "scripts", "categories", "derive-categories"),
);

function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

// ───────────────────────────────────────────────────────────────────────────
// Derive transformer tests
// ───────────────────────────────────────────────────────────────────────────

test("derive: projects frontmatter to dist shape with domain-anchored keys", () => {
  const md = readFixture("valid-minimal.md");
  const validator = derive.makeValidator(REPO_ROOT);
  const r = derive.deriveCategoryFile(
    md,
    "tests/fixtures/categories/valid-minimal.md",
    {
      validator,
    },
  );
  assert.equal(r.dist.slug, "test-cat");
  assert.equal(r.dist._meta.auto_generated, true);
  assert.equal(
    r.dist._meta.source,
    "tests/fixtures/categories/valid-minimal.md",
  );
  assert.equal(r.dist.anatomy.parts.length, 2);
  assert.equal(r.dist.variants.variantAxes.length, 1);
  assert.equal(r.dist.motion_refs.patternRefs[0].ref, "state-transitions");
  assert.equal(r.dist.a11y_refs.requirementRefs.length, 3);
  // _generatedAt intentionally omitted from dist for idempotency
  assert.ok(!("_generatedAt" in r.dist), "_generatedAt should not be in dist");
});

test("derive: schema validation rejects missing required key", () => {
  const md = readFixture("invalid-missing-required.md");
  const validator = derive.makeValidator(REPO_ROOT);
  assert.throws(
    () =>
      derive.deriveCategoryFile(md, "fixtures/invalid-missing-required.md", {
        validator,
      }),
    /failed schema validation/,
  );
});

test("derive: schema validation rejects too-few a11y refs", () => {
  const md = readFixture("invalid-a11y-too-few.md");
  const validator = derive.makeValidator(REPO_ROOT);
  assert.throws(
    () =>
      derive.deriveCategoryFile(md, "fixtures/invalid-a11y-too-few.md", {
        validator,
      }),
    /failed schema validation/,
  );
});

// ───────────────────────────────────────────────────────────────────────────
// End-to-end: live MD files in components/src/categories/
// ───────────────────────────────────────────────────────────────────────────

test("e2e: live MD files all derive successfully", () => {
  const srcDir = path.join(REPO_ROOT, "components", "src", "categories");
  const validator = derive.makeValidator(REPO_ROOT);
  const files = fs
    .readdirSync(srcDir)
    .filter((f) => f.endsWith(".md") && f !== "AUTHORING.md");
  assert.equal(files.length, 6, "expected exactly 6 category MD files");
  for (const f of files) {
    const md = fs.readFileSync(path.join(srcDir, f), "utf8");
    const sourceRel = "components/src/categories/" + f;
    // Should not throw
    const r = derive.deriveCategoryFile(md, sourceRel, { validator });
    assert.equal(r.frontmatter.slug + ".md", f, "slug ↔ filename match");
  }
});

test("e2e: bundle roll-up keys all 6 category slugs", () => {
  const bundlePath = path.join(
    REPO_ROOT,
    "components",
    "dist",
    "categories",
    "categories.bundle.json",
  );
  if (!fs.existsSync(bundlePath)) {
    // Bundle is only present post-derive; skip rather than fail in fresh checkouts.
    return;
  }
  const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
  const slugs = Object.keys(bundle.categories).sort();
  assert.deepEqual(slugs, [
    "action",
    "data-display",
    "feedback",
    "form-input-selection",
    "navigation",
    "overlays",
  ]);
});

test("e2e: motion + a11y slug refs all resolve against upstream sources", () => {
  // Sanity: every motion ref points at a slug in motion.json patterns; every
  // a11y ref points at a slug in a11y-index.json sections.
  const motionPath = path.join(
    REPO_ROOT,
    "foundations",
    "dist",
    "tokens",
    "motion.json",
  );
  const a11yPath = path.join(
    REPO_ROOT,
    "accessibility",
    "dist",
    "a11y-index.json",
  );
  assert.ok(
    fs.existsSync(motionPath),
    "foundations/dist/tokens/motion.json must exist; run derive:foundations first",
  );
  assert.ok(
    fs.existsSync(a11yPath),
    "accessibility/dist/a11y-index.json must exist; run derive:a11y-index first",
  );

  const motion = JSON.parse(fs.readFileSync(motionPath, "utf8"));
  const a11y = JSON.parse(fs.readFileSync(a11yPath, "utf8"));
  const motionSlugs = new Set(
    Object.values(motion.patterns || {}).map((p) => p.slug),
  );
  const a11ySlugs = new Set((a11y.sections || []).map((s) => s.slug));

  const srcDir = path.join(REPO_ROOT, "components", "src", "categories");
  const validator = derive.makeValidator(REPO_ROOT);
  const files = fs
    .readdirSync(srcDir)
    .filter((f) => f.endsWith(".md") && f !== "AUTHORING.md");

  for (const f of files) {
    const md = fs.readFileSync(path.join(srcDir, f), "utf8");
    const r = derive.deriveCategoryFile(md, f, { validator });
    for (const m of r.frontmatter.motion_refs) {
      assert.ok(
        motionSlugs.has(m.ref),
        f + " references unknown motion slug: " + m.ref,
      );
    }
    for (const a of r.frontmatter.a11y_refs) {
      assert.ok(
        a11ySlugs.has(a.ref),
        f + " references unknown a11y slug: " + a.ref,
      );
    }
  }
});

test("e2e: idempotency — deriving twice produces byte-identical dist", () => {
  // Generate at a fixed timestamp to keep the byte comparison stable.
  const srcDir = path.join(REPO_ROOT, "components", "src", "categories");
  const tmpDistA = path.join(REPO_ROOT, "tests", "__tmp_categories_dist_a");
  const tmpDistB = path.join(REPO_ROOT, "tests", "__tmp_categories_dist_b");
  for (const d of [tmpDistA, tmpDistB]) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  const opts = {
    validator: derive.makeValidator(REPO_ROOT),
  };
  derive.derivePipeline(srcDir, tmpDistA, REPO_ROOT, opts);
  derive.derivePipeline(srcDir, tmpDistB, REPO_ROOT, opts);

  const filesA = fs
    .readdirSync(tmpDistA)
    .filter((f) => f.endsWith(".json"))
    .sort();
  for (const f of filesA) {
    const a = fs.readFileSync(path.join(tmpDistA, f), "utf8");
    const b = fs.readFileSync(path.join(tmpDistB, f), "utf8");
    assert.equal(a, b, "idempotency violated for " + f);
  }
  // Clean up
  for (const d of [tmpDistA, tmpDistB]) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

test("e2e: paths-manifest updates include components.categoryDefaults entries", () => {
  // Smoke: a temporary manifest copy gets the expected keys after update.
  const tmpManifest = path.join(REPO_ROOT, "tests", "__tmp_manifest.json");
  fs.writeFileSync(
    tmpManifest,
    JSON.stringify({ _schema_version: 1, paths: {}, collections: {} }, null, 2),
  );
  const slugs = [
    "action",
    "data-display",
    "feedback",
    "form-input-selection",
    "navigation",
    "overlays",
  ];
  derive.updatePathsManifest(tmpManifest, slugs);
  const m = JSON.parse(fs.readFileSync(tmpManifest, "utf8"));
  assert.ok(m.paths["components.categoryDefaults.bundle"]);
  for (const s of slugs) {
    assert.ok(
      m.paths["components.categoryDefaults." + s],
      "missing entry for " + s,
    );
  }
  assert.ok(m.collections["components.categoryDefaults.byKey"]);
  assert.ok(m.collections["components.categoriesSrc"]);
  fs.rmSync(tmpManifest, { force: true });
});
