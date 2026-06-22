import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitRawFrontmatter,
  joinRawFrontmatter,
} from "../../src/markdown-engine/rawFrontmatter";

test("splits a frontmatter file into verbatim block + body", () => {
  const t = "---\na: 1\n---\n\n# Body\n\ntext\n";
  const { frontmatterBlock, body } = splitRawFrontmatter(t);
  assert.equal(frontmatterBlock, "---\na: 1\n---\n");
  assert.equal(body, "\n# Body\n\ntext\n");
  assert.equal(joinRawFrontmatter(frontmatterBlock, body), t, "round-trips byte-exact");
});

test("no frontmatter -> empty block, whole text is body", () => {
  const t = "## Heading {#a}\n\ntext\n";
  const { frontmatterBlock, body } = splitRawFrontmatter(t);
  assert.equal(frontmatterBlock, "");
  assert.equal(body, t);
  assert.equal(joinRawFrontmatter("", t), t);
});

test("splits even when frontmatter YAML is not parseable (regex-only)", () => {
  const t = "---\nrefs:\n  - { ref: x, note: a, b, c }\n---\nbody only\n";
  const { frontmatterBlock, body } = splitRawFrontmatter(t);
  assert.equal(frontmatterBlock, "---\nrefs:\n  - { ref: x, note: a, b, c }\n---\n");
  assert.equal(body, "body only\n");
});
