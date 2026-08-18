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
