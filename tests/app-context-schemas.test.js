"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Ajv = require("ajv/dist/2020");

function load(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "schemas", name), "utf8"),
  );
}
const ajv = new Ajv({ strict: false, allowUnionTypes: true });

test("entity schema accepts a valid entity record, rejects a bad one", () => {
  const v = ajv.compile(load("app-context-entity.json"));
  assert.ok(
    v({
      _schema_version: 1,
      slug: "data-product",
      label: "Data Product",
      properties: ["name"],
      relationships: { contains: ["dataset", "input-port"] },
      apps: ["studio"],
    }),
    JSON.stringify(v.errors),
  );
  assert.equal(
    v({ _schema_version: 1, slug: "X bad slug", label: "x" }),
    false,
  );
});

test("entity schema holds the relationship vocabulary closed", () => {
  // Reuse the instance the test above registered: Ajv refuses to compile the
  // same $id twice, and a second `new Ajv()` here would silently diverge from
  // the options the rest of this file validates under.
  const schema = load("app-context-entity.json");
  const v = ajv.getSchema(schema.$id) ?? ajv.compile(schema);
  const record = (relationships) => ({
    _schema_version: 1,
    slug: "data-product",
    label: "Data Product",
    properties: ["name"],
    relationships,
    apps: ["studio"],
  });
  // A verb outside the vocabulary is the thing that produced 36 verbs, 30 of
  // them used once, while the field was free text.
  assert.equal(v(record({ hasDatasets: ["dataset"] })), false, "off-vocabulary verb");
  assert.equal(v(record({ contains: "dataset" })), false, "bare string, not a list");
  assert.equal(v(record({ contains: [] })), false, "a verb with no target says nothing");
  assert.ok(v(record({ contains: ["dataset"], belongsTo: ["domain"] })), JSON.stringify(v.errors));
});

test("app schema accepts a valid app record", () => {
  const v = ajv.compile(load("app-context-app.json"));
  assert.ok(
    v({
      _schema_version: 1,
      slug: "studio",
      label: "Studio",
      header: { type: "Studio" },
      sidebar: [{ label: "Catalog", id: "catalog" }],
    }),
    JSON.stringify(v.errors),
  );
});

test("app schema accepts a header.type beyond the original three (open by design)", () => {
  const localAjv = new Ajv({ strict: false, allowUnionTypes: true });
  const v = localAjv.compile(load("app-context-app.json"));
  const ok = v({
    _schema_version: 1,
    slug: "observability",
    label: "Observability",
    header: { type: "Observability" },
    sidebar: [{ label: "Signals", id: "signals" }],
  });
  assert.equal(ok, true, JSON.stringify(v.errors));
});

test("app schema accepts structured useCases, rejects malformed", () => {
  const localAjv = new Ajv({ strict: false, allowUnionTypes: true });
  const v = localAjv.compile(load("app-context-app.json"));
  const base = {
    _schema_version: 1,
    slug: "studio",
    label: "Studio",
    header: { type: "Studio" },
    sidebar: [{ label: "Catalog", id: "catalog" }],
  };
  assert.equal(
    v({
      ...base,
      useCases: [
        {
          audience: ["Data steward"],
          jobs: ["Govern the catalog"],
          patterns: ["asset-detail-360"],
        },
      ],
    }),
    true,
    JSON.stringify(v.errors),
  );
  assert.equal(v({ ...base, useCases: [{ audience: ["x"] }] }), false); // missing jobs
  assert.equal(
    v({ ...base, useCases: [{ audience: [], jobs: ["j"] }] }),
    false,
  ); // audience minItems:1
  assert.equal(
    v({ ...base, useCases: [{ audience: ["a"], jobs: ["j"], bogus: true }] }),
    false,
  ); // additionalProperties:false
});

test("pattern + term schemas compile and validate", () => {
  const vp = ajv.compile(load("app-context-pattern.json"));
  assert.ok(
    vp({
      _schema_version: 1,
      slug: "import-wizard",
      label: "Import wizard",
      apps: ["studio"],
    }),
    JSON.stringify(vp.errors),
  );
  const vt = ajv.compile(load("app-context-term.json"));
  assert.ok(
    vt({
      _schema_version: 1,
      slug: "data-product",
      use: "Data product",
      meaning: "Curated asset",
      notUse: ["dataset"],
    }),
    JSON.stringify(vt.errors),
  );
});

