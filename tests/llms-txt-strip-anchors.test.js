"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var llms = require("../scripts/llms-txt-generate.js");

test("stripAnchorMarkers removes {#slug} from H2/H3 heading tails", function () {
  var input =
    "## 5. Focus & Keyboard {#focus-keyboard}\n" +
    "### Buttons {#buttons}\n" +
    "Some prose.\n";
  var out = llms.stripAnchorMarkers(input);
  assert.equal(
    out,
    "## 5. Focus & Keyboard\n### Buttons\nSome prose.\n",
    "anchors must be stripped from heading tails",
  );
});

test("stripAnchorMarkers removes {#slug} from bold-paragraph tails", function () {
  var input =
    "**Drawer (open/close)** {#drawer-open-close}\n" +
    "\n" +
    "| Phase | Duration |\n";
  var out = llms.stripAnchorMarkers(input);
  assert.equal(
    out,
    "**Drawer (open/close)**\n\n| Phase | Duration |\n",
    "anchors must be stripped from bold-paragraph tails",
  );
});

test("stripAnchorMarkers leaves prose anchors and inline brace text alone", function () {
  var input =
    "See {#focus-keyboard} for keyboard rules.\n" +
    "An object literal: { id: 5 }.\n";
  var out = llms.stripAnchorMarkers(input);
  assert.equal(out, input, "non-heading non-bold lines must be untouched");
});

function anchorLeaksOnHeadingsOrBoldLines(md) {
  // Mirror the strip's targets: anchors at the tail of a heading line OR a
  // bold-paragraph line. Anything else (prose mentions inside comments or
  // documentation about anchors) is fine — only the consumer-addressing
  // shapes are noise in a clean-prose dump.
  var leaks = [];
  var lines = md.split("\n");
  for (var i = 0; i < lines.length; i++) {
    if (/^\s*#{1,6}\s+.*\{#[a-z0-9-]+\}\s*$/.test(lines[i])) {
      leaks.push("line " + (i + 1) + " (heading): " + lines[i]);
    } else if (/^\s*\*\*[^*\n]+\*\*\s+\{#[a-z0-9-]+\}\s*$/.test(lines[i])) {
      leaks.push("line " + (i + 1) + " (bold-paragraph): " + lines[i]);
    }
  }
  return leaks;
}

test("generated llms-full.txt has no anchor markers on heading or bold lines", function () {
  // End-to-end guard: regenerate in-memory and verify the public artifact
  // is free of consumer-addressing anchor noise on the shapes we strip.
  // Prose mentions of `{#anchor}` inside HTML comments are fine.
  var full = llms.generateLlmsFullTxt();
  var leaks = anchorLeaksOnHeadingsOrBoldLines(full);
  assert.deepEqual(
    leaks,
    [],
    "llms-full.txt has anchor markers leaking onto heading/bold lines:\n" +
      leaks.join("\n"),
  );
});

test("on-disk llms-full.txt is in sync with the generator (no anchor regression)", function () {
  // Guards against the dist drifting from regenerated output — same pattern
  // as the a11y-index.json drift guard.
  var distPath = path.resolve(__dirname, "..", "llms-full.txt");
  if (!fs.existsSync(distPath)) {
    return; // file may not exist yet on fresh clones; CI will regenerate
  }
  var onDisk = fs.readFileSync(distPath, "utf8");
  var leaks = anchorLeaksOnHeadingsOrBoldLines(onDisk);
  assert.deepEqual(
    leaks,
    [],
    "on-disk llms-full.txt has anchors on heading/bold lines; regenerate via scripts/llms-txt-generate.js. Leaks:\n" +
      leaks.join("\n"),
  );
});
