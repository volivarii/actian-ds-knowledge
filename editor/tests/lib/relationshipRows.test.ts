import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rowsFromMap,
  mapFromRows,
  verbsFromSchema,
} from "../../src/lib/relationshipRows";

test("a verb's list becomes one row per target, in order", () => {
  assert.deepEqual(
    rowsFromMap({ contains: ["metadata", "lineage"], belongsTo: ["domain"] }),
    [
      { verb: "contains", target: "metadata" },
      { verb: "contains", target: "lineage" },
      { verb: "belongsTo", target: "domain" },
    ],
  );
});

test("a record still in the old shape renders rather than vanishing", () => {
  // A bare string was the shape before a verb could carry several targets.
  // Skipping it would empty the form of the very record being edited.
  assert.deepEqual(rowsFromMap({ belongsTo: "domain" }), [
    { verb: "belongsTo", target: "domain" },
  ]);
});

test("nothing usable yields no rows, and never throws", () => {
  for (const junk of [null, undefined, [], "x", 3, { contains: [1, null] }]) {
    assert.deepEqual(rowsFromMap(junk), [], JSON.stringify(junk));
  }
});

test("rows group back under their verb, in first-appearance order", () => {
  assert.deepEqual(
    mapFromRows([
      { verb: "contains", target: "metadata" },
      { verb: "belongsTo", target: "domain" },
      { verb: "contains", target: "lineage" },
    ]),
    { contains: ["metadata", "lineage"], belongsTo: ["domain"] },
  );
});

test("a half-finished row is not saved", () => {
  // Every new row starts as a verb with no target. Saving it would write a
  // verb with an empty list, which the schema refuses and which says nothing.
  assert.deepEqual(mapFromRows([{ verb: "contains", target: "" }]), {});
  assert.deepEqual(mapFromRows([{ verb: "", target: "domain" }]), {});
});

test("the same thing is not asserted twice", () => {
  assert.deepEqual(
    mapFromRows([
      { verb: "contains", target: "metadata" },
      { verb: "contains", target: "metadata" },
    ]),
    { contains: ["metadata"] },
  );
});

test("a round trip through both directions is stable", () => {
  const map = { contains: ["metadata", "lineage"], uses: ["connection"] };
  assert.deepEqual(mapFromRows(rowsFromMap(map)), map);
});

test("the verb list comes from the schema, or is empty", () => {
  assert.deepEqual(
    verbsFromSchema({ propertyNames: { enum: ["contains", "uses"] } }),
    ["contains", "uses"],
  );
  for (const none of [{}, null, { propertyNames: {} }, { propertyNames: { enum: "x" } }])
    assert.deepEqual(verbsFromSchema(none), []);
});
