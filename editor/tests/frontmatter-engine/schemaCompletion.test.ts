import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { schemaCompletionSource } from "../../src/frontmatter-engine/schemaCompletion";
import type { JsonSchema } from "../../src/frontmatter-engine/schemaWalk";

const ENTITY: JsonSchema = JSON.parse(
  readFileSync(
    new URL("../../../schemas/app-context-entity.json", import.meta.url)
      .pathname,
    "utf8",
  ),
) as JsonSchema;

function complete(doc: string) {
  const state = EditorState.create({ doc });
  const ctx = new CompletionContext(state, doc.length, true);
  return schemaCompletionSource(ENTITY)(ctx);
}

test("offers top-level keys as you type one", () => {
  const result = complete("slug: dataset\nlabel: Dataset\nre");
  assert.ok(result, "expected a completion result");
  assert.deepEqual(
    result!.options.map((o) => o.label),
    ["relationships"],
  );
  assert.equal(result!.from, "slug: dataset\nlabel: Dataset\n".length);
});

test("omits keys the record already has", () => {
  const result = complete("slug: dataset\n");
  const labels = result!.options.map((o) => o.label);
  assert.ok(!labels.includes("slug"), "slug is already written");
  assert.ok(labels.includes("label"), "label is still missing");
});

test("marks required keys in the completion detail", () => {
  const result = complete("slug: dataset\n");
  const label = result!.options.find((o) => o.label === "label");
  assert.match(label?.detail ?? "", /required/);
});

// Every top-level property in this schema happens to be required, so the
// test above alone would also pass a hardcoded `"required"` label that
// ignores the candidate's actual flag. `properties[]` items require only
// `name`; check a sibling field that is NOT required to prove the detail
// text tracks `c.required` rather than always saying "required".
test("does not mark optional keys as required", () => {
  const result = complete("properties:\n  - name: status\n    ");
  assert.ok(result, "expected a completion result");
  const labels = result!.options.map((o) => o.label).sort();
  assert.deepEqual(labels, ["example", "states", "type"]);
  for (const option of result!.options) {
    assert.doesNotMatch(option.detail ?? "", /required/);
  }
});

test("returns null where the schema constrains nothing", () => {
  assert.equal(complete("label: Data"), null);
});

// Not in the brief's four cases: `apply` (key vs. value insertion text) is
// implemented but was otherwise asserted nowhere in this file. A swapped
// ternary (bare text for keys, `label: ` for values) would pass all four
// tests above unnoticed.
test("inserts a key completion with its trailing colon and space", () => {
  const result = complete("slug: dataset\n");
  const label = result!.options.find((o) => o.label === "label");
  assert.equal(label?.apply, "label: ");
});

test("inserts a value completion bare, with no trailing colon", () => {
  const result = complete("_schema_version: ");
  assert.ok(result, "expected a completion result");
  assert.deepEqual(
    result!.options.map((o) => o.label),
    ["1"],
  );
  assert.equal(result!.options[0]?.apply, "1");
});
