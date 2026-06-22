"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fm = require("../scripts/lib/frontmatter");

test("parse: splits fenced frontmatter from body", () => {
  const src = "---\ntitle: Hello\ncount: 3\nflag: true\n---\nBody line one\n";
  const { data, body } = fm.parse(src);
  assert.deepEqual(data, { title: "Hello", count: 3, flag: true });
  assert.equal(body, "Body line one\n");
});

test("parse: flow map with QUOTED prose commas", () => {
  const src =
    '---\nparts:\n  - { name: Container, description: "focus, hover, press" }\n---\n';
  const { data } = fm.parse(src);
  assert.deepEqual(data.parts, [
    { name: "Container", description: "focus, hover, press" },
  ]);
});

test("parseFrontmatter: fence-less .yml string → object", () => {
  const data = fm.parseFrontmatter(
    "content: { status: approved, owner: content-team }\n",
    0,
  );
  assert.deepEqual(data, {
    content: { status: "approved", owner: "content-team" },
  });
});

test("parseFrontmatter: empty input → {}", () => {
  assert.deepEqual(fm.parseFrontmatter("", 0), {});
});

test("splitFrontmatter: missing opening fence throws", () => {
  assert.throws(() => fm.splitFrontmatter("no fence here\n"), /opening `---`/);
});

test("parse: missing closing fence throws", () => {
  assert.throws(() => fm.parse("---\nslug: test\nlabel: T\n"), /closing `---`/);
});

test("parse: block-nested object (one level)", () => {
  const { data } = fm.parse(
    "---\nslug: x\nconfidence:\n  anatomy: medium\n  a11y: high\n---\n",
  );
  assert.deepEqual(data.confidence, { anatomy: "medium", a11y: "high" });
});

test("parse: block array of flow objects", () => {
  const { data } = fm.parse(
    "---\nanatomy:\n  - { name: A, description: alpha }\n  - { name: B, description: beta }\n---\n",
  );
  assert.deepEqual(data.anatomy, [
    { name: "A", description: "alpha" },
    { name: "B", description: "beta" },
  ]);
});

test("parse: strips comments + coerces integers", () => {
  const { data } = fm.parse(
    "---\nslug: x  # c\n_schema_version: 2   # pin\n---\n",
  );
  assert.equal(data.slug, "x");
  assert.equal(data._schema_version, 2);
  assert.equal(typeof data._schema_version, "number");
});

test("parse: ISO date stays a string (YAML 1.2 core, no timestamp type)", () => {
  const { data } = fm.parse("---\nlast_reviewed: 2026-05-12\n---\n");
  assert.equal(data.last_reviewed, "2026-05-12");
  assert.equal(typeof data.last_reviewed, "string");
});

test("parse: indented top-level key is rejected (strict YAML)", () => {
  assert.throws(() => fm.parse("---\n  slug: x\nlabel: X\n---\n"));
});
