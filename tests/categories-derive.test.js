"use strict";

// Tests for the Phase 2 v2 category-defaults derive pipeline (PR δ, v0.4.5+).
//
// Three test layers:
//   1. YAML frontmatter parser (categories-parser.js)
//   2. Derive transformer (deriveCategoryFile)
//   3. End-to-end pipeline (live MD files in components/src/categories/
//      validate + derive cleanly, idempotently, with slug refs that resolve)

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const FIXTURES = path.join(__dirname, "fixtures", "categories");

const parser = require(
  path.join(REPO_ROOT, "scripts", "categories", "categories-parser"),
);
const derive = require(
  path.join(REPO_ROOT, "scripts", "categories", "derive-categories"),
);

function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

// ───────────────────────────────────────────────────────────────────────────
// Parser tests
// ───────────────────────────────────────────────────────────────────────────

test("parser: happy path produces frontmatter object + body", () => {
  const { data, body } = parser.parse(readFixture("valid-minimal.md"));
  assert.equal(data.slug, "test-cat");
  assert.equal(data.label, "Test category");
  assert.equal(data._schema_version, 1);
  assert.equal(data.confidence.anatomy, "medium");
  assert.equal(data.confidence.a11y, "high");
  assert.equal(data.anatomy.length, 2);
  assert.equal(data.anatomy[0].name, "Label");
  assert.deepEqual(data.variants[0].values, ["default", "focus", "error"]);
  assert.equal(data.motion_refs[0].ref, "state-transitions");
  assert.equal(data.accessibility.length, 3);
  assert.match(body, /^# Test body/);
});

test("parser: missing opening fence throws", () => {
  assert.throws(
    () => parser.parse("slug: test\n"),
    /Missing opening `---` fence/,
  );
});

test("parser: missing closing fence throws", () => {
  assert.throws(
    () => parser.parse("---\nslug: test\nlabel: T\n"),
    /Missing closing `---` fence/,
  );
});

test("parser: inline array of scalars", () => {
  const result = parser.parseInlineArray("[a, b, c]", 1);
  assert.deepEqual(result, ["a", "b", "c"]);
});

test("parser: inline array preserves quoted strings with commas", () => {
  const result = parser.parseInlineArray('["a, b", c]', 1);
  assert.deepEqual(result, ["a, b", "c"]);
});

test("parser: inline object with nested array", () => {
  const result = parser.parseInlineObject(
    "{ axis: State, values: [default, focus, error] }",
    1,
  );
  assert.deepEqual(result, {
    axis: "State",
    values: ["default", "focus", "error"],
  });
});

test("parser: inline object permits unquoted prose with commas in description", () => {
  // This is the bread-and-butter case for category MDs.
  const result = parser.parseInlineObject(
    "{ name: Container, description: receives focus, hover, press states }",
    1,
  );
  assert.deepEqual(result, {
    name: "Container",
    description: "receives focus, hover, press states",
  });
});

test("parser: nested object (confidence map)", () => {
  const md =
    "---\n" +
    "slug: x\n" +
    "label: X\n" +
    "confidence:\n" +
    "  anatomy: medium\n" +
    "  variants: low\n" +
    "  motion: high\n" +
    "  a11y: high\n" +
    "---\n";
  const { data } = parser.parse(md);
  assert.deepEqual(data.confidence, {
    anatomy: "medium",
    variants: "low",
    motion: "high",
    a11y: "high",
  });
});

test("parser: block-style array of inline objects", () => {
  const md =
    "---\n" +
    "slug: x\n" +
    "label: X\n" +
    "anatomy:\n" +
    "  - { name: A, description: alpha }\n" +
    "  - { name: B, description: beta }\n" +
    "---\n";
  const { data } = parser.parse(md);
  assert.equal(data.anatomy.length, 2);
  assert.equal(data.anatomy[0].name, "A");
  assert.equal(data.anatomy[1].description, "beta");
});

test("parser: strips comments", () => {
  const md =
    "---\n" +
    "slug: x  # this is a comment\n" +
    "label: X\n" +
    "_schema_version: 1   # version pin\n" +
    "---\n";
  const { data } = parser.parse(md);
  assert.equal(data.slug, "x");
  assert.equal(data._schema_version, 1);
});

test("parser: coerces _schema_version to integer", () => {
  const md = "---\n_schema_version: 1\nslug: x\nlabel: X\n---\n";
  const { data } = parser.parse(md);
  assert.equal(data._schema_version, 1);
  assert.equal(typeof data._schema_version, "number");
});

test("parser: indented top-level key throws", () => {
  const md = "---\n  slug: x\nlabel: X\n---\n";
  assert.throws(
    () => parser.parse(md),
    /top-level keys must start at column 1/,
  );
});

// ───────────────────────────────────────────────────────────────────────────
// Derive transformer tests
// ───────────────────────────────────────────────────────────────────────────

test("derive: projects frontmatter to dist shape with card_* keys", () => {
  const md = readFixture("valid-minimal.md");
  const validator = derive.makeValidator(REPO_ROOT);
  const r = derive.deriveCategoryFile(md, "tests/fixtures/categories/valid-minimal.md", {
    generatedAt: "2026-05-12T00:00:00.000Z",
    validator,
  });
  assert.equal(r.dist.slug, "test-cat");
  assert.equal(r.dist._meta.auto_generated, true);
  assert.equal(r.dist._meta.source, "tests/fixtures/categories/valid-minimal.md");
  assert.equal(r.dist.card_anatomy.parts.length, 2);
  assert.equal(r.dist.card_component.variantAxes.length, 1);
  assert.equal(r.dist.card_motion.patternRefs[0].ref, "state-transitions");
  assert.equal(r.dist.card_accessibility.requirementRefs.length, 3);
  assert.equal(r.dist._generatedAt, "2026-05-12T00:00:00.000Z");
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
  if (!fs.existsSync(motionPath) || !fs.existsSync(a11yPath)) return;

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
    for (const a of r.frontmatter.accessibility) {
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
  const tmpDistA = path.join(
    REPO_ROOT,
    "tests",
    "__tmp_categories_dist_a",
  );
  const tmpDistB = path.join(
    REPO_ROOT,
    "tests",
    "__tmp_categories_dist_b",
  );
  for (const d of [tmpDistA, tmpDistB]) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  const opts = {
    generatedAt: "2026-05-12T00:00:00.000Z",
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
    JSON.stringify(
      { _schema_version: 1, paths: {}, collections: {} },
      null,
      2,
    ),
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
  assert.ok(m.collections["components.categoryDefaults"]);
  assert.ok(m.collections["components.categoriesSrc"]);
  fs.rmSync(tmpManifest, { force: true });
});
