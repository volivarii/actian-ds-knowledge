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
  var schemaPath = path.resolve(__dirname, "..", "schemas", "media-index.json");
  var schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  var ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

test("deriveSlugMedia returns role map when preview.webp present", function () {
  var root = tmpRepo();
  seedMedia(root, "avatar", ["preview.webp"]);
  var mediaRoot = path.join(root, "components", "dist", "media");
  var map = deriver.deriveSlugMedia(mediaRoot, "avatar");
  assert.deepEqual(map, {
    preview: "components/dist/media/avatar/preview.webp",
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
  seedMedia(root, "zebra", ["preview.webp"]);
  seedMedia(root, "avatar", ["preview.webp"]);
  seedMedia(root, "mango", ["preview.webp"]);
  var mediaRoot = path.join(root, "components", "dist", "media");
  var index = deriver.buildMediaIndex(mediaRoot);
  assert.deepEqual(Object.keys(index.media), ["avatar", "mango", "zebra"]);
});

test("buildMediaIndex emits a schema-valid object", function () {
  var root = tmpRepo();
  seedMedia(root, "avatar", ["preview.webp"]);
  seedMedia(root, "button", ["preview.webp"]);
  var mediaRoot = path.join(root, "components", "dist", "media");
  var index = deriver.buildMediaIndex(mediaRoot);
  var validate = compiledSchema();
  assert.equal(validate(index), true, JSON.stringify(validate.errors));
});

test("buildMediaIndex with multi-image role emits a schema-valid object", function () {
  // Bucket C: multi-image roles produce string[] values; the schema must
  // accept oneOf(string | string[]) for per-role values.
  var root = tmpRepo();
  seedMedia(root, "button", ["preview.webp", "parts-0.webp", "parts-1.webp"]);
  var mediaRoot = path.join(root, "components", "dist", "media");
  var index = deriver.buildMediaIndex(mediaRoot);
  // Verify the index itself has the array shape we're about to validate.
  assert.ok(
    Array.isArray(index.media.button.parts),
    "parts must be an array before schema validation",
  );
  var validate = compiledSchema();
  assert.equal(validate(index), true, JSON.stringify(validate.errors));
});

test("schema rejects invalid role values (empty string, empty array, number)", function () {
  var validate = compiledSchema();
  var base = {
    _schema_version: 1,
    _meta: {
      auto_generated: true,
      source: "components/dist/media/",
      do_not_edit:
        "Edit via scripts/sync/sync-media-* phases; CI regenerates this file.",
    },
    media: {},
  };

  // Empty string should fail.
  var badEmptyStr = JSON.parse(JSON.stringify(base));
  badEmptyStr.media.avatar = { preview: "" };
  assert.equal(validate(badEmptyStr), false, "empty string must fail");

  // Empty array should fail (minItems: 1).
  var badEmptyArr = JSON.parse(JSON.stringify(base));
  badEmptyArr.media.avatar = { parts: [] };
  assert.equal(validate(badEmptyArr), false, "empty array must fail");

  // Number should fail.
  var badNumber = JSON.parse(JSON.stringify(base));
  badNumber.media.avatar = { preview: 42 };
  assert.equal(validate(badNumber), false, "number must fail");

  // Duplicate path in a multi-image list should fail (uniqueItems).
  var badDupArr = JSON.parse(JSON.stringify(base));
  badDupArr.media.avatar = {
    parts: [
      "components/dist/media/button/parts-0.webp",
      "components/dist/media/button/parts-0.webp",
    ],
  };
  assert.equal(validate(badDupArr), false, "duplicate path must fail");

  // Array with an empty-string item should fail (items.minLength).
  var badEmptyItemArr = JSON.parse(JSON.stringify(base));
  badEmptyItemArr.media.avatar = { parts: [""] };
  assert.equal(
    validate(badEmptyItemArr),
    false,
    "array with empty-string item must fail",
  );
});

test("buildMediaIndex returns null when media root is absent", function () {
  // Fresh tmp dir with no components/dist/media/ at all.
  var root = fs.mkdtempSync(path.join(os.tmpdir(), "media-idx-empty-"));
  var mediaRoot = path.join(root, "components", "dist", "media");
  assert.equal(deriver.buildMediaIndex(mediaRoot), null);
});

test("writeMediaIndex creates _index.json and reports slug count", function () {
  var root = tmpRepo();
  seedMedia(root, "avatar", ["preview.webp"]);
  seedMedia(root, "button", ["preview.webp"]);
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
  seedMedia(root, "avatar", ["preview.webp"]);
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
  seedMedia(root, "avatar", ["preview.webp"]);
  // Critically: do NOT create components/src/avatar/ or any guideline file.
  var r = deriver.writeMediaIndex(root);
  var parsed = JSON.parse(fs.readFileSync(r.path, "utf8"));
  assert.ok(
    parsed.media.avatar,
    "media-only component must appear in the index",
  );
  assert.equal(
    parsed.media.avatar.preview,
    "components/dist/media/avatar/preview.webp",
  );
});

test("deriveSlugMedia emits multi-image roles as ordered string arrays", function () {
  // Bucket C: parts-0.webp, parts-1.webp → parts: [path0, path1]
  // preview stays a bare string (backward compat with Bucket A).
  var root = tmpRepo();
  seedMedia(root, "button", ["preview.webp", "parts-0.webp", "parts-1.webp"]);
  var mediaRoot = path.join(root, "components", "dist", "media");
  var map = deriver.deriveSlugMedia(mediaRoot, "button");
  assert.deepEqual(map, {
    preview: "components/dist/media/button/preview.webp",
    parts: [
      "components/dist/media/button/parts-0.webp",
      "components/dist/media/button/parts-1.webp",
    ],
  });
});

test("deriveSlugMedia stops the multi-image scan at the first index gap", function () {
  // Contract: the scan increments from 0 and breaks on the first missing
  // index. parts-0 + parts-2 (NO parts-1) must yield ONLY parts-0 — the
  // gap halts enumeration, so parts-2 is never reached.
  var root = tmpRepo();
  seedMedia(root, "card", ["parts-0.webp", "parts-2.webp"]);
  var mediaRoot = path.join(root, "components", "dist", "media");
  var map = deriver.deriveSlugMedia(mediaRoot, "card");
  assert.deepEqual(map, {
    parts: ["components/dist/media/card/parts-0.webp"],
  });
});
