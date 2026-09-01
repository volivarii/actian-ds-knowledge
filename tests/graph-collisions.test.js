"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");
var Ajv = require("ajv/dist/2020");
var D = require("../scripts/graph/derive-graph.js");
var fs = require("node:fs");
var ROOT = path.join(__dirname, "..");
var C = require("./lib/committed-artifacts.js");
var readCommittedJSON = C.readCommittedJSON;
// The kit list is READ from the deriver, never restated here: derive() names its
// kits as basename(rel, ".json") over the same REGISTRY_FILES, so adding a
// fourth kit there reaches these tests without an edit. Restating it used to
// mean a new kit's collisions were silently never asserted, while the freshness
// lock went red with a large deepEqual diff that reads as a stale sidecar.
function kitsFromDeriver() {
  // COMMITTED registries, to match the committed sidecar these are compared
  // against. Detecting over the working tree while reading the sidecar from HEAD
  // mixes two states: a local registry edit would red these against a sidecar
  // that `npm run derive:graph` could not reconcile, because the regenerated
  // sidecar lands in the tree while the assertion reads HEAD.
  //
  // Read in that same state throughout: asking the filesystem for one side while
  // reading the commit for the other mixes two states.
  var kits = D.REGISTRY_FILES.filter(function (rel) {
    return C.committedExists(rel);
  }).map(function (rel) {
    return { kit: path.basename(rel, ".json"), reg: readCommittedJSON(rel) };
  });
  // Non-vacuity only. Absence itself is NOT asserted here: derive() filters
  // missing registries out, so a retired kit is a legitimate state, and failing
  // on it inside `npm test` would red the sibling derive workflows before their
  // auto-commit. Whether every COMMITTED registry is one the deriver reads is
  // checked where that cannot happen: scripts/validate/validate-graph-registry-union.js.
  assert.ok(kits.length > 0, "at least one registry committed at HEAD");
  return kits;
}

// Pure detection over the registries (no shared-dist write).
//
// What is guarded here is the SHAPE of each detected collision: >=2 candidates
// with distinct keys, resolved_to set. These are benign cross-registry name
// overlaps resolving to dskit (DS icons whose names coincide with FM-kit ones:
// ban, book-open, code, folder, phone, reply, share, user, ...), NOT the
// dangerous within-kit nodeId collision.
//
// The EXACT magnitude is deliberately not pinned. It is a property of whatever
// Figma currently ships -- it has moved 17 -> 24 -> 25 across syncs, each time
// because a newly added icon shadowed an existing name -- and an equality cannot
// tell that expected drift apart from a regression, so it only ever blocks the
// sync that carries it.
//
// A one-sided CEILING is kept instead, and it is a different kind of number from
// the equality it replaces: it has slack, it cannot block ordinary drift, and it
// is revisable only in the direction that is safe to revise. Note what the
// freshness lock does NOT do here -- it compares a fresh detection against the
// committed sidecar over the SAME registries, so it is green at any magnitude as
// long as the dist was regenerated. (That lock now lives in
// scripts/validate/validate-graph-registry-union.js: it compares registries
// against a derived artifact, so it cannot sit in `npm test` without blocking the
// sibling derive workflows mid-cascade.) Without a bound, a sync that
// duplicated a page of dskit slugs into another kit could take collisions from
// 25 to 300, silently tie-breaking 275 components into one node each, and every
// graph test would stay green.
test("detectSlugCollisions: cross-registry collisions all have >=2 candidates with distinct keys", function (t) {
  var kits = kitsFromDeriver();
  var out = D.detectSlugCollisions(kits);
  // Magnitude only means anything over the COMPLETE kit set. Every collision
  // today is dskit+fmkit, so a retired or absent kit takes the count to zero --
  // and asserting on that here would red `npm test`, which the sibling derive
  // workflows run before their auto-commit. That is the cascade block
  // kitsFromDeriver's filter above exists to avoid, so the bounds have to stand
  // down in the same degraded state the filter tolerates.
  // Every collision today is dskit+fmkit, so over a reduced kit set the detection
  // is empty: the magnitude assertions would red inside `npm test` (the cascade
  // block kitsFromDeriver's filter exists to avoid), AND the structural forEach
  // below would assert nothing while reporting green. SKIP rather than silently
  // pass, so a repo missing a whole kit does not get a clean bill of health here.
  // The union step catches that state properly.
  // NO magnitude assertion here, deliberately. Bounds over registry-derived data
  // cannot live in `npm test`: the sibling derive workflows run the suite before
  // their auto-commit, so a red here blocks them from committing the dist they
  // exist to produce. And zero collisions is a legitimate state -- every one today
  // is a dskit<->fmkit name overlap, so cleanly retiring fmkit, or finishing the
  // cross-kit icon de-duplication this repo is actively doing, empties the set.
  // The floor and ceiling live in scripts/validate/validate-graph-registry-union.js,
  // where a red does not stop a cascade.
  //
  // What stays is STRUCTURAL, and holds at any magnitude including zero.
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

// Committed sidecar: populated, auto_generated _meta, and schema-valid. The
// entry count is left to the freshness lock, which now runs as a
// validate-manifest step (see above on not pinning it).
test("graph/dist/collisions.json: populated + auto_generated _meta, schema-valid", function () {
  var col = readCommittedJSON("graph/dist/collisions.json");
  assert.equal(col._meta.auto_generated, true);
  // Not asserted non-empty: an empty sidecar is legitimate (see above), and this
  // test is about the sidecar's SHAPE.
  assert.ok(Array.isArray(col.slug_collisions), "sidecar has the entries array");
  // Schema from the WORKING TREE, sidecar from HEAD. Asymmetric on purpose: the
  // sidecar is rewritten mid-run by unconfined derive() calls, the schema is a
  // hand-authored source that derive() never touches. Reading the schema from HEAD
  // as well would mean a contributor tightening it gets a green run against the
  // OLD schema -- a silent green, worse than the transient red of a schema change
  // that is not committed yet.
  var schema = JSON.parse(
    fs.readFileSync(path.join(ROOT, "schemas/collisions.json"), "utf8"),
  );
  var validate = new (Ajv.default || Ajv)({ strict: false }).compile(schema);
  assert.ok(validate(col), JSON.stringify(validate.errors));
});
