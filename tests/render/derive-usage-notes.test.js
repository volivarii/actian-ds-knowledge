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
// Every line of the block a `key:` introduces. A line belongs to the block while
// it is indented deeper than the key, and a LIST ITEM at the key's own indent
// belongs too, because that is legal YAML and the workflow could be reformatted
// that way tomorrow. Blank and comment lines never end a block: a blank line
// inside the list used to truncate it, silently dropping every path below.
function blockUnder(lines, key) {
  var start = -1;
  var keyIndent = 0;
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(/^(\s*)([\w-]+):\s*$/);
    if (m && m[2] === key) {
      start = i + 1;
      keyIndent = m[1].length;
      break;
    }
  }
  if (start < 0) return [];
  var out = [];
  for (var j = start; j < lines.length; j++) {
    var line = lines[j];
    if (/^\s*(#.*)?$/.test(line)) {
      out.push(line);
      continue;
    }
    var isItem = /^\s*-\s/.test(line);
    if (!isItem && line.match(/^\s*/)[0].length <= keyIndent) break;
    out.push(line);
  }
  return out;
}

// The paths watched for ONE event. Scoping to the event matters: render-derive
// runs on pull_request, and collecting every `paths:` under `on:` would let an
// input listed only under a later `push:` trigger satisfy the gate while PRs
// stopped regenerating the notes. `paths-ignore:` is a different key and is never
// collected, which is the case that would otherwise report a path as watched at
// the exact moment GitHub is told to ignore it.
function watchedPaths(yml, event) {
  var paths = blockUnder(blockUnder(blockUnder(yml.split("\n"), "on"), event), "paths");
  return paths
    .map(function (l) {
      // Any quoting, including none. All three are valid YAML, and a reformat this
      // gate could not read would fail with "is a derive input render-derive.yml
      // does not watch" while GitHub is in fact watching it, pointing a reader at
      // entirely the wrong cause.
      return (
        l.match(/^\s*-\s*['"]([^'"]+)['"]\s*$/) || l.match(/^\s*-\s*(\S+)\s*$/)
      );
    })
    .filter(Boolean)
    .map(function (m) {
      return m[1];
    });
}

test("watchedPaths reads one event's paths, and only those", function () {
  // Every branch here is a way this gate could report a path as watched when it
  // is not, or vice versa. All were found by review or by mutation, none by
  // reading the helper.
  var yml = [
    "on:",
    "  pull_request:",
    "    paths:",
    "      # a comment inside the list",
    "      - 'components/dist/guidelines/**'",
    "",
    "      # a blank line above must not end the list: it would silently drop every",
    "      # path below it, which is the false all-clear this helper exists to stop",
    '      - "components/dist/categories/**"',
    "    paths-ignore:",
    "      - 'components/dist/anatomy/**'",
    "  push:",
    "    paths:",
    "      - 'components/dist/icons/**'",
    "",
    "jobs:",
    "  derive:",
    "    steps:",
    "      - run: echo 'components/dist/graphics/**'",
    "",
  ].join("\n");

  var pr = watchedPaths(yml, "pull_request");
  assert.deepEqual(
    pr,
    ["components/dist/guidelines/**", "components/dist/categories/**"],
    "collects both quote styles, across a blank line and comments",
  );
  assert.ok(
    pr.indexOf("components/dist/anatomy/**") < 0,
    "paths-ignore must never read as watched: that is the inversion this gate exists to prevent",
  );
  assert.ok(
    pr.indexOf("components/dist/icons/**") < 0,
    "another event's paths must not satisfy the gate; render-derive runs on pull_request, " +
      "so an input listed only under push would leave PRs not regenerating",
  );
  assert.ok(
    pr.indexOf("components/dist/graphics/**") < 0,
    "a quoted string in an unrelated step is not a trigger",
  );
  assert.deepEqual(
    watchedPaths(yml, "push"),
    ["components/dist/icons/**"],
    "and the event argument actually selects, rather than being ignored",
  );
});

test("watchedPaths reads an unquoted path, which is the commonest YAML style", function () {
  // Quotes were required, so `- components/dist/guidelines/**` read as unwatched.
  // It fails closed rather than open, but the message it fails with names the
  // wrong cause: it would say the input is not watched while GitHub is watching it.
  var yml = [
    "on:",
    "  pull_request:",
    "    paths:",
    "      - components/dist/guidelines/**",
    "      - 'components/dist/categories/**'",
    "",
  ].join("\n");
  assert.deepEqual(watchedPaths(yml, "pull_request"), [
    "components/dist/guidelines/**",
    "components/dist/categories/**",
  ]);
});

test("watchedPaths tolerates list items at the key's own indent", function () {
  // Legal YAML, and a reformat of render-derive.yml into this shape would
  // otherwise fail the gate with "is a derive input render-derive.yml does not
  // watch", pointing the reader at the wrong cause entirely.
  var yml = [
    "on:",
    "  pull_request:",
    "    paths:",
    "    - 'components/dist/guidelines/**'",
    "",
  ].join("\n");
  assert.deepEqual(watchedPaths(yml, "pull_request"), [
    "components/dist/guidelines/**",
  ]);
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
  var triggers = watchedPaths(yml, "pull_request");

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
  // hasBody, so keying the prune on the emitted set would delete that slug's
  // shipped note, and render-derive.yml would bump, commit, tag and vendor the
  // deletion on a green run. Only a slug LEAVING the guidelines dist removes one.
  //
  // Stated synthetically on purpose. An earlier version asserted this against the
  // live tree and named the one guideline that is thin today, which meant a content
  // author fleshing out that component's usage.md would have reddened a required
  // check, with a message naming no cause they could act on.
  var known = ["button", "thin-one"];
  var emitted = ["button"]; // thin-one exists, but its note fails hasBody
  var files = { "button.md": "shipped", "thin-one.md": "shipped" };

  assert.deepEqual(
    pruneNotes(tmpNotesDir(files), known),
    [],
    "a guideline that emits no note keeps whatever is committed for it",
  );
  assert.deepEqual(
    pruneNotes(tmpNotesDir(files), emitted),
    ["thin-one.md"],
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

test("categoryBody: an unresolvable category yields nothing, and that is filed not fixed", function () {
  // Pinning current behaviour, not endorsing it. An unresolvable category silently
  // costs a note its "## Category guidance" section (58 of the 60 carry it), which
  // is a REWRITE rather than a deletion, so neither the empty-set guard nor
  // PRUNE_CEILING can ever see it. Making it throw was tried and reverted:
  // build-bundle.js catches around usageNote, so the same broken input would have
  // shipped an ENTIRELY empty note, degrading worse than the bug being prevented.
  var { categoryBody } = require("../../scripts/render/derive-usage-notes.js");
  assert.equal(categoryBody("no-such-category-exists"), "");
});

test("categoryBody: declaring no category is a real state, not an error", function () {
  var { categoryBody } = require("../../scripts/render/derive-usage-notes.js");
  assert.equal(categoryBody(""), "");
  assert.equal(categoryBody(undefined), "");
});

test("categoryBody: a real category still resolves, so the throw is not blanket", function () {
  var { categoryBody } = require("../../scripts/render/derive-usage-notes.js");
  assert.ok(
    categoryBody("feedback").length > 0,
    "positive control: the category rationale 58 of 60 notes depend on still loads",
  );
});
