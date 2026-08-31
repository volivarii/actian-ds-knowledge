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

test("sticky-footer's authored follow-through is done", function () {
  // The one assertion worth keeping: no components[] entry and no renderer case
  // may name the old slug. That is what makes the rename absorbable, and it is
  // checked against the real repo rather than a fixture.
  //
  // This test also used to pin #562 by asserting the prose over-match was still
  // demonstrable on this slug. #562 is not fixed -- authoredReferences still
  // matches a sentence as if it were a reference -- but the demonstration is
  // gone: the two app-context records carried paragraphs narrating this rename,
  // those paragraphs blocked the next rename through the very over-match they
  // demonstrated, and they were retrospective prose that does not belong in an
  // authored record. A guard that needs a standing rule to be broken to stay
  // green guards nothing, so the pin is retired and #562 carries the defect.
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
});

// ---------------------------------------------------------------------------
// #562: the gate reads STRUCTURE, not raw text.
//
// The rationale above is about structured references: a `case` label feeds
// RENDER_SLUGS, a components[] entry makes derive-graph throw. Prose fails
// neither gate, so blocking on it prevents nothing while making every future
// rename harder. The worse effect is that it penalises the exact habit this
// repo wants: the more carefully somebody documents a migration, the more
// firmly they block it.
//
// The exclusions are of PROSE keys, never an allow-list of slug-bearing keys.
// An unrecognised structured field is still scanned and still blocks, so the
// list cannot rot into a false all-clear, which is the one failure this module
// exists to prevent.

test("a slug named only in a markdown BODY does not block absorption", function () {
  var dir = tmpRepo();
  fs.writeFileSync(
    path.join(dir, "app-context/src/patterns/notes.md"),
    "---\nslug: notes\ncomponents:\n  - toast\n---\n" +
      "This pattern used to be called sticky-footer before the rename.\n",
  );
  assert.deepEqual(pre.authoredReferences(dir, "sticky-footer"), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a slug named only in a prose frontmatter key does not block absorption", function () {
  var dir = tmpRepo();
  fs.writeFileSync(
    path.join(dir, "app-context/src/patterns/notes.md"),
    "---\nslug: notes\nwhen: >-\n  Use this rather than sticky-footer, which\n" +
      "  no longer exists.\ncomponents:\n  - toast\n---\nBody.\n",
  );
  assert.deepEqual(pre.authoredReferences(dir, "sticky-footer"), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a slug in an inline note: value does not block absorption", function () {
  var dir = tmpRepo();
  fs.writeFileSync(
    path.join(dir, "components/src/categories/overlays.md"),
    "---\nslug: overlays\nmotion_refs:\n" +
      "  - { ref: drawer-open-close, note: sticky-footer slides on axis }\n---\nBody.\n",
  );
  assert.deepEqual(pre.authoredReferences(dir, "sticky-footer"), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a slug in a structured frontmatter value STILL blocks absorption", function () {
  // The whole point of the gate. components[] is what derive-graph throws on.
  var dir = tmpRepo();
  fs.writeFileSync(
    path.join(dir, "app-context/src/patterns/notes.md"),
    "---\nslug: notes\ncomponents:\n  - sticky-footer\n---\n" +
      "A body that says nothing about it.\n",
  );
  var hits = pre.authoredReferences(dir, "sticky-footer");
  assert.equal(hits.length, 1, "a components[] entry must still block");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a slug in an unrecognised structured key STILL blocks absorption", function () {
  // The exclusions are of prose keys only. A field nobody has classified must
  // block, so a new slug-bearing field cannot arrive as a silent all-clear.
  var dir = tmpRepo();
  fs.writeFileSync(
    path.join(dir, "components/src/categories/overlays.md"),
    "---\nslug: overlays\nsome_new_field:\n  - sticky-footer\n---\nBody.\n",
  );
  assert.equal(pre.authoredReferences(dir, "sticky-footer").length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a slug named only in a JS comment does not block absorption", function () {
  var dir = tmpRepo();
  fs.writeFileSync(
    path.join(dir, "components/render/renderer/html-renderers/ds-html-map.js"),
    "// 2026-08-12 rename of sticky-footer -> action-bar; the case below\n" +
      "/* also sticky-footer, in a block comment */\n" +
      'switch (x) { case "action-bar": return ""; }\n',
  );
  assert.deepEqual(pre.authoredReferences(dir, "sticky-footer"), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a case label STILL blocks even when a comment also names the slug", function () {
  var dir = tmpRepo();
  fs.writeFileSync(
    path.join(dir, "components/render/renderer/html-renderers/ds-html-map.js"),
    "// the sticky-footer case follows\n" +
      'switch (x) { case "sticky-footer": return ""; }\n',
  );
  assert.equal(pre.authoredReferences(dir, "sticky-footer").length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a markdown file with unparseable frontmatter blocks rather than clearing", function () {
  // Unknown must not read as absent: the module already gets this right for an
  // unreadable file, and a file whose frontmatter cannot be found has to
  // degrade the same way rather than wave the rename through.
  var dir = tmpRepo();
  fs.writeFileSync(
    path.join(dir, "app-context/src/patterns/broken.md"),
    "no frontmatter here at all, but it names sticky-footer\n",
  );
  assert.equal(pre.authoredReferences(dir, "sticky-footer").length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a key that merely CONTAINS a prose key name is still scanned", function () {
  // `note` must not clear `release_note_slugs`, the same boundary reasoning
  // that keeps `card-for-items` from blocking `card`. A prose key matching by
  // substring would silently stop scanning a structured field.
  var dir = tmpRepo();
  fs.writeFileSync(
    path.join(dir, "components/src/categories/overlays.md"),
    "---\nslug: overlays\nrelease_note_slugs:\n  - sticky-footer\n---\nBody.\n",
  );
  assert.equal(
    pre.authoredReferences(dir, "sticky-footer").length,
    1,
    "release_note_slugs is not the prose key `note`",
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a prose key clears only its own value, not the keys after it", function () {
  // The block-scalar walk ends at the first line indented no deeper than the
  // key. Swallowing the NEXT key would be a false all-clear.
  var dir = tmpRepo();
  fs.writeFileSync(
    path.join(dir, "app-context/src/patterns/notes.md"),
    "---\nslug: notes\nwhen: >-\n  A sentence about the old name.\n" +
      "components:\n  - sticky-footer\n---\nBody.\n",
  );
  assert.equal(
    pre.authoredReferences(dir, "sticky-footer").length,
    1,
    "components[] after a block scalar must still be scanned",
  );
  fs.rmSync(dir, { recursive: true, force: true });
});
