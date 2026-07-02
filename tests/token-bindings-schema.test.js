"use strict";
// Contract tests for the token-bindings sidecar schema v2 additions:
// optional per-binding variant scope, optional top-level variantDefaults,
// and the height/width property enum entries.
const test = require("node:test");
const assert = require("node:assert/strict");
const Ajv2020 = require("ajv/dist/2020");
const schema = require("../schemas/token-bindings.json");

const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
  schema,
);

function doc(overrides) {
  return Object.assign(
    {
      _schema_version: 1,
      slug: "tag-status",
      byNodeId: {
        "7370:4928": [
          {
            property: "border-radius",
            token: "--zen-border-radius-xs",
            grade: "semantic",
          },
        ],
      },
    },
    overrides,
  );
}

test("schema accepts a variant-scoped binding + variantDefaults + height/width", () => {
  const d = doc({
    variantDefaults: { Status: "Fail" },
    byNodeId: {
      "7370:4928": [
        { property: "height", token: "--zen-lg", grade: "primitive" },
        { property: "width", token: "--zen-lg", grade: "primitive" },
        {
          property: "background-color",
          token: "--zen-color-bg-warning",
          grade: "semantic",
          variant: { prop: "Status", values: ["Warning"] },
        },
      ],
    },
  });
  assert.equal(validate(d), true, JSON.stringify(validate.errors));
});

test("schema rejects malformed variant scopes", () => {
  // missing values
  assert.equal(
    validate(
      doc({
        byNodeId: {
          a: [
            {
              property: "color",
              token: "--zen-x",
              grade: "semantic",
              variant: { prop: "Status" },
            },
          ],
        },
      }),
    ),
    false,
  );
  // empty values
  assert.equal(
    validate(
      doc({
        byNodeId: {
          a: [
            {
              property: "color",
              token: "--zen-x",
              grade: "semantic",
              variant: { prop: "Status", values: [] },
            },
          ],
        },
      }),
    ),
    false,
  );
  // extra key inside variant
  assert.equal(
    validate(
      doc({
        byNodeId: {
          a: [
            {
              property: "color",
              token: "--zen-x",
              grade: "semantic",
              variant: { prop: "Status", values: ["A"], extra: 1 },
            },
          ],
        },
      }),
    ),
    false,
  );
  // non-string variantDefaults value
  assert.equal(validate(doc({ variantDefaults: { Status: 3 } })), false);
});

test("valid sidecar passes, bad property/token fails", () => {
  const good = doc({
    slug: "card-for-perimeter",
    _meta: {
      auto_generated: true,
      source: "figma-mcp:get_design_context",
      harvested_at: "2026-07-01",
      do_not_edit: true,
    },
    byNodeId: {
      "14783:7564": [
        {
          property: "background-color",
          token: "--zen-color-bg-default",
          grade: "semantic",
        },
      ],
    },
  });
  assert.equal(validate(good), true, "valid sidecar should pass");

  const badToken = JSON.parse(JSON.stringify(good));
  badToken.byNodeId["14783:7564"][0].token = "zen-x"; // not --zen-
  assert.equal(
    validate(badToken),
    false,
    "token without --zen- prefix should fail",
  );

  const badProperty = JSON.parse(JSON.stringify(good));
  badProperty.byNodeId["14783:7564"][0].property = "wobble"; // not in enum
  assert.equal(
    validate(badProperty),
    false,
    "property not in enum should fail",
  );
});
