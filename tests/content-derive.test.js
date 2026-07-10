"use strict";

var test = require("node:test");
var assert = require("node:assert");
var fs = require("fs");
var path = require("path");

var derive = require("../scripts/content/derive-content.js");

var ROOT = path.resolve(__dirname, "..");
var DEFAULT_CONFIG = derive.resolveConfig({});

test("derive-content — parseArgs handles --src --index (Phase 5: --out retired)", function () {
  var args = derive.parseArgs([
    "--src",
    "content/src",
    "--index",
    "content/src/content-index.md",
  ]);
  assert.strictEqual(args.src, "content/src");
  assert.strictEqual(args.index, "content/src/content-index.md");
});

test("derive-content — parseArgs throws when flag has no value", function () {
  assert.throws(function () {
    derive.parseArgs(["--src"]);
  }, /requires a value/);
  assert.throws(function () {
    derive.parseArgs(["--src", "--index", "x"]);
  }, /requires a value/);
});

test("derive-content — parseArgs rejects unknown flags", function () {
  assert.throws(function () {
    derive.parseArgs(["--scr", "content/src"]);
  }, /unknown flag --scr/);
  assert.throws(function () {
    derive.parseArgs(["--src", "content/src", "--bogus", "x"]);
  }, /unknown flag --bogus/);
  // --out was retired in Phase 5; should now be rejected.
  assert.throws(function () {
    derive.parseArgs(["--out", "content/dist/content.md"]);
  }, /unknown flag --out/);
});

test("derive-content — resolveConfig falls back to repo defaults", function () {
  var config = derive.resolveConfig({});
  assert.ok(config.src.endsWith("content/src"));
  assert.ok(config.index.endsWith("content/src/content-index.md"));
  assert.ok(config.globalOut.endsWith("content/dist/global.md"));
});

test("derive-content — resolveConfig honors explicit flags", function () {
  var config = derive.resolveConfig({
    src: "content/src",
    index: "content/src/content-index.md",
  });
  assert.ok(path.isAbsolute(config.src), "src should be absolute path");
  assert.ok(
    path.isAbsolute(config.globalOut),
    "globalOut should be absolute path",
  );
});

test("derive-content — readSectionOrder parses content-index.md", function () {
  var order = derive.readSectionOrder(DEFAULT_CONFIG.index);
  assert.ok(order.length >= 30, "expected ≥30 sections, got " + order.length);
  assert.strictEqual(
    order[0].slug,
    "global-guidelines",
    "first section must be global-guidelines",
  );
  // 2026-05-13: previous assertions hard-coded specific slugs
  // (`buttons`, `wizards`, `tags-badges-status-indicators`) and broke
  // when the content team rationalized filenames to singular component
  // slugs (`button`, `tag`, etc.). Replaced with structural checks —
  // they exercise the same parser invariants without brittling on
  // file-renames at the authoring layer.
  var slugs = order.map(function (e) {
    return e.slug;
  });
  // Each slug is a non-empty kebab-case identifier.
  for (var i = 0; i < slugs.length; i++) {
    assert.ok(
      typeof slugs[i] === "string" && slugs[i].length > 0,
      "slug[" + i + "] must be a non-empty string",
    );
    assert.ok(
      /^[a-z0-9][a-z0-9-]*$/.test(slugs[i]),
      "slug[" + i + "]='" + slugs[i] + "' must be kebab-case lowercase",
    );
  }
  // Parser preserves authoring order (first ≠ last).
  assert.notStrictEqual(
    order[0].slug,
    order[order.length - 1].slug,
    "first and last sections should differ",
  );
});

test("derive-content — section order has no duplicates", function () {
  var order = derive.readSectionOrder(DEFAULT_CONFIG.index);
  var seen = new Set();
  for (var i = 0; i < order.length; i++) {
    assert.ok(
      !seen.has(order[i].slug),
      "duplicate slug in order: " + order[i].slug,
    );
    seen.add(order[i].slug);
  }
});

test("derive-content — every ordered slug has a source file", function () {
  var order = derive.readSectionOrder(DEFAULT_CONFIG.index);
  for (var i = 0; i < order.length; i++) {
    var body = derive.readSection(DEFAULT_CONFIG.src, order[i].slug);
    assert.ok(body !== null, "no source for slug '" + order[i].slug + "'");
  }
});

