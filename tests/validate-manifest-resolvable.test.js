"use strict";

// A collection's `pattern` is what clients/resolve-paths.js uses to turn a slug
// into a file path. Only two shapes actually resolve: one containing {slug},
// or exactly "{name}". Anything else describes the layout for enumeration and
// cannot address a member.
//
// Before this gate, declaring an unresolvable pattern was silent: the resolver
// returned a fabricated path or null, and nothing failed until a consumer
// happened to call it. That is how components.render.renderer stayed broken
// through three renderer-relocation phases (#448). Descriptive collections must
// now say so with `resolvable: false`, which makes the intent explicit and lets
// this check catch the typo case at PR time instead of at first call.

var test = require("node:test");
var assert = require("node:assert/strict");
var { validateSchema } = require("../scripts/validate-manifest.js");

function manifestWith(collections) {
  return { paths: {}, collections: collections };
}

function coll(extra) {
  return Object.assign(
    {
      dir: "some/dir",
      type: "json",
      origin: "ci",
      description: "d",
    },
    extra,
  );
}

function resolvableErrors(collections) {
  return validateSchema(manifestWith(collections)).filter(function (e) {
    return /resolvable|pattern/.test(e);
  });
}

test("a {slug} pattern passes", function () {
  assert.deepEqual(resolvableErrors({ a: coll({ pattern: "{slug}.json" }) }), []);
});

test("a nested {slug} pattern passes", function () {
  assert.deepEqual(
    resolvableErrors({ a: coll({ pattern: "{bucket}/{slug}.md" }) }),
    [],
  );
});

test("an exact {name} pattern passes", function () {
  assert.deepEqual(resolvableErrors({ a: coll({ pattern: "{name}" }) }), []);
});

test("an unresolvable pattern is flagged", function () {
  var errors = resolvableErrors({
    a: coll({ pattern: "<topSlug>/.../<slug>.json" }),
  });
  assert.equal(errors.length, 1, "expected exactly one error, got: " + errors);
  assert.match(errors[0], /collections\.a/);
  assert.match(errors[0], /resolvable: false/);
});

test("the {name}.json near-miss is flagged (it does not resolve)", function () {
  // The exact shape that left components.icons.dist returning null forever.
  var errors = resolvableErrors({ a: coll({ pattern: "{name}.json" }) });
  assert.equal(errors.length, 1, "expected exactly one error, got: " + errors);
});

test("a typo'd placeholder is flagged", function () {
  // {slugs} is the realistic future mistake this gate exists to catch.
  var errors = resolvableErrors({ a: coll({ pattern: "{slugs}.json" }) });
  assert.equal(errors.length, 1, "expected exactly one error, got: " + errors);
});

test("resolvable: false declares an unresolvable pattern intentional", function () {
  assert.deepEqual(
    resolvableErrors({
      a: coll({ pattern: "<topSlug>/.../<slug>.json", resolvable: false }),
    }),
    [],
  );
});

test("resolvable: false on a pattern that DOES resolve is flagged", function () {
  // Mislabelling a working collection would silently discourage callers from
  // using it, so the contradiction is worth catching too.
  var errors = resolvableErrors({
    a: coll({ pattern: "{slug}.json", resolvable: false }),
  });
  assert.equal(errors.length, 1, "expected exactly one error, got: " + errors);
  assert.match(errors[0], /does resolve/);
});

test("the real manifest passes the gate", function () {
  var { readManifest } = require("../scripts/validate-manifest.js");
  var manifest = readManifest();
  var errors = validateSchema(manifest).filter(function (e) {
    return /resolvable/.test(e);
  });
  assert.deepEqual(errors, [], "real manifest must be clean");
});

test("the shared predicate is the single source of the rule", function () {
  // The gate and the runtime must agree. If this import ever breaks, the
  // validator silently loses its check rather than failing loudly.
  var { isResolvablePattern } = require("../clients/resolve-paths.js");
  assert.equal(typeof isResolvablePattern, "function");
  assert.equal(isResolvablePattern("{slug}.json"), true);
  assert.equal(isResolvablePattern("{name}"), true);
  assert.equal(isResolvablePattern("{name}.json"), false);
  assert.equal(isResolvablePattern("<topSlug>/.../<slug>.json"), false);
  assert.equal(isResolvablePattern(undefined), false);
});

test("components.icons.dist resolves its real members", function () {
  // This PR changed its pattern from "{name}.json" (which never resolved, so
  // icons.json was unreachable through the manifest) to "{slug}.json". Pin the
  // members so a revert or a directory reshuffle fails loudly.
  var fs = require("node:fs");
  var { buildPaths } = require("../clients/resolve-paths.js");
  var P = buildPaths(require("node:path").join(__dirname, ".."));
  ["icons", "icons.degraded"].forEach(function (member) {
    var resolved = P.components.icons.dist(member);
    assert.ok(resolved, member + " resolved to null");
    assert.ok(fs.existsSync(resolved), member + " resolved to a missing file: " + resolved);
  });
});
