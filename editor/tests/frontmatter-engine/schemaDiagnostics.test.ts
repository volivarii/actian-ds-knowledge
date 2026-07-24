import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { frontmatterDiagnostics } from "../../src/frontmatter-engine/schemaDiagnostics";
import type { JsonSchema } from "../../src/frontmatter-engine/schemaWalk";

const ENTITY: JsonSchema = JSON.parse(
  readFileSync(
    new URL("../../../schemas/app-context-entity.json", import.meta.url)
      .pathname,
    "utf8",
  ),
) as JsonSchema;

const VALID = [
  "_schema_version: 1",
  "slug: dataset",
  "label: Dataset",
  "properties:",
  "  - name",
  "relationships:",
  "  hasFields: field",
  "apps:",
  "  - studio",
].join("\n");

test("a valid record produces no diagnostics", () => {
  assert.deepEqual(frontmatterDiagnostics(VALID, ENTITY), []);
});

test("an unknown key is reported at that key's position", () => {
  const text = VALID + "\nnonsense: true";
  const diags = frontmatterDiagnostics(text, ENTITY);
  assert.equal(diags.length, 1);
  assert.match(diags[0]!.message, /nonsense/);
  assert.ok(
    diags[0]!.from >= text.indexOf("nonsense"),
    "diagnostic should point at or after the offending key",
  );
});

test("a wrong type is reported at the offending value", () => {
  const text = VALID.replace("label: Dataset", "label: 42");
  const diags = frontmatterDiagnostics(text, ENTITY);
  assert.equal(diags.length, 1);
  assert.match(diags[0]!.message, /string/);
});

test("a missing required key is reported", () => {
  const text = VALID.replace("label: Dataset\n", "");
  const diags = frontmatterDiagnostics(text, ENTITY);
  assert.equal(diags.length, 1);
  assert.match(diags[0]!.message, /label/);
  // The message is computed independently of the range (name vs. node
  // lookup), so a passing message assertion alone doesn't catch a regression
  // that collapses the range to something zero-width and invisible in the
  // editor gutter. A root-level required-property error has no node of its
  // own to point at, so it falls back to the documented "first line of the
  // document" cue; pin that contract explicitly.
  const firstLineEnd = text.indexOf("\n") + 1;
  assert.equal(diags[0]!.from, 0);
  assert.equal(diags[0]!.to, firstLineEnd);
});

test("broken YAML is reported instead of schema errors", () => {
  const diags = frontmatterDiagnostics("slug: [unclosed\n", ENTITY);
  assert.equal(diags.length, 1);
  assert.ok(diags[0]!.to >= diags[0]!.from);
});

test("diagnostic ranges stay inside the document", () => {
  const text = VALID + "\nnonsense: true";
  for (const d of frontmatterDiagnostics(text, ENTITY)) {
    assert.ok(d.from >= 0 && d.to <= text.length, "range out of bounds");
  }
});

// The six tests above are transcribed verbatim from the task brief. The
// brief's own "unknown key" test only asserts `from >= indexOf("nonsense")`,
// which a diagnostic pointing at the key's VALUE (rather than the key
// itself) would also satisfy, since the value sits later in the text. And
// the brief's "wrong type" test never inspects a range at all. Both gaps are
// named explicitly in the task's diagnostics checklist, so the following
// tests close them with exact-range assertions.

test("an unknown key's range brackets exactly the key text, not its value", () => {
  const text = VALID + "\nnonsense: true";
  const diags = frontmatterDiagnostics(text, ENTITY);
  assert.equal(diags.length, 1);
  const start = text.indexOf("nonsense");
  assert.equal(diags[0]!.from, start);
  assert.equal(diags[0]!.to, start + "nonsense".length);
});

test("a wrong type's range brackets exactly the offending value, not the key or the document", () => {
  const text = VALID.replace("label: Dataset", "label: 42");
  const diags = frontmatterDiagnostics(text, ENTITY);
  assert.equal(diags.length, 1);
  const start = text.indexOf("42");
  assert.equal(diags[0]!.from, start);
  assert.equal(diags[0]!.to, start + "42".length);
});

test("a YAML parse error at end of input stays within document bounds", () => {
  // yaml's reported error position can exceed the source length (observed:
  // pos [16, 17] against a 16-character document), so the clamp in the
  // parse-error branch is load-bearing, not decorative.
  const text = "slug: [unclosed\n";
  const diags = frontmatterDiagnostics(text, ENTITY);
  assert.equal(diags.length, 1);
  assert.ok(
    diags[0]!.from >= 0 && diags[0]!.to <= text.length,
    "range out of bounds",
  );
});

test("compiling two separately-parsed copies of the same schema does not collide", () => {
  // FrontmatterBodyEditScreen does `schema = JSON.parse(schemaText)` inside
  // its load effect, which re-runs on every file open. Two DIFFERENT objects
  // parsed from the same schema file share the same $id, and Ajv's default
  // addUsedSchema:true would throw `schema with key or id "..." already
  // exists` the second time compile() sees that $id — a crash reachable by
  // opening a second app-context record in the same session. Regenerate the
  // schema object from source text rather than reusing ENTITY, so this test
  // actually exercises two distinct objects the way the real caller does.
  const schemaText = readFileSync(
    new URL("../../../schemas/app-context-entity.json", import.meta.url)
      .pathname,
    "utf8",
  );
  const schemaA = JSON.parse(schemaText) as JsonSchema;
  const schemaB = JSON.parse(schemaText) as JsonSchema;
  assert.notEqual(
    schemaA,
    schemaB,
    "test setup must produce two distinct objects, not a shared reference",
  );

  const resultA = frontmatterDiagnostics(VALID, schemaA);
  const resultB = frontmatterDiagnostics(VALID, schemaB);
  assert.deepEqual(resultA, []);
  assert.deepEqual(resultB, resultA);
});

test("a schema Ajv cannot compile is reported as a diagnostic, not thrown", () => {
  // A schema Ajv can't compile (here: an invalid regex in `pattern`) must
  // stay inside the function's return contract. Task 6 wraps this call in a
  // linter() callback that has no way to catch an exception, so an
  // uncaught throw here would crash the editor's lint pass outright.
  const brokenSchema = {
    $id: "https://actian-ds.example.com/schemas/broken-test-schema.json",
    type: "object",
    properties: {
      label: { type: "string", pattern: "[" },
    },
  } as unknown as JsonSchema;

  const diags = frontmatterDiagnostics(VALID, brokenSchema);
  assert.equal(diags.length, 1);
  assert.equal(diags[0]!.severity, "error");
  assert.ok(diags[0]!.message.length > 0, "message should not be empty");
  // Not swallowed into silence: the diagnostic must land somewhere visible
  // (the documented first-line fallback), not a zero-width phantom range.
  const firstLineEnd = VALID.indexOf("\n") + 1;
  assert.equal(diags[0]!.from, 0);
  assert.equal(diags[0]!.to, firstLineEnd);
});