test("derive-content — stripFrontmatter removes Jekyll YAML block", function () {
  var input = '---\ntitle: "Buttons"\nnav_order: 4\n---\n# Buttons\n\nbody';
  var out = derive.stripFrontmatter(input);
  assert.strictEqual(out, "# Buttons\n\nbody");
});

test("derive-content — stripFrontmatter is no-op when no frontmatter", function () {
  var input = "# Buttons\n\nbody";
  var out = derive.stripFrontmatter(input);
  assert.strictEqual(out, input);
});

test("derive-content — shiftHeadings demotes # by one level", function () {
  var input = "# H1\n## H2\n### H3\nbody";
  var out = derive.shiftHeadings(input);
  assert.strictEqual(out, "## H1\n### H2\n#### H3\nbody");
});

test("derive-content — shiftHeadings preserves fenced code blocks", function () {
  var input = "# H1\n```\n# not a heading\n```\n# H1 again";
  var out = derive.shiftHeadings(input);
  assert.strictEqual(
    out,
    "## H1\n```\n# not a heading\n```\n## H1 again",
    "code-block contents must not be demoted",
  );
});

test("derive-content — stripJekyllAttrs removes {: .class} hints", function () {
  var input = "| a | b |\n|---|---|\n| 1 | 2 |\n{: .do-dont-table}\n\nnext";
  var out = derive.stripJekyllAttrs(input);
  assert.ok(
    out.indexOf("{: .do-dont-table}") === -1,
    "Jekyll attr should be removed",
  );
  assert.ok(out.indexOf("next") !== -1, "non-attr content must remain");
});

test("derive-content — stripJekyllAttrs consumes the trailing newline", function () {
  // Attr line + its newline should both go, leaving the surrounding
  // structure intact (no orphan blank line).
  var input = "| a |\n|---|\n| 1 |\n{: .do-dont-table}\nnext line";
  var out = derive.stripJekyllAttrs(input);
  assert.strictEqual(out, "| a |\n|---|\n| 1 |\nnext line");
});

test("derive-content — collapseBlankLines normalizes 3+ newlines to 2", function () {
  assert.strictEqual(derive.collapseBlankLines("a\n\n\nb"), "a\n\nb");
  assert.strictEqual(derive.collapseBlankLines("a\n\n\n\n\nb"), "a\n\nb");
  assert.strictEqual(derive.collapseBlankLines("a\n\nb"), "a\n\nb");
  assert.strictEqual(derive.collapseBlankLines("a\nb"), "a\nb");
});

// Phase 5 (knowledge v0.11.0): the content.md full-concat was retired.
// `buildOutput()` removed; tests above moved to `buildGlobalOutput()`
// + a new assertion that content.md is gone from dist/.

test("derive-content — content.md is no longer emitted (retired Phase 5)", function () {
  var contentMdPath = path.join(
    path.dirname(DEFAULT_CONFIG.globalOut),
    "content.md",
  );
  assert.ok(
    !fs.existsSync(contentMdPath),
    "content/dist/content.md was retired; deriver no longer emits it",
  );
  assert.strictEqual(
    typeof derive.buildOutput,
    "undefined",
    "buildOutput() should no longer be exported",
  );
});

test("derive-content — buildGlobalOutput emits global topics only, no component sections", function () {
  var out = derive.buildGlobalOutput(DEFAULT_CONFIG);
  assert.match(
    out,
    /^# Content guidelines — global topics/,
    "expected global-topics H1 preamble",
  );
  assert.ok(
    out.indexOf("## Global guidelines") !== -1,
    "global topic 'Global guidelines' must be present",
  );
  // Component-scoped sections (resolved from components/src/<slug>/content.md)
  // must NOT appear in the global-only output.
  assert.ok(
    out.indexOf("## Buttons") === -1,
    "component section 'Buttons' must not appear in global.md",
  );
  var trimmed = out.replace(/\n+$/, "");
  assert.ok(!/\n---$/.test(trimmed), "output must not end with a separator");
});

test("derive-content — committed dist/global.md matches buildGlobalOutput", function () {
  var globalPath = DEFAULT_CONFIG.globalOut;
  if (!fs.existsSync(globalPath)) return;
  var onDisk = fs.readFileSync(globalPath, "utf8");
  var generated = derive.buildGlobalOutput(DEFAULT_CONFIG);
  assert.strictEqual(
    onDisk,
    generated,
    "content/dist/global.md is stale — run `npm run derive:content` and commit",
  );
});

