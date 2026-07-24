import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { keyDocumentationAt } from "../../src/frontmatter-engine/keyDocumentation";
import type { JsonSchema } from "../../src/frontmatter-engine/schemaWalk";

/** Build (text, offset) from a string containing a single `|` caret marker.
 *  Matches yamlCursor.test.ts's own helper. */
function at(marked: string): [string, number] {
  const offset = marked.indexOf("|");
  assert.notEqual(offset, -1, "test input needs a | caret");
  return [marked.replace("|", ""), offset];
}

const APP: JsonSchema = JSON.parse(
  readFileSync(
    new URL("../../../schemas/app-context-app.json", import.meta.url).pathname,
    "utf8",
  ),
) as JsonSchema;

const ENTITY: JsonSchema = JSON.parse(
  readFileSync(
    new URL("../../../schemas/app-context-entity.json", import.meta.url)
      .pathname,
    "utf8",
  ),
) as JsonSchema;

test("documents a required top-level key: type, description, examples verbatim from the schema", () => {
  // Caret lands mid-word (not on the first letter) to prove the function
  // resolves the key from ANY offset inside its name text, not just position 0.
  const [text, offset] = at("slug: studio\nsideb|ar:\n  - label: Pipelines");
  const doc = keyDocumentationAt(text, offset, APP);
  assert.ok(doc, "expected documentation for `sidebar`");
  assert.equal(doc!.key, "sidebar");
  assert.equal(doc!.type, "array of object");
  assert.equal(doc!.required, true);
  assert.equal(
    doc!.description,
    "Ordered list of primary navigation items shown in the app sidebar.",
  );
  assert.deepEqual(doc!.examples, [
    [
      { label: "Pipelines", id: "pipelines" },
      { label: "Connections", id: "connections" },
    ],
  ]);
  const from = text.indexOf("sidebar");
  assert.equal(doc!.from, from);
  assert.equal(doc!.to, from + "sidebar".length);
});

// A hardcoded `required: true` would pass the test above unnoticed. `useCases`
// is a real top-level property of this same schema that is NOT in `required`.
test("does not mark an optional top-level key as required", () => {
  const [text, offset] = at("useCa|ses:\n  - audience: []");
  const doc = keyDocumentationAt(text, offset, APP);
  assert.ok(doc, "expected documentation for `useCases`");
  assert.equal(doc!.required, false);
});

// The core path-resolution guarantee: a nested key's OWN documentation, not
// its parent's. A wrong implementation that returned the enclosing object's
// description (or resolved to the wrong schema entirely) would produce
// header's text ("Global-header configuration for the app...") instead.
test("documents a key nested inside a mapping (header:), not the parent's docs", () => {
  const [text, offset] = at("header:\n  ty|pe: Studio\nsidebar:\n  - x");
  const doc = keyDocumentationAt(text, offset, APP);
  assert.ok(doc, "expected documentation for the nested `type`");
  assert.equal(doc!.key, "type");
  assert.equal(doc!.type, "string");
  assert.equal(doc!.required, true);
  assert.equal(
    doc!.description,
    "Header variant; matches a DS global-header App type. Open by design so new apps can declare their own header.",
  );
  assert.deepEqual(doc!.examples, [
    "Studio",
    "Explorer",
    "Admin",
    "Observability",
  ]);
  // The failure mode this whole test targets: a resolver that stops one
  // level too early and returns the ENCLOSING object's own docs instead of
  // the hovered key's. Pull header's own description straight from the
  // fixture and assert the two differ.
  const appProperties = APP.properties as Record<
    string,
    { description: string }
  >;
  const headerOwnDescription = appProperties["header"]!.description;
  assert.notEqual(doc!.description, headerOwnDescription);
});

// Same guarantee, but through an ARRAY of objects (`properties[]`) rather
// than a plain mapping — the shape the task brief names explicitly. Also
// exercises schemaAtPath's oneOf-branch unwrap (properties.items is
// `oneOf: [string, {object with name/type/example}]`).
test("documents a key inside a properties[] sequence item, resolved through oneOf", () => {
  const [text, offset] = at(
    "properties:\n  - name: status\n    ty|pe: enum\n    example: Draft",
  );
  const doc = keyDocumentationAt(text, offset, ENTITY);
  assert.ok(doc, "expected documentation for the nested `type`");
  assert.equal(doc!.key, "type");
  assert.equal(
    doc!.description,
    "Logical type of the field, used to shape generated form controls and table columns.",
  );
  assert.equal(
    doc!.required,
    false,
    "properties[] items only require `name`, not `type`",
  );
});

// The sibling `name` field in that same sequence item IS required — proves
// the previous test's `required: false` tracks the real schema, not a
// blanket false for every nested key.
test("marks the sibling required field in that same sequence item as required", () => {
  const [text, offset] = at("properties:\n  - na|me: status\n    type: enum");
  const doc = keyDocumentationAt(text, offset, ENTITY);
  assert.ok(doc, "expected documentation for the nested `name`");
  assert.equal(doc!.required, true);
});

test("a key with no `type` in the schema (a bare const) reports type null, not a guess", () => {
  const [text, offset] = at("_schema_ver|sion: 1\nslug: x");
  const doc = keyDocumentationAt(text, offset, ENTITY);
  assert.ok(doc, "expected documentation for `_schema_version`");
  assert.equal(doc!.type, null);
  assert.equal(doc!.description, "Schema version pin.");
  assert.equal(doc!.examples, null, "no examples on this property");
});

test("hovering the VALUE, not the key, yields no documentation", () => {
  // Offset lands inside "studio" (the value), well past `slug`'s own range.
  const [text, offset] = at("slug: stu|dio");
  assert.equal(keyDocumentationAt(text, offset, ENTITY), null);
});

test("hovering a comment line yields no documentation", () => {
  const [text, offset] = at("# yaml-language-server: $sch|ema=x\nslug: x");
  assert.equal(keyDocumentationAt(text, offset, ENTITY), null);
});

// additionalProperties: false at the root, so an unknown key resolves to no
// subschema — the honest "nothing to say" degrade, not a thrown error or a
// fabricated answer.
test("an unknown key under additionalProperties:false yields no documentation", () => {
  const [text, offset] = at("bog|us: true");
  assert.equal(keyDocumentationAt(text, offset, ENTITY), null);
});
