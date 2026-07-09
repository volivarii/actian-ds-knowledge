"use strict";

// Pure (DOM-free) registry helpers behind the CI-derived WYSIWYG rich-safe set.
// Runs in the ROOT suite (node --test tests/*.test.js), which is inside the
// required validate-manifest gate. The round-trip corpus gate (which needs
// Milkdown + happy-dom + tsx) stays in the editor suite; only the pure lookups
// (distEquivalenceForPath, editableSourceFiles) are exercised here.

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");
var domains = require("../domains.json");
var registry = require("../scripts/lib/wysiwyg-registry.js");
var distEquivalenceForPath = registry.distEquivalenceForPath;
var editableSourceFiles = registry.editableSourceFiles;

test("distEquivalenceForPath resolves by domain src, not safePaths", function () {
  var cfg = distEquivalenceForPath(domains, "foundations/src/tokens.md");
  assert.equal(cfg.engine, "section-dist");
});

test("content path has no per-file distEquivalence", function () {
  assert.equal(
    distEquivalenceForPath(domains, "content/src/patterns/forms.md"),
    null,
  );
});

test("editableSourceFiles finds foundations + accessibility + content + guideline bodies", function () {
  var files = editableSourceFiles(path.resolve(__dirname, ".."));
  assert.ok(files.includes("foundations/src/tokens.md"));
  assert.ok(
    files.some(function (f) {
      return /^accessibility\/src\/.+\.md$/.test(f);
    }),
  );
  assert.ok(
    files.some(function (f) {
      return /^components\/src\/[^/]+\/(content|usage|design|behavior)\.md$/.test(
        f,
      );
    }),
  );
});

test("editableSourceFiles excludes AUTHORING/README and the words-to-avoid data record", function () {
  var files = editableSourceFiles(path.resolve(__dirname, ".."));
  assert.ok(
    !files.some(function (f) {
      return /AUTHORING\.md$|README\.md$|EDITING-GUIDE\.md$/.test(f);
    }),
    "structural docs must not be walked",
  );
  assert.ok(
    !files.includes("content/src/writing/words-to-avoid.md"),
    "words-to-avoid.md is a frontmatter-data record, not a prose body",
  );
});
