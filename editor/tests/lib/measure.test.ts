import test from "node:test";
import assert from "node:assert/strict";
import { measure } from "../../src/lib/measure";
import type { Slot } from "../../src/lib/slots";

interface Row {
  a: boolean;
  b: boolean;
}
const SLOTS: Slot<Row>[] = [
  { key: "rule", name: "Rule", filled: (r) => r.a, help: "h", action: "Write" },
  { key: "tags", name: "Tags", filled: (r) => r.b, help: "h", action: "Write" },
];
const ROWS: Row[] = [
  { a: true, b: true },
  { a: true, b: false },
  { a: false, b: false },
];

test("a Meter is a count over the records it was given", () => {
  const m = measure(ROWS, SLOTS, "2026-09-03");
  assert.equal(m.length, 2);
  assert.deepEqual(
    m.map((x) => [x.key, x.filled, x.total]),
    [
      ["rule", 2, 3],
      ["tags", 1, 3],
    ],
  );
});

test("the scope IS the array, so all three scopes are one function", () => {
  // Record scope is a one-element array; product scope is a filter; substrate
  // scope is everything. One derivation, three renderings.
  const record = measure([ROWS[1]!], SLOTS, "2026-09-03");
  assert.deepEqual(
    record.map((x) => [x.filled, x.total]),
    [
      [1, 1],
      [0, 1],
    ],
  );
  const product = measure(
    ROWS.filter((r) => r.a),
    SLOTS,
    "2026-09-03",
  );
  assert.deepEqual(
    product.map((x) => [x.filled, x.total]),
    [
      [2, 2],
      [1, 2],
    ],
  );
});

test("a Meter carries no percentage", () => {
  // Honesty rule 1, enforced structurally rather than by convention: there is
  // no field to render a bare percentage from. A ratio is how oracle coverage
  // came to read as progress while its numerator sat flat.
  const m = measure(ROWS, SLOTS, "2026-09-03");
  for (const key of Object.keys(m[0]!)) {
    assert.ok(
      !/percent|ratio|pct/i.test(key),
      `Meter carries a ${key} field`,
    );
    // ...nor an Action verb. Carrying one through the roll-up when no surface
    // renders it is the dead config phase 1 deleted ACTION_LABEL for.
    assert.notEqual(key, "action", "Meter carries an action nothing renders");
  }
});

test("a Meter carries the date it was measured, and measure never invents one", () => {
  const m = measure(ROWS, SLOTS, "2026-09-03");
  assert.equal(m[0]!.measuredAt, "2026-09-03");
  // The caller passes the date because a function that reads its own wall
  // clock cannot be tested and reports a time that is not the data's.
  const other = measure(ROWS, SLOTS, "2020-01-01");
  assert.equal(other[0]!.measuredAt, "2020-01-01");
});

test("a full Meter is marked complete rather than dropped", () => {
  // Honesty rule 4: dimmed, not hidden. A measure that disappears when healthy
  // cannot be seen to regress.
  const m = measure([{ a: true, b: true }], SLOTS, "2026-09-03");
  assert.equal(
    m.every((x) => x.complete),
    true,
  );
  assert.equal(m.length, 2, "a complete Meter must still be returned");
});

test("an empty scope reports 0 of 0 and is not complete", () => {
  // 0/0 is not success. A scope with no records measured nothing, and calling
  // that complete is how a green gate comes to mean nothing was checked.
  const m = measure([], SLOTS, "2026-09-03");
  assert.deepEqual(
    m.map((x) => [x.filled, x.total, x.complete]),
    [
      [0, 0, false],
      [0, 0, false],
    ],
  );
});

