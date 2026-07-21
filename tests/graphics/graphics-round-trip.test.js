"use strict";
var { test } = require("node:test");
var assert = require("node:assert");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var Ajv2020 = require("ajv/dist/2020");
var addFormats = require("ajv-formats");
var { deriveAndWrite } = require("../../scripts/graphics/derive-graphics-svg.js");

// This is the regression guard for the exact failure a whole-branch review
// caught: components/src/graphics-svg.json (the real, on-disk curated
// source, not a synthetic fixture) once shipped as a bare {slug: {...}} map
// with no "graphics" wrapper key. mergeGraphicsSources reads curated.graphics
// to find entries (mirroring how derive-icons-svg.js reads curated.icons), so
// a curated file missing that wrapper silently derived to ZERO slugs -- a
// real CI derive run on that source would have overwritten a correct 7-entry
// dist with an empty one, and validate-schemas.yml would only catch it AFTER
// the fact via graphics.minProperties:1. A unit test against a synthetic
// fixture (like derive-graphics-svg.test.js's deriveGraphics() calls) cannot
// catch this class of bug, because a synthetic fixture is never shaped wrong
// in the way the real committed file was. Only running the REAL source
// through the REAL deriveAndWrite entry point does.

var REPO_ROOT = path.resolve(__dirname, "..", "..");
var REAL_CURATED_SRC = path.join(REPO_ROOT, "components", "src", "graphics-svg.json");

function loadGraphicsSchema() {
  var schemaPath = path.join(REPO_ROOT, "schemas", "graphics.json");
  return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
}

// Copies the real curated source into a scratch pluginDir at the same
// relative path deriveAndWrite expects (components/src/graphics-svg.json),
// then runs the real derive entry point against it -- mirrors the
// sync-icons-phase-gate.test.js seedPluginDir pattern (mkdtempSync scratch
// dir + real dist/derive entry point) used elsewhere in this repo for the
// same "test the real thing end to end" reason.
function deriveRealCuratedSourceInScratchDir() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "graphics-round-trip-"));
  var curatedDestDir = path.join(dir, "components", "src");
  fs.mkdirSync(curatedDestDir, { recursive: true });
  fs.copyFileSync(
    REAL_CURATED_SRC,
    path.join(curatedDestDir, "graphics-svg.json"),
  );
  // No auto-exported base in this scratch dir; deriveAndWrite treats an
  // absent components/src/graphics-svg.auto.json as empty, so the curated
  // file is the only source of entries -- exactly what exposes the bug if
  // the curated file's shape is wrong.
  return deriveAndWrite({ pluginDir: dir });
}

test("the REAL curated graphics-svg.json round-trips through deriveAndWrite into a schema-valid, non-empty dist", function () {
  var result = deriveRealCuratedSourceInScratchDir();

  var ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  var validate = ajv.compile(loadGraphicsSchema());
  var valid = validate(result.dist);

  assert.ok(
    valid,
    "regenerated dist failed schema validation: " +
      JSON.stringify(validate.errors, null, 2),
  );

  // The exact regression this test exists to catch: a curated source whose
  // shape silently derives to an empty graphics map.
  assert.ok(
    Object.keys(result.dist.graphics).length > 0,
    "the real curated source derived to ZERO graphics entries -- its shape " +
      "no longer matches what mergeGraphicsSources reads (curated.graphics)",
  );
});
