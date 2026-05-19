"use strict";

// Tests for scripts/components/derive-media-index.js.
//
// Covers:
//   - deriveSlugMedia    — per-slug role detection from on-disk files
//   - buildMediaIndex    — full index object construction (sorted, byte-stable)
//   - writeMediaIndex    — idempotent disk write (skip on no-change)
//   - schema validation  — emitted index conforms to schemas/media-index.json
//
// Also asserts the architectural promise: a component with media but no
// guideline doc still appears in the index. That's the whole reason this
// layer exists.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var os = require("node:os");
var Ajv = require("ajv/dist/2020");
var addFormats = require("ajv-formats");

var deriver = require("../scripts/components/derive-media-index.js");

function tmpRepo() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), "media-idx-"));
  fs.mkdirSync(path.join(root, "components", "dist", "media"), {
    recursive: true,
  });
  return root;
}

function seedMedia(root, slug, files) {
  var dir = path.join(root, "components", "dist", "media", slug);
  fs.mkdirSync(dir, { recursive: true });
  files.forEach(function (basename) {
    fs.writeFileSync(path.join(dir, basename), Buffer.from([0x89, 0x50]));
  });
}

function compiledSchema() {
  var schemaPath = path.resolve(
    __dirname,
    "..",
    "schemas",
    "media-index.json",
  );
  var schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  var ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

test("deriveSlugMedia returns role map when preview.png present", function () {
  var root = tmpRepo();
  seedMedia(root, "avatar", ["preview.png"]);
  var mediaRoot = path.join(root, "components", "dist", "media");
  var map = deriver.deriveSlugMedia(mediaRoot, "avatar");
  assert.deepEqual(map, {
    preview: "components/dist/media/avatar/preview.png",
  });
});

test("deriveSlugMedia returns null when slug dir absent", function () {
  var root = tmpRepo();
  var mediaRoot = path.join(root, "components", "dist", "media");
  assert.equal(deriver.deriveSlugMedia(mediaRoot, "absent"), null);
});

test("deriveSlugMedia returns null when slug dir has no known roles", function () {
  var root = tmpRepo();
  seedMedia(root, "decoy", ["random.txt", "notes.md"]);
  var mediaRoot = path.join(root, "components", "dist", "media");
  assert.equal(deriver.deriveSlugMedia(mediaRoot, "decoy"), null);
});

test("buildMediaIndex sorts slugs ASCII for byte-stable output", function () {
  var root = tmpRepo();
  seedMedia(root, "zebra", ["preview.png"]);
  seedMedia(root, "avatar", ["preview.png"]);
  seedMedia(root, "mango", ["preview.png"]);
  var mediaRoot = path.join(root, "components", "dist", "media");
  var index = deriver.buildMediaIndex(mediaRoot);
  assert.deepEqual(Object.keys(index.media), ["avatar", "mango", "zebra"]);
});

test("buildMediaIndex emits a schema-valid object", function () {
  var root = tmpRepo();
  seedMedia(root, "avatar", ["preview.png"]);
  seedMedia(root, "button", ["preview.png"]);
  var mediaRoot = path.join(root, "components", "dist", "media");
  var index = deriver.buildMediaIndex(mediaRoot);
  var validate = compiledSchema();
  assert.equal(validate(index), true, JSON.stringify(validate.errors));
});

test("buildMediaIndex returns null when media root is absent", function () {
  // Fresh tmp dir with no components/dist/media/ at all.
  var root = fs.mkdtempSync(path.join(os.tmpdir(), "media-idx-empty-"));
  var mediaRoot = path.join(root, "components", "dist", "media");
  assert.equal(deriver.buildMediaIndex(mediaRoot), null);
});

test("writeMediaIndex creates _index.json and reports slug count", function () {
  var root = tmpRepo();
  seedMedia(root, "avatar", ["preview.png"]);
  seedMedia(root, "button", ["preview.png"]);
  var r = deriver.writeMediaIndex(root);
  assert.equal(r.wrote, true);
  assert.equal(r.slugCount, 2);
  assert.ok(fs.existsSync(r.path), "_index.json must exist on disk");
  var parsed = JSON.parse(fs.readFileSync(r.path, "utf8"));
  assert.equal(parsed._schema_version, 1);
  assert.deepEqual(Object.keys(parsed.media), ["avatar", "button"]);
});

test("writeMediaIndex is idempotent (no rewrite when content unchanged)", function () {
  var root = tmpRepo();
  seedMedia(root, "avatar", ["preview.png"]);
  var r1 = deriver.writeMediaIndex(root);
  assert.equal(r1.wrote, true);
  var stat1 = fs.statSync(r1.path);
  // Small sleep so mtime would change if rewritten.
  var until = Date.now() + 20;
  while (Date.now() < until) {
    /* spin */
  }
  var r2 = deriver.writeMediaIndex(root);
  assert.equal(r2.wrote, false, "second run must not rewrite stable output");
  var stat2 = fs.statSync(r2.path);
  assert.equal(stat2.mtimeMs, stat1.mtimeMs, "mtime untouched on no-op run");
});

test("writeMediaIndex is no-op when media root absent (portable)", function () {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), "media-idx-empty-"));
  var r = deriver.writeMediaIndex(root);
  assert.equal(r.wrote, false);
  assert.equal(r.path, null);
  assert.equal(r.slugCount, 0);
});

test("media-only components surface in the index (architectural promise)", function () {
  // The whole reason this layer exists: Avatar (and similar) have media
  // on disk but no guideline doc at components/dist/guidelines/avatar.json.
  // The index MUST include them regardless of guideline coverage.
  var root = tmpRepo();
  seedMedia(root, "avatar", ["preview.png"]);
  // Critically: do NOT create components/src/avatar/ or any guideline file.
  var r = deriver.writeMediaIndex(root);
  var parsed = JSON.parse(fs.readFileSync(r.path, "utf8"));
  assert.ok(
    parsed.media.avatar,
    "media-only component must appear in the index",
  );
  assert.equal(
    parsed.media.avatar.preview,
    "components/dist/media/avatar/preview.png",
  );
});
