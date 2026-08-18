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

// Collect ONLY the entries under `on:` ... `paths:`. Reading every quoted list
// item in the file would count a future `paths-ignore:` entry as watched, which
// is a false all-clear in a gate whose whole purpose is preventing false
// all-clears, and it would count quoted strings from unrelated steps too.
function watchedPaths(yml) {
  var lines = yml.split("\n");
  var out = [];
  var inOn = false;
  var pathsIndent = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^\S/.test(line)) inOn = /^on:/.test(line);
    if (!inOn) continue;
    var m = line.match(/^(\s*)paths:\s*$/);
    if (m) {
      pathsIndent = m[1].length;
      continue;
    }
    if (pathsIndent === null) continue;
    if (/^\s*(#.*)?$/.test(line)) continue; // blank or comment, still inside
    var indent = line.match(/^\s*/)[0].length;
    if (indent <= pathsIndent) {
      pathsIndent = null; // a sibling key ended the list
      i--;
      continue;
    }
    var item = line.match(/^\s*-\s*'([^']+)'\s*$/);
    if (item) out.push(item[1]);
  }
  return out;
}

test("watchedPaths reads on.paths and nothing else", function () {
  // The control that matters: paths-ignore must never read as watched.
  var yml = [
    "on:",
    "  pull_request:",
    "    paths:",
    "      # a comment inside the list",
    "      - 'components/dist/guidelines/**'",
    "",
    "      # a blank line above must not end the list: it would silently drop every",
    "      # path below it, which is the false all-clear this helper exists to stop",
    "      - 'components/dist/categories/**'",
    "    paths-ignore:",
    "      - 'components/dist/categories/**'",
    "",
    "jobs:",
    "  derive:",
    "    steps:",
    "      - run: echo 'components/dist/anatomy/**'",
    "",
  ].join("\n");
  assert.deepEqual(
    watchedPaths(yml),
    ["components/dist/guidelines/**", "components/dist/categories/**"],
    "paths-ignore and unrelated quoted strings must not count as watched, and a blank line must not truncate the list",
  );
});

test("render-derive.yml watches every path this producer reads", function () {
  // The trigger list and the producer's inputs are the same fact written twice,
  // and until #567 they disagreed: usage-notes derives from
  // components/dist/guidelines/ and components/dist/categories/, neither of which
  // was watched. It regenerated anyway, but only because guidelines-derive.yml
  // bumps knowledge_version in paths-manifest.json, which IS watched. Correct by
  // coincidence, and there is no committed-vs-fresh drift guard on usage-notes to
  // red a required check when the coincidence stops holding. Same assertion, and
  // the same watchedBy semantics, as tests/render/derive-contract.test.js.
  var D = require("../../scripts/render/derive-usage-notes.js");
  var yml = fs.readFileSync(
    path.resolve(__dirname, "../../.github/workflows/render-derive.yml"),
    "utf8",
  );
  var triggers = watchedPaths(yml);

  function watchedBy(triggerList, input) {
    return triggerList.some(function (t) {
      if (t === input) return true;
      // Only `dir/**` covers what is beneath it, by whole path segments, so a
      // truncation cannot pass: 'components/dist/guideline/**' does not cover
      // 'components/dist/guidelines/'.
      if (t.slice(-3) !== "/**") return false;
      return input.indexOf(t.slice(0, -2)) === 0;
    });
  }

  // Negative controls first, so this cannot pass by being permissive.
  assert.equal(watchedBy(["*"], "components/dist/guidelines/"), false);
  assert.equal(
    watchedBy(["components/dist/guideline/**"], "components/dist/guidelines/"),
    false,
    "a truncated path must not count as watching the real one",
  );
  assert.equal(
    watchedBy(["components/dist/guidelines/**"], "components/dist/guidelines/"),
    true,
    "positive control: the real trigger shape does match",
  );

  assert.ok(D.INPUTS.length, "the producer must declare what it reads");
  D.INPUTS.forEach(function (input) {
    assert.ok(
      watchedBy(triggers, input),
      input + " is a derive input render-derive.yml does not watch",
    );
  });
});

test("pruneNotes keys on the guidelines dist, not on what emitted a note", function () {
  // THE REGRESSION THIS PREVENTS. deriveAll drops any slug whose note fails
  // hasBody, and chat-with-ai-steward is a real guideline that does exactly that
  // today. Pruning against the emitted set would delete that slug's shipped note,
  // and render-derive.yml would bump, commit, tag and vendor the deletion with a
  // green run throughout. Only a slug LEAVING the guidelines dist may remove one.
  var known = require("../../scripts/render/derive-usage-notes.js").guidelineSlugs();
  var emitted = Object.keys(deriveAll({}));
  var thin = known.filter(function (s) {
    return emitted.indexOf(s) < 0;
  });
  assert.ok(
    thin.length,
    "expected at least one guideline that emits no note, or this test has lost its subject",
  );

  var dir = tmpNotesDir({ "chat-with-ai-steward.md": "shipped", "button.md": "shipped" });
  assert.deepEqual(
    pruneNotes(dir, known),
    [],
    "a guideline that emits no note keeps whatever is committed for it",
  );
  assert.deepEqual(
    pruneNotes(dir, emitted).sort(),
    ["chat-with-ai-steward.md"],
    "and keying on the emitted set is what would have deleted it",
  );
});

test("pruneNotes: refuses a bulk deletion, which is a broken input not a retirement", function () {
  // Refusing only at EXACTLY zero known slugs left the realistic case open: a
  // partial guidelines dist (3 of 61 JSONs after a bad checkout or a half-finished
  // upstream derive) reads as 58 slugs retiring at once, and render-derive.yml
  // would bump, commit, tag and vendor that deletion.
  var files = {};
  for (var i = 0; i < 15; i++) files["gone-" + i + ".md"] = "shipped";
  files["kept.md"] = "shipped";
  var dir = tmpNotesDir(files);

  assert.throws(
    function () {
      pruneNotes(dir, ["kept"]);
    },
    /refusing to delete 15 notes in one run/,
  );
  assert.equal(
    fs.readdirSync(dir).length,
    16,
    "nothing is deleted before it throws, so a partial input cannot half-wipe the tree",
  );
});

test("pruneNotes: a handful still prunes, so the ceiling is not a blanket refusal", function () {
  var dir = tmpNotesDir({
    "kept.md": "shipped",
    "gone-a.md": "fossil",
    "gone-b.md": "fossil",
  });
  assert.deepEqual(pruneNotes(dir, ["kept"]).sort(), ["gone-a.md", "gone-b.md"]);
  assert.deepEqual(fs.readdirSync(dir), ["kept.md"]);
});
