"use strict";

// Tests for the per-component multi-domain guideline derive pipeline (Phase 1).
//
// Three layers:
//   1. Markdown → sections parser (guideline-md-parser.js)
//   2. Derive transformer (deriveComponentDir + per-domain projection)
//   3. End-to-end pipeline (fixture component dirs → merged JSON + bundle +
//      coverage), plus schema validation and status/file consistency guards.
//
// Content-agnostic: assertions check shapes and invariants, not specific
// component prose, so refreshing the fixtures does not break the suite.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const FIXTURES = path.join(__dirname, "fixtures", "guidelines");

const mdParser = require(
  path.join(REPO_ROOT, "scripts", "components", "guideline-md-parser"),
);
const derive = require(
  path.join(REPO_ROOT, "scripts", "components", "derive-guidelines"),
);

// ───────────────────────────────────────────────────────────────────────────
// Layer 1 — markdown parser
// ───────────────────────────────────────────────────────────────────────────

test("md parser: optional frontmatter — absent is fine", () => {
  const r = mdParser.parseGuidelineMarkdown("## Style\n\n- Be concise.\n");
  assert.equal(r.frontmatter, null);
  assert.equal(r.sections.length, 1);
  assert.equal(r.sections[0].heading, "Style");
});

test("md parser: optional frontmatter — present is split out", () => {
  const r = mdParser.parseGuidelineMarkdown(
    "---\ntitle: X\n---\n## Style\n\n- Be concise.\n",
  );
  assert.match(r.frontmatter, /title: X/);
  assert.equal(r.markdown.startsWith("## Style"), true);
});

test("md parser: unclosed frontmatter fence throws", () => {
  assert.throws(
    () => mdParser.parseGuidelineMarkdown("---\ntitle: X\n## Style\n"),
    /no closing/i,
  );
});

test("md parser: H2 opens sections, bullets become string items", () => {
  const r = mdParser.parseGuidelineMarkdown(
    "## When to use\n\n- One.\n- Two.\n\n## Style\n\n- Three.\n",
  );
  assert.equal(r.sections.length, 2);
  assert.deepEqual(r.sections[0], {
    heading: "When to use",
    content: ["One.", "Two."],
  });
  assert.deepEqual(r.sections[1].content, ["Three."]);
});

test("md parser: H1 is ignored as the document title", () => {
  const r = mdParser.parseGuidelineMarkdown("# Buttons\n\n## Style\n\n- X.\n");
  assert.equal(r.sections.length, 1);
  assert.equal(r.sections[0].heading, "Style");
});

test("md parser: content before first H2 becomes an empty-heading lead section", () => {
  const r = mdParser.parseGuidelineMarkdown(
    "# Buttons\n\nButtons trigger actions.\n\n## Style\n\n- X.\n",
  );
  assert.equal(r.sections[0].heading, "");
  assert.deepEqual(r.sections[0].content, [{ note: "Buttons trigger actions." }]);
});

test("md parser: Do / Don't table → {do,dont} items", () => {
  const r = mdParser.parseGuidelineMarkdown(
    "## Do / Don't\n\n| Do | Don't |\n|---|---|\n| Create report | Report |\n| Delete dataset | Delete |\n",
  );
  assert.deepEqual(r.sections[0].content, [
    { do: "Create report", dont: "Report" },
    { do: "Delete dataset", dont: "Delete" },
  ]);
});

test("md parser: terminology table → {term,rule} items", () => {
  const r = mdParser.parseGuidelineMarkdown(
    "## Terminology\n\n| Term or term pair | Usage |\n|---|---|\n| Cancel vs Close | Use Cancel to back out. |\n",
  );
  assert.deepEqual(r.sections[0].content, [
    { term: "Cancel vs Close", rule: "Use Cancel to back out." },
  ]);
});

test("md parser: unknown table → generic {table} item", () => {
  const r = mdParser.parseGuidelineMarkdown(
    "## Specs\n\n| Prop | Value |\n|---|---|\n| height | 32px |\n",
  );
  assert.deepEqual(r.sections[0].content, [
    { table: { headers: ["Prop", "Value"], rows: [["height", "32px"]] } },
  ]);
});

test("md parser: H3 opens a reserved subsection within the section", () => {
  const r = mdParser.parseGuidelineMarkdown(
    "## When to use\n\n- Top.\n\n### Variant selection\n\n- Primary first.\n",
  );
  assert.equal(r.sections.length, 1);
  assert.deepEqual(r.sections[0].content, ["Top."]);
  assert.equal(r.sections[0].subsections.length, 1);
  assert.deepEqual(r.sections[0].subsections[0], {
    subheading: "Variant selection",
    content: ["Primary first."],
  });
});

