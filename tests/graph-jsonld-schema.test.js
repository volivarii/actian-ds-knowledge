"use strict";
var { test } = require("node:test");
var assert = require("node:assert");
var Ajv2020 = require("ajv/dist/2020");
var addFormats = require("ajv-formats");
var fs = require("node:fs");
var path = require("node:path");
var ROOT = path.resolve(__dirname, "..");
var readCommittedJSON =
  require("./lib/committed-artifacts.js").readCommittedJSON;

// The DOCUMENT from HEAD, the SCHEMA from the working tree -- deliberately not
// symmetric, and worth being precise about why.
//
// derive() rewrites graph/dist/graph.jsonld mid-run (unconfined callers, parallel
// `node --test`), so reading that from the tree races a rewrite and a real
// violation can be healed before this sees it. schemas/graph-jsonld.json is a
// hand-authored source that derive() never touches, so no such race exists.
//
// Reading the schema from HEAD too would buy state-consistency at the cost of a
// silent green: a contributor tightening the schema would get a pass here because
// the suite compiled the OLD schema, and one LOOSENING it could not use the suite
// to check that it still catches anything. A transient red while a schema change
// is uncommitted is the better failure -- it is visible, and it clears on commit.
// The freshly emitted JSON-LD is validated separately by validate-graph.js. Note
// that is true of the JSON-LD only: nothing revalidates a freshly derived
// graph.json against the assertions in graph-figma-key.test.js, which also read
// HEAD. In CI that is covered -- validate-manifest proves HEAD == a fresh derive
// before `npm test` runs -- but in a local loop a deriver edit that, say, stopped
// carrying figmaKey would leave the suite green until it is committed. #624 (
// confining derive()) is what would let those read the tree again.
var schema = JSON.parse(
  fs.readFileSync(path.join(ROOT, "schemas/graph-jsonld.json"), "utf8"),
);
var ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
var validate = ajv.compile(schema);

// The COMMITTED graph.jsonld. derive() rewrites it in place and several test
// files call derive() unconfined while `node --test` runs files in parallel, so
// reading the working tree here races a rewrite: a committed jsonld that
// violates the schema can be healed by a concurrent derive before this validates
// it, and the gate passes on a shipped artifact that is actually invalid.
// See tests/lib/committed-artifacts.js; #624 tracks confining derive().
test("the committed graph.jsonld validates against the schema", function () {
  var ld = readCommittedJSON("graph/dist/graph.jsonld");
  var ok = validate(ld);
  assert.ok(ok, JSON.stringify(validate.errors, null, 2));
});

test("a node missing @type fails", function () {
  var bad = { "@context": {}, _meta: {}, "@graph": [{ "@id": "component:x" }] };
  assert.strictEqual(validate(bad), false);
});

test("an edge missing target fails", function () {
  var bad = {
    "@context": {},
    _meta: {},
    "@graph": [
      { "@type": "Edge", edgeType: "in_category", source: "component:x" },
    ],
  };
  assert.strictEqual(validate(bad), false);
});
