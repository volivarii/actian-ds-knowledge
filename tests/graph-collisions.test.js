"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var Ajv = require("ajv/dist/2020");
var D = require("../scripts/graph/derive-graph.js");
var ROOT = path.join(__dirname, "..");
function readJSON(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

// Pure detection over the registries (no shared-dist write).
// Count moved 17 -> 24 with the 2026-07-23 sync, which added 42 DS icons whose
// names coincide with FM-kit icons (ban, book-open, code, folder, phone, reply,
// share, user, ...). All are benign cross-registry name overlaps resolving to
// dskit, NOT the dangerous within-kit nodeId collision; the structural
// assertions below (>=2 candidates, distinct keys, resolved_to set) are what
// actually guards that, the count is a tripwire on top.
test("detectSlugCollisions: 24 cross-registry collisions with distinct keys", function () {
  var kits = ["dskit", "fmkit", "metakit"].map(function (k) {
    return {
      kit: k,
      reg: readJSON("components/dist/registries/" + k + ".json"),
    };
  });
  var out = D.detectSlugCollisions(kits);
  assert.equal(out.slug_collisions.length, 24);
  out.slug_collisions.forEach(function (c) {
    assert.ok(c.candidates.length >= 2);
    assert.ok(
      new Set(
        c.candidates.map(function (x) {
          return x.key;
        }),
      ).size > 1,
    );
    assert.equal(typeof c.resolved_to, "string");
  });
  var ad = out.slug_collisions.find(function (c) {
    return c.slug === "arrow-down";
  });
  assert.ok(
    ad &&
      ad.candidates.some(function (x) {
        return x.kit === "dskit";
      }) &&
      ad.candidates.some(function (x) {
        return x.kit === "fmkit";
      }),
  );
});

// Committed sidecar: 24 entries + auto_generated _meta, and it validates
// against its schema.
test("graph/dist/collisions.json: 24 entries + auto_generated _meta, schema-valid", function () {
  var col = readJSON("graph/dist/collisions.json");
  assert.equal(col._meta.auto_generated, true);
  assert.equal(col.slug_collisions.length, 24);
  var schema = readJSON("schemas/collisions.json");
  var validate = new (Ajv.default || Ajv)({ strict: false }).compile(schema);
  assert.ok(validate(col), JSON.stringify(validate.errors));
});

// Freshness lock: the committed sidecar must equal a fresh detection over the
// current registries. This is the one regression the graph drift guard cannot
// catch on its own: if derive() stopped WRITING collisions.json, the committed
// copy would silently go stale against the registries; this deepEqual catches
// that divergence (and is isolation-safe: pure detection + read-only, no
// derive() write to the shared dist).
test("graph/dist/collisions.json matches a fresh detectSlugCollisions over the current registries (freshness lock)", function () {
  var kits = ["dskit", "fmkit", "metakit"].map(function (k) {
    return {
      kit: k,
      reg: readJSON("components/dist/registries/" + k + ".json"),
    };
  });
  var fresh = D.detectSlugCollisions(kits).slug_collisions;
  var committed = readJSON("graph/dist/collisions.json").slug_collisions;
  assert.deepEqual(committed, fresh);
});
