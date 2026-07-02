"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Ajv = require("ajv/dist/2020");

const schema = JSON.parse(fs.readFileSync(__dirname + "/../schemas/token-bindings.json", "utf8"));

test("valid sidecar passes, bad property/token fails", () => {
  const v = new Ajv({ allErrors: true, strict: false }).compile(schema);
  const good = { _schema_version: 1, slug: "card-for-perimeter", _meta: { auto_generated: true, source: "figma-mcp:get_design_context", harvested_at: "2026-07-01", do_not_edit: true }, byNodeId: { "14783:7564": [{ property: "background-color", token: "--zen-color-bg-default", grade: "semantic" }] } };
  assert.equal(v(good), true, "valid sidecar should pass");

  const badToken = JSON.parse(JSON.stringify(good));
  badToken.byNodeId["14783:7564"][0].token = "zen-x"; // not --zen-
  assert.equal(v(badToken), false, "token without --zen- prefix should fail");

  const badProperty = JSON.parse(JSON.stringify(good));
  badProperty.byNodeId["14783:7564"][0].property = "wobble"; // not in enum
  assert.equal(v(badProperty), false, "property not in enum should fail");
});
