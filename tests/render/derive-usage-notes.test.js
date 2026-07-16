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
  var note = usageNote(guideline("button"), { strict: true });
  assert.match(note, /Buttons trigger actions/, "lead paragraph present");
  assert.match(note, /## When to use/);
  assert.match(note, /## Style/);
  assert.ok(
    note.indexOf("When not to use") < 0,
    "no draft 'when not to use' under strict",
  );
  assert.ok(
    note.indexOf("> Note:") < 0,
    "no disclosure when only approved used",
  );
});

test("usageNote: permissive adds draft guidance and a disclosure", function () {
  var note = usageNote(guideline("button")); // default permissive
  assert.match(note, /## When not to use/, "draft usage section present");
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
