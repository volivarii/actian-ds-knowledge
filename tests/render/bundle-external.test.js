"use strict";
// bundle-external.test.js — the declared boundary of the Claude Design bundle.
//
// build-bundle.js emits one card per RENDER_SLUGS slug, and RENDER_SLUGS is
// derived from the `case "<slug>":` branches in ds-html-map.js. A card that
// exists in a Claude Design project without such a branch therefore cannot be
// reproduced by the substrate: a rebuild silently omits it, and it survives in
// the project only because a push never deletes. Ten such cards were found in
// the dogfood on 2026-09-23, and nothing in this repository said so.
//
// components/render/bundle-external.json is that statement. These tests keep it
// honest: every entry names a real reason, no entry claims a slug the substrate
// in fact produces, and the file cannot silently empty.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var M = require("../../components/render/renderer/matrix.js");

var FILE = path.resolve(
  __dirname,
  "..",
  "..",
  "components",
  "render",
  "bundle-external.json",
);

var STATUSES = ["keep", "author", "retire", "undecided"];

function load() {
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

test("bundle-external.json parses and is not empty", function () {
  var doc = load();
  assert.ok(Array.isArray(doc.cards), "cards is an array");
  assert.ok(
    doc.cards.length > 0,
    "an empty list would read as 'no drift' when the truth is 'nobody looked'",
  );
});

test("every entry carries slug, path, status and a reason", function () {
  var doc = load();
  doc.cards.forEach(function (c) {
    assert.equal(typeof c.slug, "string", "slug is a string");
    assert.ok(/^[a-z][a-z0-9-]*$/.test(c.slug), c.slug + ": kebab-case slug");
    assert.ok(
      typeof c.path === "string" && /\.html$/.test(c.path),
      c.slug + ": path is an .html card path",
    );
    assert.ok(
      STATUSES.indexOf(c.status) >= 0,
      c.slug +
        ": status is one of " +
        STATUSES.join(", ") +
        ", got " +
        c.status,
    );
    assert.ok(
      typeof c.reason === "string" && c.reason.trim().length >= 20,
      c.slug + ": reason says why, in a sentence, not a word",
    );
  });
});

// The real check, as a function, so the probe below can drive THIS code rather
// than a hand-copied lookalike of it. A probe that restates the assertion only
// proves that assert works.
function falselyExternal(cards) {
  var produced = {};
  M.RENDER_SLUGS.forEach(function (s) {
    produced[s] = 1;
  });
  return cards
    .filter(function (c) {
      return produced[c.slug];
    })
    .map(function (c) {
      return c.slug;
    });
}

test("no entry claims a slug the substrate actually produces", function () {
  assert.deepEqual(
    falselyExternal(load().cards),
    [],
    "a listed slug that has a `case` branch in ds-html-map.js IS emitted by " +
      "build-bundle, so declaring it external is a false statement: remove it.",
  );
});

test("slugs are unique", function () {
  var doc = load();
  var seen = {};
  doc.cards.forEach(function (c) {
    assert.ok(!seen[c.slug], c.slug + " is listed twice");
    seen[c.slug] = 1;
  });
});

// The check above only means something if it can fail, and the probe has to
// drive the same function to show that.
test("the produced-slug guard can fail", function () {
  assert.ok(
    M.RENDER_SLUGS.indexOf("button") >= 0,
    "button is a produced slug (the fixture this probe relies on)",
  );
  assert.deepEqual(
    falselyExternal([{ slug: "button" }, { slug: "card-for-items" }]),
    ["button"],
    "a produced slug planted in the list is caught, and a genuinely external " +
      "one beside it is not",
  );
});
