"use strict";

// #552: a rename is absorbable only when nothing AUTHORED still names the old
// slug.
//
// The identity ledger makes RESOLUTION survive a rename. It cannot make authored
// references correct. `ds-html-map.js` has `case "sticky-footer"`, which must
// become `action-bar` by hand, and `filter-groups-form.md` lists the slug in a
// components[] array that derive-graph throws on. Calling such a rename additive
// opens an auto-merge PR that can never go green, which is strictly WORSE than
// the breaking path, because breaking at least produces a tracking issue a human
// acts on.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var pre = require("../scripts/sync/rename-preconditions.js");

function tmpRepo() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "rename-pre-"));
  pre.AUTHORED_SURFACES.forEach(function (s) {
    var full = path.join(dir, s.path);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (!s.glob) fs.writeFileSync(full, "");
    else fs.mkdirSync(full, { recursive: true });
  });
  return dir;
}

test("a slug still named in the renderer switch blocks absorption", function () {
  var dir = tmpRepo();
  fs.writeFileSync(
    path.join(dir, "components/render/renderer/html-renderers/ds-html-map.js"),
    'switch (x) {\n  case "sticky-footer": {\n    return "";\n  }\n}',
  );
  var hits = pre.authoredReferences(dir, "sticky-footer");
  assert.equal(hits.length, 1);
  assert.match(hits[0].file, /ds-html-map\.js$/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a slug still listed by an app-context pattern blocks absorption", function () {
  var dir = tmpRepo();
  fs.writeFileSync(
    path.join(dir, "app-context/src/patterns/filter-groups-form.md"),
    "---\nslug: filter-groups-form\ncomponents:\n  - sticky-footer\n---\n",
  );
  var hits = pre.authoredReferences(dir, "sticky-footer");
  assert.equal(hits.length, 1);
  assert.match(hits[0].file, /filter-groups-form\.md$/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a slug nothing authored names is absorbable", function () {
  var dir = tmpRepo();
  assert.deepEqual(pre.authoredReferences(dir, "sticky-footer"), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a longer slug that merely CONTAINS the retired one does not block it", function () {
  // `card` must not be blocked by `card-for-items`, or every short slug is
  // permanently unabsorbable.
  var dir = tmpRepo();
  fs.writeFileSync(
    path.join(dir, "components/render/renderer/html-renderers/ds-html-map.js"),
    'case "card-for-items": {}',
  );
  assert.deepEqual(pre.authoredReferences(dir, "card"), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("every declared surface still exists in the real repo", function () {
  // The list is authored, so it rots. A surface that moved would make this
  // precondition silently scan nothing and wave every rename through, which is
  // the false all-clear it exists to prevent.
  var repoRoot = path.join(__dirname, "..");
  var missing = pre.AUTHORED_SURFACES.filter(function (s) {
    return !fs.existsSync(path.join(repoRoot, s.path));
  }).map(function (s) {
    return s.path;
  });
  assert.deepEqual(missing, []);
  assert.ok(pre.AUTHORED_SURFACES.length > 0, "the list must not be empty");
});

test("the real repo still names sticky-footer, so that rename is NOT absorbable", function () {
  // The live case this was built for. If this ever goes empty, the authored
  // follow-through has been done and the rename becomes absorbable.
  var hits = pre.authoredReferences(path.join(__dirname, ".."), "sticky-footer");
  assert.ok(
    hits.length >= 2,
    "expected the renderer case and the app-context pattern: " +
      JSON.stringify(hits),
  );
});
