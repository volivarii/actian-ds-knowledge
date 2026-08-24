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

test("sticky-footer's authored follow-through is done, and what still matches is prose (#562)", function () {
  // This was "the real repo still names sticky-footer, so that rename is NOT
  // absorbable", asserting hits.length >= 2 and naming "the renderer case and
  // the app-context pattern". The 2026-08-24 sync (#526) carried that rename
  // through, and the test went on passing: the renderer case is renamed and no
  // components[] entry names the slug, but the two files still match on
  // HISTORICAL PROSE describing the rename.
  //
  // So it passed with its stated premise false, and the "now absorbable"
  // transition it was written to detect could never fire. It asserts the real
  // state instead, and pins the prose over-match as the defect it is.
  var repo = path.join(__dirname, "..");

  var live = pre.authoredReferences(repo, "sticky-footer").filter(function (h) {
    var body = fs.readFileSync(h.file, "utf8");
    // A components[] entry, not a sentence mentioning the slug. Both YAML
    // shapes: a block sequence item, and the flow style the schema also accepts
    // (`components: [page-header, sticky-footer]`), which a block-only pattern
    // would miss while the guard reported the follow-through done.
    var frontmatter = (/^---\n([\s\S]*?)\n---/.exec(body) || [])[1] || "";
    return (
      /(^|[\s\[,])sticky-footer(\s*$|[\s\],])/m.test(frontmatter) ||
      /case "sticky-footer"/.test(body)
    );
  });
  assert.deepEqual(
    live,
    [],
    "the follow-through is done: no components[] entry and no renderer case may name it",
  );

  var hits = pre.authoredReferences(repo, "sticky-footer");
  assert.ok(
    hits.length > 0,
    "expected the prose over-match to still be demonstrable; if this is empty, " +
      "#562 is fixed or the notes were deleted, and this test should be retired",
  );
});
