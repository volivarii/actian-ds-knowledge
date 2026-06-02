"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

// clients/*.js are CommonJS (require / module.exports). A `type: module`
// CONSUMER (e.g. the docs site) interprets a vendored .js file as ESM unless
// clients/ ships its own package.json forcing CommonJS — without it,
// `require('<vendor>/clients/resolve-paths.js')` throws
// "module is not defined in ES module scope". This package.json travels into
// every consumer's vendor/ (clients/ is in the vendor-include contract) and
// keeps the "resolver = import" design working regardless of the consumer's
// root module type.
test("clients/package.json pins the dir to CommonJS (for type:module consumers)", function () {
  var p = path.join(__dirname, "..", "clients", "package.json");
  assert.ok(fs.existsSync(p), "clients/package.json must exist");
  var pkg = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(pkg.type, "commonjs");
});
