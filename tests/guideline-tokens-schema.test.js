"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

const REPO_ROOT = path.resolve(__dirname, "..");
const derive = require(
  path.join(REPO_ROOT, "scripts", "components", "derive-guidelines"),
);

const validators = derive.makeValidators(REPO_ROOT);

test("tokens schema: binding with a valid CSS property passes", () => {
  const ok = validators.tokens({
    bindings: [
      {
        token: "color-bg-default",
        property: "background-color",
        context: "Fill",
      },
    ],
  });
  assert.equal(ok, true, JSON.stringify(validators.tokens.errors));
});

test("tokens schema: binding without property still passes (optional)", () => {
  const ok = validators.tokens({
    bindings: [{ token: "color-bg-default", context: "Fill" }],
  });
  assert.equal(ok, true, JSON.stringify(validators.tokens.errors));
});

test("tokens schema: unknown property value is rejected", () => {
  const ok = validators.tokens({
    bindings: [
      {
        token: "color-bg-default",
        property: "not-a-real-prop",
        context: "Fill",
      },
    ],
  });
  assert.equal(ok, false);
});

test("component (dist) schema: tokensDomain binding accepts property", () => {
  // guideline-component.json validates the DERIVED dist doc and holds its OWN
  // copy of the binding shape (additionalProperties:false). It must also accept
  // `property`, else the deriver rejects the regenerated dist. The src-only
  // schema edit passed local tests but failed the CI derive check for exactly
  // this reason: the two binding schemas must stay in sync on `property`.
  const schema = JSON.parse(
    fs.readFileSync(
      path.join(REPO_ROOT, "schemas", "guideline-component.json"),
      "utf8",
    ),
  );
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema.$defs.tokensDomain);
  const ok = validate({
    status: "approved",
    bindings: [
      {
        token: "color-bg-default",
        property: "background-color",
        context: "Fill",
      },
    ],
  });
  assert.equal(ok, true, JSON.stringify(validate.errors));
});
