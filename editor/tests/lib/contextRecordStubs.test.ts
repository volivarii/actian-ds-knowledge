import { test } from "node:test";
import assert from "node:assert/strict";
import { parse as parseYaml } from "yaml";
import {
  buildEntityStub,
  buildPatternStub,
} from "../../src/lib/appContextCreate";

function frontmatterOf(md: string): Record<string, unknown> {
  return (parseYaml(md.split(/^---$/m)[1] ?? "") ?? {}) as Record<
    string,
    unknown
  >;
}
function bodyOf(md: string): string {
  return md.split(/^---$/m)[2] ?? "";
}

test("an entity stub carries every schema-required field", () => {
  const fm = frontmatterOf(
    buildEntityStub({ slug: "data-contract", label: "Data Contract", apps: ["studio"] }),
  );
  assert.equal(fm._schema_version, 1);
  assert.equal(fm.slug, "data-contract");
  assert.equal(fm.label, "Data Contract");
  assert.deepEqual(fm.properties, []);
  assert.deepEqual(fm.relationships, {});
  assert.deepEqual(fm.apps, ["studio"]);
});

test("a pattern stub carries its required fields and its components", () => {
  const fm = frontmatterOf(
    buildPatternStub({
      slug: "import-wizard",
      label: "Import wizard",
      apps: ["studio", "explorer"],
      components: ["button", "table"],
    }),
  );
  assert.equal(fm._schema_version, 1);
  assert.equal(fm.slug, "import-wizard");
  assert.equal(fm.label, "Import wizard");
  assert.deepEqual(fm.apps, ["studio", "explorer"]);
  assert.deepEqual(fm.components, ["button", "table"]);
});

test("a pattern with no components omits the key rather than writing an empty list", () => {
  const fm = frontmatterOf(
    buildPatternStub({ slug: "x", label: "X", apps: ["studio"], components: [] }),
  );
  assert.equal("components" in fm, false);
});

// For entities and patterns the WHOLE body is the derived `description`
// (derive-app-context.js reads it with bodyField: "description"). A placeholder
// sentence would not sit in a section, it would BE the description, and ship to
// consumers as the author's own words.
for (const [kind, md] of [
  ["entity", buildEntityStub({ slug: "x", label: "X", apps: ["studio"] })],
  ["pattern", buildPatternStub({ slug: "x", label: "X", apps: ["studio"] })],
] as const) {
  test(`a ${kind} stub ships an empty description, never a placeholder`, () => {
    assert.equal(bodyOf(md).trim(), "");
  });
}

test("names needing YAML quoting survive as strings", () => {
  const fm = frontmatterOf(
    buildEntityStub({ slug: "codename", label: "2026", apps: ["studio"] }),
  );
  assert.equal(typeof fm.label, "string");
  assert.equal(fm.label, "2026");
});

test("both stubs point at their schema for editor validation", () => {
  assert.match(
    buildEntityStub({ slug: "x", label: "X", apps: ["a"] }),
    /schemas\/app-context-entity\.json/,
  );
  assert.match(
    buildPatternStub({ slug: "x", label: "X", apps: ["a"] }),
    /schemas\/app-context-pattern\.json/,
  );
});
