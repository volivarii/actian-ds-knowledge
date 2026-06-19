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
      relationships: { hasDatasets: "dataset" },
      apps: ["studio"],
    }),
    JSON.stringify(v.errors),
  );
  assert.equal(
    v({ _schema_version: 1, slug: "X bad slug", label: "x" }),
    false,
  );
});

test("app schema accepts a valid app record", () => {
  const v = ajv.compile(load("app-context-app.json"));
  assert.ok(
    v({
      _schema_version: 1,
      slug: "studio",
      label: "Studio",
      purpose: "p",
      users: ["Data steward"],
      header: { type: "Studio" },
      sidebar: [{ label: "Catalog", id: "catalog" }],
      signals: ["govern"],
    }),
    JSON.stringify(v.errors),
  );
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

test("schemas reject unknown fields (additionalProperties:false)", () => {
  const cases = [
    [
      "app-context-app.json",
      {
        _schema_version: 1,
        slug: "studio",
        label: "Studio",
        purpose: "p",
        users: ["x"],
        header: { type: "Studio" },
        sidebar: [],
        signals: ["g"],
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
