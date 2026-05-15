"use strict";

// ζ.3 — JSON Schema gate for components/dist/registries/*.json.
// Validates the registry contract introduced by ζ.0-ζ.3:
//   - description: unbounded string
//   - documentationLinks: required array
//   - lastSynced removed from per-component entries
//   - section + category + group: present on entries from kits that supply documentChildren
//   - nestedComponents: populated array (slug + role + source per entry)
// Phase 5 (knowledge v0.11.0): `guidelinesFile` field was retired with the
// scraped components/src/guidelines/ layer; consumers now resolve per-
// component guideline docs by slug via components.guidelineDoc in
// paths-manifest.json.

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");
var fs = require("fs");

var Ajv2020 = require("ajv/dist/2020");
var addFormats = require("ajv-formats");

var REPO_ROOT = path.resolve(__dirname, "..");
var schema = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "schemas", "registry.json"), "utf8"),
);

function makeValidator() {
  var ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

function minimalEntry(overrides) {
  return Object.assign(
    {
      name: "Button",
      key: "k-btn",
      nodeId: "1:1",
      importMethod: "set",
      description: "A button.",
      page: "✅ Button",
      properties: {},
      nestedComponents: [],
      documentationLinks: [],
      variants: {},
    },
    overrides || {},
  );
}

function minimalRegistry(componentsOverrides) {
  return {
    library: "ds",
    fileKey: "TEST",
    lastSynced: "2026-05-13T00:00:00.000Z",
    componentCount: 1,
    components: componentsOverrides || { button: minimalEntry() },
  };
}

test("registry schema", async function (t) {
  await t.test("accepts minimal valid registry", function () {
    var validate = makeValidator();
    assert.equal(validate(minimalRegistry()), true);
  });

  await t.test(
    "requires library / fileKey / lastSynced / components",
    function () {
      var validate = makeValidator();
      var bad = minimalRegistry();
      delete bad.library;
      assert.equal(validate(bad), false);
    },
  );

  await t.test("library must be enum", function () {
    var validate = makeValidator();
    var bad = minimalRegistry();
    bad.library = "not-a-kit";
    assert.equal(validate(bad), false);
  });

  await t.test("requires documentationLinks on entries (ζ.1)", function () {
    var validate = makeValidator();
    var entry = minimalEntry();
    delete entry.documentationLinks;
    assert.equal(validate(minimalRegistry({ button: entry })), false);
  });

  await t.test(
    "requires nestedComponents on entries (always emitted)",
    function () {
      var validate = makeValidator();
      var entry = minimalEntry();
      delete entry.nestedComponents;
      assert.equal(validate(minimalRegistry({ button: entry })), false);
    },
  );

  await t.test("rejects per-component lastSynced (ζ.1 dropped)", function () {
    var validate = makeValidator();
    var entry = minimalEntry();
    entry.lastSynced = "2026-05-13T00:00:00Z";
    assert.equal(
      validate(minimalRegistry({ button: entry })),
      false,
      "additionalProperties:false should reject lastSynced on entries",
    );
  });

  await t.test(
    "accepts section + category + group (ζ.2 three-axis)",
    function () {
      var validate = makeValidator();
      var entry = minimalEntry({
        section: "Components",
        category: "Action",
        group: "Button",
      });
      assert.equal(validate(minimalRegistry({ button: entry })), true);
    },
  );

  await t.test(
    "nestedComponents items require slug + role + source (ζ.3)",
    function () {
      var validate = makeValidator();
      var entry = minimalEntry({
        nestedComponents: [
          { slug: "icon-info", role: "Icon", source: "instance-swap" },
        ],
      });
      assert.equal(validate(minimalRegistry({ button: entry })), true);

      var badEntry = minimalEntry({
        nestedComponents: [{ slug: "icon-info" }], // missing role + source
      });
      assert.equal(validate(minimalRegistry({ button: badEntry })), false);
    },
  );

  await t.test("nestedComponents source must be enum (ζ.3)", function () {
    var validate = makeValidator();
    var entry = minimalEntry({
      nestedComponents: [
        { slug: "icon-info", role: null, source: "magic-bullet" },
      ],
    });
    assert.equal(validate(minimalRegistry({ button: entry })), false);
  });

  await t.test(
    "status optional but constrained to enum when present",
    function () {
      var validate = makeValidator();
      assert.equal(
        validate(
          minimalRegistry({ button: minimalEntry({ status: "in-progress" }) }),
        ),
        true,
      );
      assert.equal(
        validate(
          minimalRegistry({ button: minimalEntry({ status: "stable" }) }),
        ),
        false,
      );
    },
  );

  await t.test("guidelinesFile is rejected (retired Phase 5)", function () {
    var validate = makeValidator();
    // additionalProperties:false on componentEntry now rejects the
    // field. Locks in the v0.11.0 contract change.
    assert.equal(
      validate(
        minimalRegistry({
          button: minimalEntry({
            guidelinesFile: "components/src/guidelines/button.json",
          }),
        }),
      ),
      false,
      "guidelinesFile was retired with the scraped layer; schema must reject it",
    );
    assert.equal(
      validate(
        minimalRegistry({ button: minimalEntry({ guidelinesFile: null }) }),
      ),
      false,
    );
  });

  await t.test("live dskit.json passes validation", function () {
    var p = path.join(REPO_ROOT, "components/dist/registries/dskit.json");
    if (!fs.existsSync(p)) return; // skip if not synced locally
    var validate = makeValidator();
    var ok = validate(JSON.parse(fs.readFileSync(p, "utf8")));
    if (!ok) {
      assert.fail(
        "live dskit.json failed schema validation. First 3 errors: " +
          JSON.stringify(validate.errors.slice(0, 3), null, 2),
      );
    }
  });

  await t.test("live fmkit.json passes validation", function () {
    var p = path.join(REPO_ROOT, "components/dist/registries/fmkit.json");
    if (!fs.existsSync(p)) return; // skip if not synced locally
    var validate = makeValidator();
    var ok = validate(JSON.parse(fs.readFileSync(p, "utf8")));
    if (!ok) {
      assert.fail(
        "live fmkit.json failed schema validation. First 3 errors: " +
          JSON.stringify(validate.errors.slice(0, 3), null, 2),
      );
    }
  });
});
