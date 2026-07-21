"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var os = require("node:os");
var path = require("node:path");
var { buildBundle } = require("../../scripts/render/build-bundle.js");

function freshDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bundle-"));
}

// Component cards are grouped by DS category, so a card lands under its category
// directory (button under "Action"), not a fixed "Components". Find it by name.
function findCard(written, slug) {
  return written.find(function (r) {
    return new RegExp("(^|[/\\\\])" + slug + "\\.html$").test(r);
  });
}

test("buildBundle: emits a component card + foundations @dsCard files", function () {
  var dir = freshDir();
  var written = buildBundle(dir);
  var btnRel = findCard(written, "button");
  assert.ok(btnRel, "a button component card was written");
  var btn = fs.readFileSync(path.join(dir, btnRel), "utf8");
  assert.match(
    btn.split("\n")[0],
    /@dsCard group="[^"]+"/,
    "card carries a group marker",
  );
  var colors = fs.readFileSync(path.join(dir, "Colors/palette.html"), "utf8");
  assert.match(colors.split("\n")[0], /@dsCard group="Colors"/);
});

test("buildBundle: Type and Spacing foundations cards carry their markers", function () {
  var dir = freshDir();
  buildBundle(dir);
  var type = fs.readFileSync(path.join(dir, "Type/type.html"), "utf8");
  assert.match(type.split("\n")[0], /@dsCard group="Type"/);
  var spacing = fs.readFileSync(path.join(dir, "Spacing/spacing.html"), "utf8");
  assert.match(spacing.split("\n")[0], /@dsCard group="Spacing"/);
});

test("buildBundle: every card is self-contained and token-grounded", function () {
  var dir = freshDir();
  var written = buildBundle(dir);
  assert.ok(written.length >= 4, "at least 4 cards written");
  written.forEach(function (rel) {
    var html = fs.readFileSync(path.join(dir, rel), "utf8");
    assert.ok(
      !/\ssrc=|\shref=|@import/.test(html),
      rel + " must be self-contained",
    );
  });
  // The Colors card shows a real resolved brand color, not an unresolved alias.
  var colors = fs.readFileSync(path.join(dir, "Colors/palette.html"), "utf8");
  assert.ok(
    !/\{[a-z0-9.-]+\}/i.test(colors),
    "no unresolved {alias} in swatches",
  );
  assert.match(colors, /#0F5FDC/i, "brand primary hex present");
});

test("buildBundle: the Button card is a clean render, marker intact, no embedded usage section", function () {
  var dir = freshDir();
  var written = buildBundle(dir);
  var btnRel = findCard(written, "button");
  assert.ok(btnRel, "a button component card was written");
  var btn = fs.readFileSync(path.join(dir, btnRel), "utf8");
  assert.match(
    btn.split("\n")[0],
    /@dsCard group="[^"]+"/,
    "marker still first line",
  );
  assert.match(btn, /ds-button--primary/, "render still present");
  assert.ok(
    !/class="ds-usage"/.test(btn),
    "the card must not embed a usage section: the .prompt.md sibling is " +
      "the one place the note ships, and the Add usage notes panel already " +
      "surfaces it to a human, so embedding it too just duplicates it",
  );
  assert.ok(!/\ssrc=|\shref=|@import/.test(btn), "still self-contained");
});

test("buildBundle: the Button card ships a .prompt.md sibling with the same note", function () {
  var dir = freshDir();
  var written = buildBundle(dir);
  var btnRel = findCard(written, "button");
  var promptRel = btnRel.replace(/\.html$/, ".prompt.md");
  assert.ok(
    written.indexOf(promptRel) >= 0,
    "buildBundle must report the .prompt.md sibling in its written list",
  );
  var prompt = fs.readFileSync(path.join(dir, promptRel), "utf8");
  assert.match(prompt, /^# .*: usage notes/, "raw markdown, note title first");
  assert.match(prompt, /## When to use/, "usage content present");
  assert.ok(
    !/<[a-z][^>]*>/i.test(prompt),
    "prompt.md is markdown, not the HTML-embedded ds-usage section",
  );
});

test("buildBundle: foundations cards (no guideline doc) ship no .prompt.md", function () {
  var dir = freshDir();
  var written = buildBundle(dir);
  var stray = written.filter(function (rel) {
    return /\.prompt\.md$/.test(rel) && /^(Colors|Type|Spacing)[/\\]/.test(rel);
  });
  assert.equal(stray.length, 0, "foundations cards have no usage note to ship");
});

test("buildBundle: component cards are reconstructed from the shared css + fragment", function () {
  var dir = freshDir();
  var written = buildBundle(dir);
  var btnRel = findCard(written, "button");
  var btn = fs.readFileSync(path.join(dir, btnRel), "utf8");
  // The reconstructed card inlines the shared stylesheet and the fragment markup.
  var D = require("../../scripts/render/derive-canonical.js");
  var out = D.deriveCanonical();
  assert.ok(btn.indexOf(out.css) >= 0, "card inlines the shared render.css");
  assert.ok(
    btn.indexOf(out.fragments.button.trim().slice(0, 40)) >= 0,
    "card carries the button fragment",
  );
  assert.match(
    btn,
    /body\{margin:0;padding:24px;background:#fff\}/,
    "card re-adds the standalone-preview page chrome",
  );
  // selfContainedCard is what adds the viewport meta as part of building a full
  // <head>; a bare fragment has none, so this fails if the loop ever starts
  // embedding canonical.fragments[r.slug] directly instead of going through
  // selfContainedCard.
  assert.match(
    btn,
    /<meta name="viewport" content="width=device-width, initial-scale=1">/,
    "card uses the head built by selfContainedCard, not a bare fragment",
  );
  assert.ok(!/\ssrc=|\shref=|@import/.test(btn), "still self-contained");
});
