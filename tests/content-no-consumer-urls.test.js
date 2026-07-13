"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

var ROOT = path.join(__dirname, "..");

// ---------------------------------------------------------------------------
// Knowledge must not hardcode a CONSUMER's URL structure.
//
// The convention is the BARE SLUG: `[checkbox](checkbox)`. Each consumer then
// resolves that slug to whatever path it happens to use — the docs site nests a
// component under a group segment when two components share a group, so the very
// same component lives at /components/form-input-selection/checkbox/ one day and
// /components/form-input-selection/checkbox/checkbox/ the next.
//
// Three files had written the docs site's absolute path directly into the
// knowledge source instead:
//
//   [checkbox](/components/form-input-selection/checkbox/)
//
// On 2026-07-13 the Figma sync added `checkbox-card`, which joined `checkbox`'s
// group, so the docs page moved under a group segment — and that hardcoded link
// 404'd, taking the docs build red. The other two (stepper, search-filters) were
// the same landmine, just not stepped on yet.
//
// Knowledge is the substrate: it does not get to know where a consumer puts its
// pages. Bare slug, always.
// ---------------------------------------------------------------------------

// A root-absolute markdown link into a consumer's page tree. Bare slugs (no
// leading slash) and real external URLs (scheme://) are both fine.
var CONSUMER_URL = /\]\(\/(components|foundations|content|accessibility|brand)\//g;

function authoredMarkdownFiles() {
  var roots = [
    "content/src",
    "components/src",
    "app-context/src",
    "foundations/src",
    "accessibility/src",
  ];
  var out = [];
  roots.forEach(function (rel) {
    var dir = path.join(ROOT, rel);
    if (!fs.existsSync(dir)) return;
    (function walk(d) {
      fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
        var p = path.join(d, e.name);
        if (e.isDirectory()) return walk(p);
        if (e.isFile() && e.name.endsWith(".md")) out.push(p);
      });
    })(dir);
  });
  return out;
}

test("authored content never hardcodes a consumer's URL structure (bare slugs only)", function () {
  var offenders = [];
  authoredMarkdownFiles().forEach(function (file) {
    var body = fs.readFileSync(file, "utf8");
    var lines = body.split("\n");
    lines.forEach(function (line, i) {
      CONSUMER_URL.lastIndex = 0;
      if (CONSUMER_URL.test(line)) {
        offenders.push(path.relative(ROOT, file) + ":" + (i + 1));
      }
    });
  });

  assert.deepEqual(
    offenders,
    [],
    "Authored knowledge must link components by BARE SLUG — `[checkbox](checkbox)` — not by a\n" +
      "consumer's absolute path — `[checkbox](/components/form-input-selection/checkbox/)`.\n" +
      "A consumer owns its own URL structure and moves pages without telling us: the docs site\n" +
      "nests a component under a group segment as soon as a second component joins its group,\n" +
      "which is exactly how `checkbox` broke on 2026-07-13. Offenders:\n  " +
      offenders.join("\n  "),
  );
});

// The rule only bites root-absolute links INTO a consumer tree. Prove it does not
// fire on the things it must leave alone, or the next author will fight it.
test("the gate does not fire on bare slugs, anchors, or external URLs", function () {
  var ok = [
    "See the [checkbox](checkbox) guidance.",
    "Jump to [tokens](#tokens).",
    "Read the [WCAG spec](https://www.w3.org/TR/WCAG22/).",
    "A [relative doc](../foundations/color.md).",
  ];
  ok.forEach(function (line) {
    CONSUMER_URL.lastIndex = 0;
    assert.ok(
      !CONSUMER_URL.test(line),
      "must not flag a legitimate link: " + line,
    );
  });

  // And that it DOES fire on the real offender, or it is vacuous.
  CONSUMER_URL.lastIndex = 0;
  assert.ok(
    CONSUMER_URL.test("**[checkbox](/components/form-input-selection/checkbox/)**"),
    "the gate must catch the shape that actually broke the docs build",
  );
});
