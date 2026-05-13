"use strict";

var test = require("node:test");
var assert = require("node:assert");
var fs = require("fs");
var path = require("path");

var derive = require("../scripts/content/derive-content.js");

var ROOT = path.resolve(__dirname, "..");
var DEFAULT_CONFIG = derive.resolveConfig({});

test("derive-content — parseArgs handles --src --index --out", function () {
  var args = derive.parseArgs([
    "--src",
    "content/src",
    "--index",
    "content/src/content-index.md",
    "--out",
    "content/dist/content.md",
  ]);
  assert.strictEqual(args.src, "content/src");
  assert.strictEqual(args.index, "content/src/content-index.md");
  assert.strictEqual(args.out, "content/dist/content.md");
});

test("derive-content — parseArgs throws when flag has no value", function () {
  assert.throws(function () {
    derive.parseArgs(["--src"]);
  }, /requires a value/);
  assert.throws(function () {
    derive.parseArgs(["--src", "--out", "x"]);
  }, /requires a value/);
});

test("derive-content — parseArgs rejects unknown flags", function () {
  assert.throws(function () {
    derive.parseArgs(["--scr", "content/src"]);
  }, /unknown flag --scr/);
  assert.throws(function () {
    derive.parseArgs(["--src", "content/src", "--bogus", "x"]);
  }, /unknown flag --bogus/);
});

test("derive-content — resolveConfig falls back to repo defaults", function () {
  var config = derive.resolveConfig({});
  assert.ok(config.src.endsWith("content/src"));
  assert.ok(config.index.endsWith("content/src/content-index.md"));
  assert.ok(config.out.endsWith("content/dist/content.md"));
});

test("derive-content — resolveConfig honors explicit flags", function () {
  var config = derive.resolveConfig({
    src: "content/src",
    index: "content/src/content-index.md",
    out: "content/dist/content.md",
  });
  assert.ok(path.isAbsolute(config.src), "src should be absolute path");
  assert.ok(path.isAbsolute(config.out), "out should be absolute path");
});

test("derive-content — readSectionOrder parses content-index.md", function () {
  var order = derive.readSectionOrder(DEFAULT_CONFIG.index);
  assert.ok(order.length >= 30, "expected ≥30 sections, got " + order.length);
  assert.strictEqual(
    order[0].slug,
    "global-guidelines",
    "first section must be global-guidelines",
  );
  var slugs = order.map(function (e) {
    return e.slug;
  });
  assert.ok(slugs.indexOf("buttons") !== -1, "buttons section missing");
  assert.ok(slugs.indexOf("wizards") !== -1, "wizards section missing");
  assert.ok(
    slugs.indexOf("tags-badges-status-indicators") !== -1,
    "tags-badges-status-indicators section missing",
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

test("derive-content — buildOutput produces preamble + sections + no trailing separator", function () {
  var out = derive.buildOutput(DEFAULT_CONFIG);
  assert.match(
    out,
    /^# Content guidelines — Actian Data Intelligence/,
    "expected H1 preamble",
  );
  assert.ok(
    out.indexOf("Auto-generated") !== -1,
    "preamble should flag auto-generation",
  );
  assert.ok(
    out.indexOf("## Global guidelines") !== -1,
    "missing Global section",
  );
  assert.ok(out.indexOf("## Buttons") !== -1, "missing Buttons section");
  assert.ok(out.indexOf("## Wizards") !== -1, "missing Wizards section");
  var trimmed = out.replace(/\n+$/, "");
  assert.ok(!/\n---$/.test(trimmed), "output must not end with a separator");
});

test("derive-content — buildOutput is deterministic / idempotent", function () {
  var first = derive.buildOutput(DEFAULT_CONFIG);
  var second = derive.buildOutput(DEFAULT_CONFIG);
  assert.strictEqual(
    first,
    second,
    "buildOutput must be byte-identical across runs",
  );
});

test("derive-content — committed dist/content.md matches buildOutput", function () {
  if (!fs.existsSync(DEFAULT_CONFIG.out)) return;
  var onDisk = fs.readFileSync(DEFAULT_CONFIG.out, "utf8");
  var generated = derive.buildOutput(DEFAULT_CONFIG);
  assert.strictEqual(
    onDisk,
    generated,
    "content/dist/content.md is stale — run `npm run derive:content` and commit",
  );
});

// Files in content/src/ that aren't section bodies. Kept in sync with
// the manifest validator's EXCLUDED_FILES + the index's expected omissions.
var NON_SECTION_FILES = new Set([
  "AUTHORING.md",
  "format-spec.md",
  "content-index.md",
]);

test("derive-content — every .md in content/src/ is referenced by the index (inverse coverage)", function () {
  var indexSlugs = new Set(
    derive.readSectionOrder(DEFAULT_CONFIG.index).map(function (e) {
      return e.slug;
    }),
  );

  // ζ.6 follow-up (2026-05-13): walk BOTH content/src/*.md AND
  // content/src/_global/*.md. The `_global/` subdirectory is the new
  // home for cross-cutting topics (voice/tone, empty-state patterns,
  // etc.) that will route to the docs /content page only when the
  // derive pipeline gets its Phase 1 split. Until then, both locations
  // contribute the same way to content.md; the inverse-coverage
  // assertion just needs to see all files regardless of location.
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
  var entries = collectMdSlugs(DEFAULT_CONFIG.src).concat(
    collectMdSlugs(path.join(DEFAULT_CONFIG.src, "_global")),
  );

  assert.ok(entries.length > 0, "no section files found in content/src/");
  for (var i = 0; i < entries.length; i++) {
    assert.ok(
      indexSlugs.has(entries[i]),
      "content/src[/_global]/" +
        entries[i] +
        ".md is not referenced by content-index.md — add it to the 'All sections' list or move it to NON_SECTION_FILES",
    );
  }
});