test("md parser: Jekyll {: .class} attrs are stripped", () => {
  const r = mdParser.parseGuidelineMarkdown(
    "## Do / Don't\n\n| Do | Don't |\n|---|---|\n| Keep it | Don't |\n{: .do-dont-table}\n",
  );
  assert.equal(r.sections[0].content[0].do, "Keep it");
  assert.ok(!JSON.stringify(r.sections).includes("do-dont-table"));
});

// ───────────────────────────────────────────────────────────────────────────
// Layer 2 — derive transformer
// ───────────────────────────────────────────────────────────────────────────

const validators = derive.makeValidators(REPO_ROOT);

test("derive: full fixture → all declared domains, correct shapes", () => {
  const doc = derive.deriveComponentDir(
    path.join(FIXTURES, "valid-full"),
    "valid-full",
    REPO_ROOT,
    validators,
  );
  assert.equal(doc._schema_version, 1);
  assert.equal(doc.slug, "valid-full");
  assert.equal(doc.component, "Button");
  assert.equal(doc.meta.category, "action");
  assert.deepEqual(doc.meta.related, ["link", "icon"]);

  // content: approved → has body
  assert.equal(doc.domains.content.status, "approved");
  assert.equal(doc.domains.content.owner, "content-team");
  assert.equal(typeof doc.domains.content.markdown, "string");
  assert.ok(Array.isArray(doc.domains.content.sections));

  // usage: draft → has body
  assert.equal(doc.domains.usage.status, "draft");
  assert.ok(doc.domains.usage.sections.length > 0);

  // design + behavior: inherited → status only, no body
  assert.deepEqual(doc.domains.design, { status: "inherited" });
  assert.deepEqual(doc.domains.behavior, { status: "inherited" });

  // tokens: approved → bindings
  assert.equal(doc.domains.tokens.status, "approved");
  assert.equal(doc.domains.tokens.bindings.length, 2);
  assert.equal(doc.domains.tokens.bindings[0].token, "button-height-md");
});

test("derive: full fixture validates against guideline-component.json", () => {
  const doc = derive.deriveComponentDir(
    path.join(FIXTURES, "valid-full"),
    "valid-full",
    REPO_ROOT,
    validators,
  );
  assert.equal(validators.component(doc), true, JSON.stringify(validators.component.errors));
});

test("derive: minimal fixture → single declared domain only", () => {
  const doc = derive.deriveComponentDir(
    path.join(FIXTURES, "valid-minimal"),
    "valid-minimal",
    REPO_ROOT,
    validators,
  );
  assert.deepEqual(Object.keys(doc.domains), ["content"]);
  assert.equal(doc.domains.content.status, "approved");
  assert.equal(doc.meta.category, "feedback");
});

// --- status / file consistency guards (built in a temp dir) ---

function tmpComponentDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guideline-fixture-"));
  Object.keys(files).forEach((name) => {
    fs.writeFileSync(path.join(dir, name), files[name]);
  });
  return dir;
}

test("derive: draft domain with missing source file throws", () => {
  const dir = tmpComponentDir({
    "_meta.yml": "component: X\ncategory: action\ndomains:\n  content: { status: draft }\n",
  });
  assert.throws(
    () => derive.deriveComponentDir(dir, "x", REPO_ROOT, validators),
    /content.*missing|missing.*content/i,
  );
});

test("derive: inherited domain with a stray source file throws", () => {
  const dir = tmpComponentDir({
    "_meta.yml":
      "component: X\ncategory: action\ndomains:\n  design: { status: inherited }\n",
    "design.md": "## Layout\n\n- Stray file.\n",
  });
  assert.throws(
    () => derive.deriveComponentDir(dir, "x", REPO_ROOT, validators),
    /design\.md exists/i,
  );
});

test("derive: source file not declared in _meta.yml throws", () => {
  const dir = tmpComponentDir({
    "_meta.yml":
      "component: X\ncategory: action\ndomains:\n  content: { status: approved }\n",
    "content.md": "## Style\n\n- Ok.\n",
    "usage.md": "## When\n\n- Orphan.\n",
  });
  assert.throws(
    () => derive.deriveComponentDir(dir, "x", REPO_ROOT, validators),
    /usage\.md exists but is not declared/i,
  );
});

test("derive: missing _meta.yml throws", () => {
  const dir = tmpComponentDir({ "content.md": "## Style\n\n- Ok.\n" });
  assert.throws(
    () => derive.deriveComponentDir(dir, "x", REPO_ROOT, validators),
    /missing required _meta\.yml/i,
  );
});