// ---- per-bucket split views (content-dist split slice) ----

test("derive-content — buildBucketOutput rejects an unknown bucket", function () {
  assert.throws(function () {
    derive.buildBucketOutput(DEFAULT_CONFIG, "nope");
  }, /unknown content bucket 'nope'/);
});

test("derive-content — each committed bucket dist matches buildBucketOutput", function () {
  derive.CONTENT_SUB_BUCKETS.forEach(function (bucket) {
    var onDisk = fs.readFileSync(DEFAULT_CONFIG.bucketOuts[bucket], "utf8");
    assert.strictEqual(
      onDisk,
      derive.buildBucketOutput(DEFAULT_CONFIG, bucket),
      "content/dist/" +
        bucket +
        ".md is stale — run `npm run derive:content` and commit",
    );
  });
});

test("derive-content — bucket outputs partition the bucketed global sections", function () {
  var globalSections = derive
    .resolveAllSections(DEFAULT_CONFIG)
    .filter(function (s) {
      return s.scope === "global";
    });
  var bucketed = globalSections.filter(function (s) {
    return s.bucket !== null;
  });
  var rootLevel = globalSections.filter(function (s) {
    return s.bucket === null;
  });
  assert.ok(bucketed.length > 0, "expected bucketed global sections");
  assert.ok(
    rootLevel.length > 0,
    "expected root-level meta sections (global.md-only)",
  );
  derive.CONTENT_SUB_BUCKETS.forEach(function (bucket) {
    var out = derive.buildBucketOutput(DEFAULT_CONFIG, bucket);
    bucketed.forEach(function (s) {
      // Membership by section BODY (what assembleDoc actually embeds):
      // index titles don't reliably match section headings (some sections
      // have no H1 of their own). An empty body (a frontmatter-only stub
      // like loading-and-progress) is a substring of anything, so it can't
      // carry a membership signal — skip it.
      if (s.body.length === 0) return;
      var inThisBucket = s.bucket === bucket;
      assert.equal(
        out.indexOf(s.body) !== -1,
        inThisBucket,
        "section '" +
          s.slug +
          "' (bucket " +
          s.bucket +
          ") must appear in " +
          bucket +
          ".md " +
          (inThisBucket ? "exactly" : "never"),
      );
    });
    // Root-level meta files are global.md-only by design.
    rootLevel.forEach(function (s) {
      if (s.body.length === 0) return;
      assert.ok(
        out.indexOf(s.body) === -1,
        "root-level section '" +
          s.slug +
          "' must not appear in " +
          bucket +
          ".md",
      );
    });
  });
});

test("derive-content — writing bucket re-renders the words-to-avoid table like global.md", function () {
  var out = derive.buildBucketOutput(DEFAULT_CONFIG, "writing");
  var expected = derive.renderWordsToAvoidSection(
    derive.readWordsToAvoidRules(DEFAULT_CONFIG),
  );
  assert.ok(
    out.indexOf(expected) !== -1,
    "writing.md must carry the frontmatter-rendered Do/Don't table",
  );
});

// Files in content/src/ that aren't section bodies. Kept in sync with
// the manifest validator's EXCLUDED_FILES + the index's expected omissions.
var NON_SECTION_FILES = new Set([
  "AUTHORING.md",
  "README.md",
  "format-spec.md",
  "content-index.md",
]);

