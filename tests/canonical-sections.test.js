const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ajv = require("ajv/dist/2020");
const addFormats = require("ajv-formats");
const {
  buildCanonicalSections,
  serialize,
} = require("../scripts/components/derive-canonical-sections.js");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "components", "src", "canonical-sections.json");
const DIST = path.join(ROOT, "components", "dist", "canonical-sections.json");
const SCHEMA = path.join(ROOT, "schemas", "canonical-sections.json");

test("canonical-sections: committed dist is a fresh derive of the src", () => {
  const src = JSON.parse(fs.readFileSync(SRC, "utf8"));
  const expected = serialize(buildCanonicalSections(src));
  const actual = fs.readFileSync(DIST, "utf8");
  assert.equal(
    actual,
    expected,
    "run `npm run derive:canonical-sections` and commit",
  );
});

test("canonical-sections: dist validates against its schema", () => {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const schema = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));
  const data = JSON.parse(fs.readFileSync(DIST, "utf8"));
  const validate = ajv.compile(schema);
  const ok = validate(data);
  assert.ok(ok, JSON.stringify(validate.errors, null, 2));
});

test("canonical-sections: 5 design sections with the canonical keys", () => {
  const data = JSON.parse(fs.readFileSync(DIST, "utf8"));
  assert.deepEqual(
    data.design.map((s) => s.key),
    ["anatomy", "variants", "spacing", "behavior", "layout"],
  );
  // every section carries an anchor-legal anchor + a valid media role
  for (const s of data.design) {
    assert.match(s.anchor, /^[a-z0-9-]+$/);
    assert.ok(
      ["parts", "variations", "spacing", "behavior", "layout"].includes(
        s.mediaRole,
      ),
    );
  }
});
