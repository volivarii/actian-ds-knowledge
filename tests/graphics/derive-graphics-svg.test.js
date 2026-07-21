"use strict";
var { test } = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var {
  deriveGraphics,
  deriveAndWrite,
} = require("../../scripts/graphics/derive-graphics-svg.js");
var {
  validateGraphics,
} = require("../../scripts/validate/validate-graphics.js");

test("derive produces a slug -> {viewBox, body} read-surface", function () {
  var out = deriveGraphics({
    "actian-pyramid": {
      viewBox: "0 0 40 40",
      body: '<path fill="#0F5FDC" d="M0 0h1v1H0z"/>',
    },
  });
  assert.equal(out.count, 1);
  assert.equal(out.graphics["actian-pyramid"].viewBox, "0 0 40 40");
});

test("validator accepts multicolor and an internal gradient/use reference", function () {
  assert.equal(
    validateGraphics({
      a: { viewBox: "0 0 1 1", body: '<path fill="#0F5FDC"/>' },
    }).ok,
    true,
  );
  // url(#id) gradient refs and href="#id" fragment refs are INTERNAL and legal;
  // real Figma artwork (the pyramid) uses url(#gradient), and future artwork may
  // use <use href="#part">. The gate must not reject these.
  assert.equal(
    validateGraphics({
      a: {
        viewBox: "0 0 1 1",
        body: '<rect fill="url(#g)"/><defs><linearGradient id="g"/></defs>',
      },
    }).ok,
    true,
  );
  assert.equal(
    validateGraphics({ a: { viewBox: "0 0 1 1", body: '<use href="#part"/>' } })
      .ok,
    true,
  );
});

test("validator rejects an EXTERNAL reference (a url or filename), not an internal fragment", function () {
  var img = validateGraphics({
    a: { viewBox: "0 0 1 1", body: '<image href="x.png"/>' },
  });
  assert.equal(img.ok, false);
  assert.match(img.errors.join(), /external reference/i);
  assert.equal(
    validateGraphics({
      a: { viewBox: "0 0 1 1", body: '<image src="y.jpg"/>' },
    }).ok,
    false,
  );
  assert.equal(
    validateGraphics({
      a: { viewBox: "0 0 1 1", body: '<style>@import url("z.css")</style>' },
    }).ok,
    false,
  );
});

test("validator rejects an empty body", function () {
  assert.equal(
    validateGraphics({ a: { viewBox: "0 0 1 1", body: "" } }).ok,
    false,
  );
});

// Regression coverage for the finding that scripts/validate/validate-graphics.js
// was dead code: nothing in the real pipeline (deriveAndWrite, export-graphics-svg.js,
// the graphics-derive.yml workflow) ever called it, despite schemas/graphics.json's
// body description explicitly claiming an external reference "is rejected by
// scripts/validate/validate-graphics.js at derive time". These tests exercise the
// real deriveAndWrite entry point (not a synthetic call to validateGraphics alone)
// against a scratch pluginDir, mirroring the seedPluginDir pattern in
// graphics-round-trip.test.js -- a unit test against validateGraphics directly
// cannot prove the derive pipeline actually invokes it.
function seedScratchCuratedSource(curated) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "derive-graphics-validate-"));
  var curatedDestDir = path.join(dir, "components", "src");
  fs.mkdirSync(curatedDestDir, { recursive: true });
  fs.writeFileSync(
    path.join(curatedDestDir, "graphics-svg.json"),
    JSON.stringify(curated, null, 2),
  );
  return dir;
}

test("deriveAndWrite throws and does NOT write a dist file when a curated entry carries an external reference", function () {
  var dir = seedScratchCuratedSource({
    _schema_version: 1,
    graphics: {
      "actian-pyramid": {
        viewBox: "0 0 40 40",
        body: '<path fill="#0F5FDC" d="M0 0h40v40H0z"/>',
      },
      "bad-external-ref": {
        viewBox: "0 0 10 10",
        body: '<image href="x.png"/>',
      },
    },
  });

  assert.throws(function () {
    deriveAndWrite({ pluginDir: dir });
  }, /external reference/i);

  var outPath = path.join(
    dir,
    "components",
    "dist",
    "graphics",
    "graphics.json",
  );
  assert.equal(
    fs.existsSync(outPath),
    false,
    "a validation failure must refuse to write the dist file, not silently ship the bad content",
  );
});

test("deriveAndWrite still succeeds and writes normally when every curated entry is valid (happy path)", function () {
  var dir = seedScratchCuratedSource({
    _schema_version: 1,
    graphics: {
      "actian-pyramid": {
        viewBox: "0 0 40 40",
        body: '<path fill="#0F5FDC" d="M0 0h40v40H0z"/>',
      },
      "zeenea-logo": {
        viewBox: "0 0 10 10",
        body: '<rect fill="url(#g)"/><defs><linearGradient id="g"/></defs>',
      },
    },
  });

  var result = deriveAndWrite({ pluginDir: dir });

  assert.equal(result.count, 2);
  assert.equal(result.wrote, true);

  var outPath = path.join(
    dir,
    "components",
    "dist",
    "graphics",
    "graphics.json",
  );
  assert.equal(fs.existsSync(outPath), true);
  var written = JSON.parse(fs.readFileSync(outPath, "utf8"));
  assert.equal(Object.keys(written.graphics).length, 2);
});
