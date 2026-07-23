import { test } from "node:test";
import assert from "node:assert/strict";
import { listContextRecords } from "../../src/lib/contextRecords";

// Grounded on the real baked graph, asserting invariants rather than a frozen
// snapshot: the counts move whenever a product ships, the shape must not.
const records = listContextRecords();

test("lists both entities and features", () => {
  assert.ok(records.some((r) => r.kind === "entity"));
  assert.ok(records.some((r) => r.kind === "feature"));
});

test("every record carries a label and an authorable source path", () => {
  for (const r of records) {
    assert.ok(r.label.trim().length > 0, `${r.slug} has no label`);
    assert.equal(
      r.path,
      `app-context/src/${r.kind === "entity" ? "entities" : "patterns"}/${r.slug}.md`,
    );
  }
});

test("usedBy carries product labels, never slugs or node ids", () => {
  const withProducts = records.filter((r) => r.usedBy.length > 0);
  assert.ok(withProducts.length > 0, "no record is used by any product");
  for (const r of withProducts) {
    for (const product of r.usedBy) {
      assert.doesNotMatch(product, /^app:/, `${r.slug} leaks a node id`);
      assert.match(product, /^[A-Z]/, `${r.slug} leaks a slug: ${product}`);
    }
  }
});

test("a known shared record reports the products that depend on it", () => {
  const dataProduct = records.find(
    (r) => r.kind === "entity" && r.slug === "data-product",
  );
  assert.ok(dataProduct, "data-product entity missing from the graph");
  assert.ok(dataProduct.usedBy.includes("Studio"));
});

test("records are sorted by label within kind, for a stable picker", () => {
  for (const kind of ["entity", "feature"] as const) {
    const labels = records.filter((r) => r.kind === kind).map((r) => r.label);
    assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b)));
  }
});
