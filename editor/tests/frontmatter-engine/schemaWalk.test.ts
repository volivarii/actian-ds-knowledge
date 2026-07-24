import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  schemaAtPath,
  keyCandidates,
  valueCandidates,
  type JsonSchema,
} from "../../src/frontmatter-engine/schemaWalk";

const ENTITY: JsonSchema = JSON.parse(
  readFileSync(
    new URL("../../../schemas/app-context-entity.json", import.meta.url)
      .pathname,
    "utf8",
  ),
) as JsonSchema;

test("top-level keys come from the schema, minus what is already written", () => {
  const got = keyCandidates(ENTITY, [], ["slug", "label"]).map((c) => c.label);
  assert.deepEqual(got.sort(), [
    "_schema_version",
    "apps",
    "properties",
    "relationships",
  ]);
});

test("required keys are marked required", () => {
  const label = keyCandidates(ENTITY, [], []).find((c) => c.label === "label");
  assert.equal(label?.required, true);
});

test("a candidate carries the schema description as its detail", () => {
  const apps = keyCandidates(ENTITY, [], []).find((c) => c.label === "apps");
  assert.match(apps?.detail ?? "", /App slugs/);
});

// `apps`'s description is one sentence, so the assertion above would pass
// even if the implementation never trimmed at all. `relationships`'s
// description in the real schema has a second sentence ("Referential
// integrity is enforced by scripts/app-context/validate-app-context.js, not
// this schema.") that must NOT leak into `detail`, so this pins the trim
// itself rather than just its no-op case.
test("a multi-sentence description is trimmed to its first sentence", () => {
  const relationships = keyCandidates(ENTITY, [], []).find(
    (c) => c.label === "relationships",
  );
  assert.match(relationships?.detail ?? "", /target entity slug\.$/);
  assert.doesNotMatch(relationships?.detail ?? "", /Referential integrity/);
});

test("keys inside an array of objects come from items, through oneOf", () => {
  const got = keyCandidates(ENTITY, ["properties"], ["name"]).map(
    (c) => c.label,
  );
  assert.deepEqual(got.sort(), ["example", "states", "type"]);
});

test("schemaAtPath returns null for a path the schema does not define", () => {
  assert.equal(schemaAtPath(ENTITY, ["nope"]), null);
});

test("an open map offers no key candidates and does not throw", () => {
  // `relationships` is additionalProperties:{type:string}: any verb is legal,
  // so the schema has nothing to suggest.
  assert.deepEqual(keyCandidates(ENTITY, ["relationships"], []), []);
});

test("value candidates come from const", () => {
  const got = valueCandidates(ENTITY, [], "_schema_version").map(
    (c) => c.label,
  );
  assert.deepEqual(got, ["1"]);
});

test("value candidates are empty where the schema constrains nothing", () => {
  assert.deepEqual(valueCandidates(ENTITY, [], "label"), []);
});
