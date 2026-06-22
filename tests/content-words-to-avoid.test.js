"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");
var fs = require("node:fs");

var ROOT = path.resolve(__dirname, "..");

var derive = require(
  path.join(__dirname, "..", "scripts", "content", "derive-content.js"),
);

test("readWordsToAvoidRules — reads the 12 frontmatter rules in order", function () {
  var config = derive.resolveConfig({});
  var rules = derive.readWordsToAvoidRules(config);
  assert.equal(rules.length, 12);
  assert.deepEqual(rules[0], {
    avoid: ["please", "sorry"],
    reason: 'Never say "Please" or "Sorry" — they are unnecessary.',
    example: { do: "Contact Support", dont: "Please Contact Support" },
  });
  // advisory row (developer-speak) carries an empty avoid list
  assert.deepEqual(rules[6].avoid, []);
});

test("renderWordsToAvoidSection — reproduces the dist table bytes exactly", function () {
  var section = derive.renderWordsToAvoidSection([
    {
      avoid: ["please", "sorry"],
      reason: 'Never say "Please" or "Sorry" — they are unnecessary.',
      example: { do: "Contact Support", dont: "Please Contact Support" },
    },
  ]);
  assert.equal(
    section,
    "---\n\n| Example | Do | Don't |\n|---|---|---|\n" +
      '| Never say "Please" or "Sorry" — they are unnecessary. | Contact Support | Please Contact Support |',
  );
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

// ── NEW TESTS (Fix #3+#4) ────────────────────────────────────────────────────

test("normalizeWordsToAvoidRules — lowercases avoid tokens", function () {
  var rules = derive.normalizeWordsToAvoidRules([
    {
      avoid: ["Execute", "Sign In"],
      reason: "r",
      example: { do: "d", dont: "x" },
    },
  ]);
  assert.deepEqual(rules[0].avoid, ["execute", "sign in"]);
});

test("normalizeWordsToAvoidRules — throws on malformed rule (no example)", function () {
  assert.throws(function () {
    derive.normalizeWordsToAvoidRules([{ avoid: [], reason: "r" }]);
  }, /malformed rule at index 0/);
});

// ── NEW TEST (Fix #1) ────────────────────────────────────────────────────────

test("renderWordsToAvoidSection — escapes pipe and flattens newline in cells", function () {
  var section = derive.renderWordsToAvoidSection([
    {
      avoid: [],
      reason: "a | b",
      example: { do: "c\nd", dont: "e" },
    },
  ]);
  // reason cell: pipe escaped; do cell: newline flattened to space
  assert.ok(section.indexOf("a \\| b") !== -1, "pipe should be escaped as \\|");
  assert.ok(
    section.indexOf("c d") !== -1,
    "newline should be flattened to space",
  );
  assert.ok(section.indexOf("c\nd") === -1, "raw newline must not appear");
});
