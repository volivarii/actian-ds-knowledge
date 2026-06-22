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