test("app schema leaves header.type open (no enum) so new apps can declare a header", () => {
  const schema = require("../schemas/app-context-app.json");
  assert.equal(schema.properties.header.properties.type.enum, undefined);
  assert.equal(schema.properties.header.properties.type.minLength, 1);
});

test("entity properties accept both bare strings and typed objects", () => {
  const localAjv = new Ajv({ strict: false, allowUnionTypes: true });
  const v = localAjv.compile(load("app-context-entity.json"));
  const base = {
    _schema_version: 1,
    slug: "x",
    label: "X",
    relationships: {},
    apps: ["studio"],
  };
  assert.equal(
    v({ ...base, properties: ["name", "status"] }),
    true,
    JSON.stringify(v.errors),
  );
  assert.equal(
    v({
      ...base,
      properties: [
        { name: "status", type: "enum", example: "Draft | Published" },
      ],
    }),
    true,
    JSON.stringify(v.errors),
  );
  assert.equal(v({ ...base, properties: [{ type: "enum" }] }), false); // missing name
});

test("schemas reject unknown fields (additionalProperties:false)", () => {
  const cases = [
    [
      "app-context-app.json",
      {
        _schema_version: 1,
        slug: "studio",
        label: "Studio",
        header: { type: "Studio" },
        sidebar: [],
        bogus: true,
      },
    ],
    [
      "app-context-pattern.json",
      {
        _schema_version: 1,
        slug: "import-wizard",
        label: "Import wizard",
        apps: ["studio"],
        bogus: true,
      },
    ],
    [
      "app-context-term.json",
      {
        _schema_version: 1,
        slug: "data-product",
        use: "Data product",
        meaning: "m",
        notUse: [],
        bogus: true,
      },
    ],
  ];
  for (const [file, rec] of cases) {
    const localAjv = new Ajv({ strict: false, allowUnionTypes: true });
    const v = localAjv.compile(load(file));
    assert.equal(v(rec), false, `${file} must reject unknown field`);
  }
});

test("app-context-pattern schema: accepts optional components[]; still rejects unknown keys", () => {
  const schema = load("app-context-pattern.json");
  const v = new Ajv().compile(schema);
  assert.ok(
    v({
      _schema_version: 1,
      slug: "x",
      label: "X",
      apps: ["studio"],
      components: ["table", "tabs"],
    }),
    "pattern with components[] is valid",
  );
  assert.ok(
    v({ _schema_version: 1, slug: "x", label: "X", apps: ["studio"] }),
    "pattern without components[] is still valid (optional)",
  );
  assert.ok(
    !v({
      _schema_version: 1,
      slug: "x",
      label: "X",
      apps: ["studio"],
      bogus: 1,
    }),
    "unknown key still rejected",
  );
});

test("app-context.json $defs.pattern: accepts optional components[]", () => {
  const schema = load("app-context.json");
  const pat = schema.$defs.pattern;
  assert.ok(pat.properties.components, "$defs.pattern declares components");
  assert.equal(pat.additionalProperties, false);
});

test("every property example validates against the property it illustrates", () => {
  // A wrong example is invisible: nothing validates it, and the editor shows it
  // to the author in the hover card as the model to copy. Caught for real when
  // `relationships` changed from a verb->slug map to verb->list and its own
  // example kept saying `contains: "dataset"`, a shape the same schema rejects.
  const bad = [];
  for (const file of [
    "app-context-entity.json",
    "app-context-app.json",
    "app-context-pattern.json",
  ]) {
    const schema = load(file);
    for (const [name, sub] of Object.entries(schema.properties || {})) {
      if (!Array.isArray(sub.examples)) continue;
      // Compile the property's subschema alone: $id belongs to the parent, and
      // reusing it here would collide with the whole-schema compile above.
      const { $id, ...bare } = sub;
      void $id;
      const check = new Ajv({ strict: false, allowUnionTypes: true }).compile(
        bare,
      );
      sub.examples.forEach((example, i) => {
        if (!check(example))
          bad.push(`${file} ${name}.examples[${i}]: ${JSON.stringify(check.errors)}`);
      });
    }
  }
  assert.deepEqual(bad, []);
});
