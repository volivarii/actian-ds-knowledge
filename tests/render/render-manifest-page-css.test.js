"use strict";

// Gate: the page framing a standalone consumer applies is the derive's to
// ship, not each consumer's to restate.
//
// deriveCanonical() has owned PAGE_CSS since slice 1b, precisely so
// build-bundle.js would stop keeping a copy that could drift. It returned the
// value to callers but never wrote it to dist, so a consumer that is not
// build-bundle (the editor's render panel was the first) had no way to read
// it and restated it by hand, already with a different padding and a
// different position in the cascade. The manifest now carries it.

const test = require("node:test");
const assert = require("node:assert/strict");
const { deriveCanonical } = require("../../scripts/render/derive-canonical.js");

test("the manifest carries the page framing build-bundle applies last, so no consumer restates it", () => {
  const out = deriveCanonical();
  assert.equal(typeof out.manifest.pageCss, "string", "pageCss is CSS text, not a file name");
  assert.equal(out.manifest.pageCss, out.pageCss, "the manifest ships the same framing the derive returns");
  assert.match(out.manifest.pageCss, /body\{/, "it is the body framing");
  assert.equal(out.manifest.schemaVersion, "1.2.0", "an added field is a minor bump of the envelope");
});
