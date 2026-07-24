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
  const got = keyCandidates(ENTITY, ["properties"], ["name"]);
  assert.deepEqual(got.map((c) => c.label).sort(), [
    "example",
    "states",
    "type",
  ]);
  // Every top-level property of ENTITY is required, so `required.has(name)`
  // and a hardcoded `true` return are indistinguishable there — all six
  // top-level candidates come back `required: true` either way. This
  // branch's own `required` is `["name"]`, so `type`/`example`/`states` are
  // the fixture's one real negative case: without this assertion, a stub
  // that always returns `required: true` passes every test in this file.
  const notRequired = got.filter((c) => c.required === false);
  assert.ok(
    notRequired.length > 0,
    "expected at least one of type/example/states to be required: false",
  );
});

test("schemaAtPath returns null for a path the schema does not define", () => {
  assert.equal(schemaAtPath(ENTITY, ["nope"]), null);
});

// `schemaAtPath(ENTITY, ["nope"])` above only exercises the additionalProperties
// fallback's FAILURE side: the root sets `additionalProperties: false`, so the
// guard rejects before the assignment runs, and at that single step
// `current === schema`, so it can't distinguish the shipped
// `current.additionalProperties` from a `schema.additionalProperties`
// regression. `relationships` is an open map two steps down
// (`additionalProperties: {type: "string"}`), where `current` genuinely
// differs from the root `schema` by the time the fallback fires — this is
// where the fallback's SUCCESS path, and that current-vs-schema distinction,
// actually get tested.
test("the additionalProperties fallback resolves through an open map two steps down", () => {
  assert.deepEqual(schemaAtPath(ENTITY, ["relationships", "owns"]), {
    type: "string",
  });
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

// The real schemas contain no `enum` keyword anywhere — the only textual
// hits in app-context-entity.json are the word "enum" inside an example
// value and inside a description, not the keyword itself. So against ENTITY,
// a correct items.enum redirect and a broken one both return []; this branch
// is otherwise untested even though Task 4 needs it for scalar-sequence
// value completion. Hence a small synthetic schema here rather than a read
// of the real fixture.
test("value candidates for a scalar sequence redirect through items.enum", () => {
  const stageSchema: JsonSchema = {
    type: "object",
    properties: {
      stage: {
        type: "array",
        items: { type: "string", enum: ["a", "b"] },
      },
    },
  };
  const got = valueCandidates(stageSchema, [], "stage").map((c) => c.label);
  assert.deepEqual(got, ["a", "b"]);
});

// Pins the module header's documented $ref behavior: no resolution is
// attempted, so an unresolved $ref degrades to "no candidates" rather than
// an error. The six real form schemas contain zero $ref/$defs today
// (verified 2026-07-24), so this synthetic schema is the only way to
// exercise the branch.
test("an unresolved $ref yields no candidates, not an error", () => {
  const schema: JsonSchema = {
    type: "object",
    properties: { thing: { $ref: "#/$defs/T" } },
  };
  assert.deepEqual(schemaAtPath(schema, ["thing"]), { $ref: "#/$defs/T" });
  assert.deepEqual(keyCandidates(schema, ["thing"], []), []);
});
