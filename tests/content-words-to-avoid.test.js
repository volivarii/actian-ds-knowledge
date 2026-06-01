"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");

var derive = require(
  path.join(__dirname, "..", "scripts", "content", "derive-content.js"),
);

var SAMPLE_TABLE = [
  "# Words to avoid",
  "",
  "Guidance on what content works best.",
  "",
  "---",
  "",
  "| Example | Do | Don't |",
  "|---|---|---|",
  '| Don\'t use "Execute" or "Abort." | The process was cancelled/stopped | The process was aborted. |',
  "| Never use developer-speak. | Click the **OK** button. | Click the OK CTA. |",
  '| Don\'t use "Sign in" or "Signin." | Log in to begin | Signin to begin |',
  "",
].join("\n");

test("parseWordsToAvoid — extracts quoted avoid tokens + reason + example", function () {
  var rules = derive.parseWordsToAvoid(SAMPLE_TABLE);
  assert.equal(rules.length, 3);
  assert.deepEqual(rules[0], {
    avoid: ["execute", "abort"],
    reason: 'Don\'t use "Execute" or "Abort."',
    example: {
      do: "The process was cancelled/stopped",
      dont: "The process was aborted.",
    },
  });
});

test("parseWordsToAvoid — advisory row (no quotes) → avoid: []", function () {
  var rules = derive.parseWordsToAvoid(SAMPLE_TABLE);
  assert.deepEqual(rules[1].avoid, []);
  assert.equal(rules[1].reason, "Never use developer-speak.");
});

test("parseWordsToAvoid — multi-word quoted token preserved (sign in)", function () {
  var rules = derive.parseWordsToAvoid(SAMPLE_TABLE);
  assert.deepEqual(rules[2].avoid, ["sign in", "signin"]);
});

test("parseWordsToAvoid — no table → throws", function () {
  assert.throws(function () {
    derive.parseWordsToAvoid("# Words to avoid\n\nNo table here.\n");
  }, /no table rows/i);
});