test("derive: unset category with no resolver throws", () => {
  const dir = tmpComponentDir({
    "_meta.yml": "component: X\ndomains:\n  content: { status: inherited }\n",
  });
  assert.throws(
    () => derive.deriveComponentDir(dir, "x", REPO_ROOT, validators),
    /category.*not set/i,
  );
});

test("derive: unset category resolved via categoryResolver fallback", () => {
  const dir = tmpComponentDir({
    "_meta.yml": "component: X\ndomains:\n  content: { status: inherited }\n",
  });
  const doc = derive.deriveComponentDir(dir, "x", REPO_ROOT, validators, () => "action");
  assert.equal(doc.meta.category, "action");
});

// ───────────────────────────────────────────────────────────────────────────
// Layer 3 — end-to-end pipeline
// ───────────────────────────────────────────────────────────────────────────

test("pipeline: derives fixtures → per-component JSON + bundle + coverage", () => {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), "guideline-dist-"));
  const result = derive.derivePipeline(FIXTURES, distDir, REPO_ROOT, { validators });

  assert.deepEqual(result.slugs, ["valid-full", "valid-minimal"]);

  // per-component files written
  assert.ok(fs.existsSync(path.join(distDir, "valid-full.json")));
  assert.ok(fs.existsSync(path.join(distDir, "valid-minimal.json")));
  assert.ok(fs.existsSync(path.join(distDir, "guidelines.bundle.json")));
  assert.ok(fs.existsSync(path.join(distDir, "coverage.md")));

  // bundle keyed by slug, every entry valid
  const bundle = JSON.parse(
    fs.readFileSync(path.join(distDir, "guidelines.bundle.json"), "utf8"),
  );
  assert.deepEqual(Object.keys(bundle.components), ["valid-full", "valid-minimal"]);
  Object.values(bundle.components).forEach((doc) => {
    assert.equal(validators.component(doc), true, JSON.stringify(validators.component.errors));
  });

  // coverage report mentions every component + a summary
  const coverage = fs.readFileSync(path.join(distDir, "coverage.md"), "utf8");
  assert.match(coverage, /Button/);
  assert.match(coverage, /Spinner/);
  assert.match(coverage, /## Summary/);
});

test("pipeline: idempotent — byte-identical output across two runs", () => {
  const distA = fs.mkdtempSync(path.join(os.tmpdir(), "guideline-distA-"));
  const distB = fs.mkdtempSync(path.join(os.tmpdir(), "guideline-distB-"));
  derive.derivePipeline(FIXTURES, distA, REPO_ROOT, { validators });
  derive.derivePipeline(FIXTURES, distB, REPO_ROOT, { validators });
  ["valid-full.json", "guidelines.bundle.json", "coverage.md"].forEach((f) => {
    assert.equal(
      fs.readFileSync(path.join(distA, f), "utf8"),
      fs.readFileSync(path.join(distB, f), "utf8"),
      f + " is not byte-stable across runs",
    );
  });
});

test("pipeline: prunes stale dist files", () => {
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), "guideline-prune-"));
  fs.writeFileSync(path.join(distDir, "orphan.json"), "{}\n");
  const result = derive.derivePipeline(FIXTURES, distDir, REPO_ROOT, { validators });
  assert.ok(result.pruned.includes("orphan.json"));
  assert.ok(!fs.existsSync(path.join(distDir, "orphan.json")));
});

test("pipeline: empty source tree allowed with --allow-empty semantics", () => {
  const emptySrc = fs.mkdtempSync(path.join(os.tmpdir(), "guideline-emptysrc-"));
  const distDir = fs.mkdtempSync(path.join(os.tmpdir(), "guideline-emptydist-"));
  const result = derive.derivePipeline(emptySrc, distDir, REPO_ROOT, {
    validators,
    allowEmpty: true,
  });
  assert.deepEqual(result.slugs, []);
  assert.ok(fs.existsSync(path.join(distDir, "guidelines.bundle.json")));
});

test("manifest: updatePathsManifest adds guidelineDoc entries (dry run)", () => {
  const manifestPath = path.join(REPO_ROOT, "paths-manifest.json");
  const r = derive.updatePathsManifest(manifestPath, ["button", "table"], {
    dryRun: true,
  });
  assert.ok(r.added.includes("components.guidelineDoc.bundle"));
  assert.ok(r.added.includes("components.guidelineDoc.coverage"));
  assert.ok(r.added.includes("components.guidelineDoc.button"));
  assert.ok(r.manifest.collections["components.guidelineDoc.byKey"]);
  assert.ok(r.manifest.collections["components.guidelineDocSrc"]);
});
