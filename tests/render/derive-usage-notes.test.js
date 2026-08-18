"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");
var fs = require("node:fs");
var {
  usageNote,
  deriveAll,
} = require("../../scripts/render/derive-usage-notes.js");

function guideline(slug) {
  return JSON.parse(
    fs.readFileSync(
      path.resolve(
        __dirname,
        "../../components/dist/guidelines/" + slug + ".json",
      ),
      "utf8",
    ),
  );
}

test("usageNote: approved-only draws only approved domains", function () {
  var doc = guideline("button");
  // ASSERT THE SUBJECT. This test only means something while some domain is NOT
  // approved, and it used to rely on `usage` being that domain: it asserted that
  // "When not to use" (usage's heading) stayed out under strict. #566 promoted all
  // 54 usage domains to approved, so that assertion stopped describing an
  // exclusion. `design` is the subject now, and its status is asserted rather than
  // assumed, so the day design is promoted this test fails loudly instead of
  // passing for the wrong reason.
  //
  // Nothing here depends on usage's own status, deliberately. The suite runs in
  // validate-manifest.yml against the COMMITTED dist and in guidelines-derive.yml
  // against a freshly regenerated one, and those two disagree for exactly the life
  // of a promotion PR. A test that reads a status it does not control has to hold
  // in both.
  assert.equal(
    doc.domains.design.status,
    "draft",
    "design is the non-approved domain this test excludes",
  );

  var note = usageNote(doc, { strict: true });
  assert.match(note, /Buttons trigger actions/, "lead paragraph present");
  assert.match(note, /## When to use/);
  assert.match(note, /## Style/);
  assert.ok(
    note.indexOf("## Design") < 0,
    "no draft design guidance under strict",
  );
  assert.ok(
    note.indexOf("> Note:") < 0,
    "no disclosure when only approved used",
  );
});

test("usageNote: permissive adds draft guidance and a disclosure", function () {
  var doc = guideline("button");
  assert.equal(
    doc.domains.design.status,
    "draft",
    "design is the draft domain this test draws",
  );
  var note = usageNote(doc); // default permissive
  assert.match(note, /## Design/, "draft design section present");
  assert.match(note, /> Note:.*DRAFT/, "disclosure names draft");
});

test("usageNote: inherited domains resolve from category-defaults", function () {
  var note = usageNote(guideline("alert-banner")); // design+behavior inherited, category feedback
  assert.match(note, /## Category guidance \(inherited: /);
  assert.match(note, /Severity/, "pulled the feedback category rationale");
  assert.match(note, /INHERITED from category/, "disclosure names inherited");
});

test("usageNote: strips doc-renderer embeds and link markup", function () {
  var note = usageNote(guideline("button"));
  assert.ok(note.indexOf("<Media") < 0, "no <Media/> embeds");
  assert.ok(!/\]\(/.test(note), "no [text](ref) markdown links remain");
});

test("usageNote: no em-dash or en-dash in the generated framing", function () {
  var note = usageNote(guideline("button"), { strict: true });
  var framing = note
    .split("\n")
    .filter(function (l) {
      return /^#|^> Note:/.test(l);
    })
    .join("\n");
  assert.ok(
    framing.indexOf("—") < 0 && framing.indexOf("–") < 0,
    "framing has no em/en dash",
  );
});

test("deriveAll: emits a note for a component with prose, omits one without", function () {
  var all = deriveAll();
  assert.ok(
    all.button && all.button.indexOf("When to use") >= 0,
    "button note present",
  );
  // The emit gate omits a doc with no usable prose: usageNote returns a title-only
  // note (no "## " section), so deriveAll drops it. Verify that gate directly.
  var bodyless = usageNote({
    slug: "ghost",
    component: "Ghost",
    domains: {
      design: { status: "not-started" },
      usage: { status: "inherited" },
    },
  });
  assert.ok(
    !/\n## /.test(bodyless),
    "a prose-less doc yields a body-less note, so deriveAll omits it",
  );
});

// --- pruneNotes -------------------------------------------------------------
// The producer only ever wrote, so a rename left a fossil nothing could reach:
// usage-notes/radio-button.md outlived the radio-button -> radio rename by a
// month and kept asserting "DRAFT (usage)" after #566 made that false. These
// tests run against a temp directory, never the repo tree: this producer
// hardcodes REPO_ROOT for its output, and a prune pointed at the real tree is
// how 179 committed anatomy files were once deleted.

var os = require("node:os");
var { pruneNotes } = require("../../scripts/render/derive-usage-notes.js");

function tmpNotesDir(files) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "usage-notes-"));
  Object.keys(files).forEach(function (name) {
    fs.writeFileSync(path.join(dir, name), files[name]);
  });
  return dir;
}

test("pruneNotes: deletes a note the derive no longer emits", function () {
  var dir = tmpNotesDir({
    "radio.md": "kept",
    "radio-button.md": "fossil",
    "button.md": "kept",
  });
  var pruned = pruneNotes(dir, ["radio", "button"]);
  assert.deepEqual(pruned, ["radio-button.md"], "reports what it removed, by name");
  assert.deepEqual(
    fs.readdirSync(dir).sort(),
    ["button.md", "radio.md"],
    "emitted slugs survive",
  );
});

test("pruneNotes: refuses to prune against an empty slug set", function () {
  // THE WIPE GUARD. An empty emitted set means the input is missing, not that
  // every note should go, and "derive produced nothing so delete everything" is
  // the exact shape of the anatomy prune that removed 179 committed files.
  var dir = tmpNotesDir({ "radio.md": "kept", "button.md": "kept" });
  assert.throws(
    function () {
      pruneNotes(dir, []);
    },
    /refusing to prune against an empty slug set/,
  );
  assert.deepEqual(
    fs.readdirSync(dir).sort(),
    ["button.md", "radio.md"],
    "nothing was deleted before it threw",
  );
});

test("pruneNotes: leaves files that are not notes alone", function () {
  var dir = tmpNotesDir({ "button.md": "kept", "README.txt": "not a note" });
  var pruned = pruneNotes(dir, ["button"]);
  assert.deepEqual(pruned, [], "a non-.md file is not the producer's to delete");
  assert.ok(fs.existsSync(path.join(dir, "README.txt")));
});

test("pruneNotes: a clean tree is a no-op", function () {
  var dir = tmpNotesDir({ "button.md": "kept", "radio.md": "kept" });
  assert.deepEqual(pruneNotes(dir, ["button", "radio"]), []);
  assert.equal(fs.readdirSync(dir).length, 2);
});
