"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var os = require("os");
var path = require("path");
var S = require("../scripts/sync/sync-from-figma.js");

// ---------------------------------------------------------------------------
// The media-index gate, tested through the REAL sync entry point.
//
// classifyMedia is unit-tested in changelog-classifier.test.js, but a unit test
// cannot catch the failure that actually matters: the `before` snapshot is the
// PRIOR _index.json read off disk, and if that ever resolved wrong (or the
// `|| { media: {} }` fallback fired spuriously) then every entry would look
// newly gained, the verdict would be "additive" forever, and the gate would be
// dead while every classifier test stayed green.
//
// That is precisely the bug this phase exists to prevent, so it gets an
// end-to-end test. Mirrors tests/sync-icons-phase-gate.test.js.
// ---------------------------------------------------------------------------

var PNG = Buffer.from("fake-webp-bytes");

function seedMedia(tree) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "media-gate-"));
  var mediaRoot = path.join(dir, "components", "dist", "media");
  Object.keys(tree).forEach(function (slug) {
    var slugDir = path.join(mediaRoot, slug);
    fs.mkdirSync(slugDir, { recursive: true });
    tree[slug].forEach(function (file) {
      fs.writeFileSync(path.join(slugDir, file), PNG);
    });
  });
  return { dir: dir, mediaRoot: mediaRoot };
}

// Run ONLY the media-index phase against a temp pluginDir. No Figma calls: the
// phase is a pure re-derive of whatever is on disk, which is exactly why it
// needed a before-snapshot to notice loss at all.
function mediaIndexPhase(pluginDir, mediaOutputDir) {
  return S.run({
    phase: "media-index",
    pluginDir: pluginDir,
    mediaOutputDir: mediaOutputDir,
    artifactsDir: pluginDir,
    rest: {},
    keys: { ds: "FILEKEY" },
  });
}

function indexPath(mediaRoot) {
  return path.join(mediaRoot, "_index.json");
}

test("media-index: first run with no prior index is additive, not a phantom mass loss", async function () {
  var m = seedMedia({ button: ["preview.webp", "default.webp"] });
  var res = await mediaIndexPhase(m.dir, m.mediaRoot);
  assert.equal(
    res.category,
    "additive",
    "with nothing to compare against, a fresh derive must not report loss",
  );
  assert.ok(fs.existsSync(indexPath(m.mediaRoot)), "index was written");
});

test("media-index: a slug losing its imagery between runs is BREAKING end-to-end", async function () {
  var m = seedMedia({
    button: ["preview.webp"],
    tag: ["preview.webp"],
  });
  await mediaIndexPhase(m.dir, m.mediaRoot); // establishes the "before"

  // A prune removes tag's imagery entirely.
  fs.rmSync(path.join(m.mediaRoot, "tag"), { recursive: true, force: true });

  var res = await mediaIndexPhase(m.dir, m.mediaRoot);
  assert.equal(
    res.category,
    "breaking",
    "deleted imagery must block auto-merge, not report byte-level maintenance",
  );
});

test("media-index: a role SHRINKING its frames between runs is BREAKING (the common prune)", async function () {
  var m = seedMedia({
    button: ["variations-0.webp", "variations-1.webp", "variations-2.webp"],
  });
  await mediaIndexPhase(m.dir, m.mediaRoot);

  // pruneStaleCaptures deletes `<role>-<n>.webp` for n >= the new count. The
  // role KEY survives, so a name-only diff would see nothing at all.
  fs.rmSync(path.join(m.mediaRoot, "button", "variations-1.webp"));
  fs.rmSync(path.join(m.mediaRoot, "button", "variations-2.webp"));

  var res = await mediaIndexPhase(m.dir, m.mediaRoot);
  assert.equal(res.category, "breaking", "2 deleted images must not auto-merge");
});

test("media-index: an unchanged tree stays unchanged (no-op nights stay no-op)", async function () {
  var m = seedMedia({ button: ["preview.webp"] });
  await mediaIndexPhase(m.dir, m.mediaRoot);
  var res = await mediaIndexPhase(m.dir, m.mediaRoot);
  assert.equal(
    res.category,
    "unchanged",
    "a gate that fires on a quiet night trains everyone to ignore it",
  );
});

test("media-index: new imagery is additive", async function () {
  var m = seedMedia({ button: ["preview.webp"] });
  await mediaIndexPhase(m.dir, m.mediaRoot);

  fs.mkdirSync(path.join(m.mediaRoot, "tag"), { recursive: true });
  fs.writeFileSync(path.join(m.mediaRoot, "tag", "preview.webp"), PNG);

  var res = await mediaIndexPhase(m.dir, m.mediaRoot);
  assert.equal(res.category, "additive");
});

test("media-index: an unreadable prior index is BREAKING, and self-heals rather than bricking the sync", async function () {
  var m = seedMedia({ button: ["preview.webp"] });
  await mediaIndexPhase(m.dir, m.mediaRoot);
  fs.writeFileSync(indexPath(m.mediaRoot), "{ this is not json");

  var res = await mediaIndexPhase(m.dir, m.mediaRoot);
  assert.equal(
    res.category,
    "breaking",
    "loss cannot be ruled out, so a human must confirm",
  );
  // Critically: it must NOT throw. Throwing would leave the corrupt file in
  // place and kill every subsequent sync until a human fixed it by hand, which
  // is the exact failure this whole change exists to prevent.
  var healed = JSON.parse(fs.readFileSync(indexPath(m.mediaRoot), "utf8"));
  assert.ok(healed.media.button, "the index rewrote itself from the media tree");
});