test("derive-content — every section source file is referenced by the index (inverse coverage)", function () {
  var indexSlugs = new Set(
    derive.readSectionOrder(DEFAULT_CONFIG.index).map(function (e) {
      return e.slug;
    }),
  );

  // The deriver resolves each section from one of three locations
  // (see resolveSectionFile): the per-component guideline layout
  // `components/src/<slug>/content.md` (Phase 2a — component-scoped
  // content), `content/src/<slug>.md` for the small set of root-level
  // meta sections, and `content/src/<bucket>/<slug>.md` (Phase 2c —
  // sub-bucketed global content under writing/, patterns/, product/).
  // The inverse-coverage assertion must walk ALL legs so a file moved
  // or added without registering its slug in content-index.md is caught —
  // extend this whenever resolveSectionFile grows a new lookup leg.
  var REPO_ROOT = path.resolve(DEFAULT_CONFIG.src, "..", "..");
  var SUB_BUCKETS = derive.CONTENT_SUB_BUCKETS || [
    "writing",
    "patterns",
    "product",
  ];

  function collectMdSlugs(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter(function (f) {
        return f.endsWith(".md") && !NON_SECTION_FILES.has(f);
      })
      .map(function (f) {
        return f.replace(/\.md$/, "");
      });
  }

  // Global content leg: walk both the content/src/ root (meta-level
  // entries like global-guidelines.md) and each sub-bucket directory.
  function collectGlobalSlugs() {
    var slugs = collectMdSlugs(DEFAULT_CONFIG.src);
    for (var i = 0; i < SUB_BUCKETS.length; i++) {
      var bucketDir = path.join(DEFAULT_CONFIG.src, SUB_BUCKETS[i]);
      slugs = slugs.concat(collectMdSlugs(bucketDir));
    }
    return slugs;
  }

  // Per-component leg: components/src/<slug>/content.md → slug = dir name.
  function collectComponentSlugs() {
    var componentsSrc = path.join(REPO_ROOT, "components", "src");
    if (!fs.existsSync(componentsSrc)) return [];
    return fs.readdirSync(componentsSrc).filter(function (name) {
      var abs = path.join(componentsSrc, name);
      return (
        fs.statSync(abs).isDirectory() &&
        fs.existsSync(path.join(abs, "content.md"))
      );
    });
  }

  var entries = collectGlobalSlugs().concat(collectComponentSlugs());

  assert.ok(entries.length > 0, "no section source files found");
  for (var i = 0; i < entries.length; i++) {
    assert.ok(
      indexSlugs.has(entries[i]),
      entries[i] +
        " has a section source file but is not referenced by content-index.md" +
        " — add it to the 'All sections' list or move it to NON_SECTION_FILES",
    );
  }
});

var os = require("os");

test("resolveSectionFile finds files in content/src/writing/ sub-bucket", function () {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "derive-content-"));
  var writingDir = path.join(tmp, "writing");
  fs.mkdirSync(writingDir);
  fs.writeFileSync(
    path.join(writingDir, "voice-and-tone.md"),
    "# Voice\n\nstub\n",
  );

  var resolved = derive.resolveSectionFile(tmp, "voice-and-tone");

  assert.ok(resolved, "expected resolution");
  assert.strictEqual(resolved.scope, "global");
  assert.strictEqual(resolved.bucket, "writing");
  assert.ok(resolved.file.endsWith("writing/voice-and-tone.md"));

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("resolveSectionFile finds files in content/src/patterns/ sub-bucket", function () {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "derive-content-"));
  var patternsDir = path.join(tmp, "patterns");
  fs.mkdirSync(patternsDir);
  fs.writeFileSync(path.join(patternsDir, "forms.md"), "# Forms\n\nstub\n");

  var resolved = derive.resolveSectionFile(tmp, "forms");

  assert.ok(resolved);
  assert.strictEqual(resolved.bucket, "patterns");

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("resolveSectionFile finds files in content/src/product/ sub-bucket", function () {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "derive-content-"));
  var productDir = path.join(tmp, "product");
  fs.mkdirSync(productDir);
  fs.writeFileSync(
    path.join(productDir, "lineage-specific-ui.md"),
    "# Lineage\n\nstub\n",
  );

  var resolved = derive.resolveSectionFile(tmp, "lineage-specific-ui");

  assert.ok(resolved);
  assert.strictEqual(resolved.bucket, "product");

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("resolveSectionFile still finds root-level meta files with bucket=null", function () {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "derive-content-"));
  fs.writeFileSync(
    path.join(tmp, "global-guidelines.md"),
    "# Global\n\nstub\n",
  );

  var resolved = derive.resolveSectionFile(tmp, "global-guidelines");

  assert.ok(resolved);
  assert.strictEqual(resolved.scope, "global");
  assert.strictEqual(resolved.bucket, null);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("resolveSectionFile returns null for missing slug", function () {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "derive-content-"));
  var resolved = derive.resolveSectionFile(tmp, "does-not-exist");
  assert.strictEqual(resolved, null);
  fs.rmSync(tmp, { recursive: true, force: true });
});
