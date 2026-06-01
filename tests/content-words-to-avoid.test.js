"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");
var fs = require("node:fs");

var ROOT = path.resolve(__dirname, "..");

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

test("buildWordsToAvoid — reads the real source + shapes the artifact", function () {
  var config = derive.resolveConfig({});
  var artifact = derive.buildWordsToAvoid(config);
  assert.equal(artifact._schema_version, 1);
  assert.equal(artifact._source, "content/src/writing/words-to-avoid.md");
  assert.ok(Array.isArray(artifact.rules) && artifact.rules.length >= 10);
});

test("buildWordsToAvoid — coverage: canonical avoid tokens are all present", function () {
  var config = derive.resolveConfig({});
  var artifact = derive.buildWordsToAvoid(config);
  var all = artifact.rules.reduce(function (acc, r) {
    return acc.concat(r.avoid);
  }, []);
  [
    "execute",
    "abort",
    "master",
    "slave",
    "blacklist",
    "whitelist",
    "ensure",
    "agnostic",
    "signin",
    "please",
    "sorry",
    "disabled",
  ].forEach(function (tok) {
    assert.ok(all.indexOf(tok) !== -1, "missing canonical token: " + tok);
  });
});

test("derive leaves content/dist/global.md byte-identical", function () {
  var config = derive.resolveConfig({});
  var generated = derive.buildGlobalOutput(config);
  var committed = fs.readFileSync(
    path.join(ROOT, "content/dist/global.md"),
    "utf8",
  );
  assert.equal(
    generated,
    committed,
    "global.md changed — the words-to-avoid emit must be purely additive",
  );
});

test("committed content/dist/words-to-avoid.json matches buildWordsToAvoid (not stale)", function () {
  var config = derive.resolveConfig({});
  var onDisk = fs.readFileSync(config.wordsToAvoidOut, "utf8");
  var generated =
    JSON.stringify(derive.buildWordsToAvoid(config), null, 2) + "\n";
  assert.equal(
    onDisk,
    generated,
    "words-to-avoid.json is stale — run the content derive and commit the result",
  );
});

test("words-to-avoid.json conforms to its schema (structural)", function () {
  var artifact = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "content/dist/words-to-avoid.json"),
      "utf8",
    ),
  );
  assert.equal(artifact._schema_version, 1);
  assert.ok(artifact.rules.length >= 1, "schema declares minItems: 1");
  artifact.rules.forEach(function (r) {
    assert.ok(Array.isArray(r.avoid));
    assert.equal(typeof r.reason, "string");
    assert.equal(typeof r.example.do, "string");
    assert.equal(typeof r.example.dont, "string");
    r.avoid.forEach(function (t) {
      assert.equal(typeof t, "string");
    });
  });
});
