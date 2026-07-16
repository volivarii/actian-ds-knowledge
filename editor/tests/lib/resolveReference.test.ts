// Resolves a markdown link href to a typed substrate reference, so an inline
// link like [table](table) can be rendered as a typed chip rather than a bare
// slug. Only bare component slugs that actually exist in the graph resolve;
// external URLs, paths, in-doc anchors, and unknown slugs stay plain links
// (honest: an unresolved slug is not dressed up as a real reference).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveReference } from "../../src/lib/resolveReference";

test("a bare slug that names a real component resolves to a typed component reference", () => {
  assert.deepEqual(resolveReference("button"), {
    slug: "button",
    type: "component",
  });
  assert.deepEqual(resolveReference("table"), {
    slug: "table",
    type: "component",
  });
});

test("a bare slug with no matching component node stays unresolved", () => {
  // dropdown-select is linked from Button's usage prose but is not a component
  // node in the graph, so it must NOT be dressed as a real reference.
  assert.equal(resolveReference("dropdown-select"), null);
  assert.equal(resolveReference("nonexistent-xyz-slug"), null);
});

test("non-slug hrefs never resolve (external URL, path, in-doc anchor)", () => {
  assert.equal(resolveReference("https://example.com"), null);
  assert.equal(resolveReference("/components/src/button"), null);
  assert.equal(resolveReference("#usage"), null);
  assert.equal(resolveReference("mailto:x@y.com"), null);
  assert.equal(resolveReference(""), null);
});
