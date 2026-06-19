import test from "node:test";
import assert from "node:assert/strict";
import { splitFrontmatter } from "../../src/substrate/splitFrontmatter";

test("splits a fenced file into data, body, frontmatterText", () => {
  const src = "---\nslug: action\nlabel: Action\n---\n\n# Body\ntext\n";
  const r = splitFrontmatter(src);
  assert.deepEqual(r.data, { slug: "action", label: "Action" });
  assert.equal(r.body, "\n# Body\ntext\n");
  assert.equal(r.frontmatterText, "slug: action\nlabel: Action");
});

test("returns null data + whole input as body when no frontmatter", () => {
  const r = splitFrontmatter("# Just a heading\n");
  assert.equal(r.data, null);
  assert.equal(r.body, "# Just a heading\n");
  assert.equal(r.frontmatterText, null);
});

test("returns null data (tolerant) when frontmatter YAML is malformed", () => {
  // ': :' is invalid YAML inside the fence
  const src = "---\nslug: action\n: : bad\n---\nbody\n";
  const r = splitFrontmatter(src);
  assert.equal(r.data, null);
  assert.equal(r.body, src);
});
