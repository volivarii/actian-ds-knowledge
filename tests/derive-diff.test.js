"use strict";

// Unit tests for scripts/derive-diff/compute-derive-diff.js.
// Exercises the diffSnapshots + renderMarkdown helpers with hand-crafted
// snapshots — no need to run the actual derive scripts in unit tests.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { diffSnapshots, renderMarkdown } = require(
  path.resolve(__dirname, "..", "scripts", "derive-diff", "compute-derive-diff.js"),
);

test("diffSnapshots — no changes", () => {
  const a = { "a.json": "h1", "b.json": "h2" };
  const b = { "a.json": "h1", "b.json": "h2" };
  const d = diffSnapshots(a, b);
  assert.deepEqual(d, { added: [], modified: [], removed: [] });
});

test("diffSnapshots — added + modified + removed", () => {
  const before = { "keep.json": "h1", "change.json": "h2", "gone.json": "h3" };
  const after = { "keep.json": "h1", "change.json": "h2-NEW", "new.json": "h4" };
  const d = diffSnapshots(before, after);
  assert.deepEqual(d.added, ["new.json"]);
  assert.deepEqual(d.modified, ["change.json"]);
  assert.deepEqual(d.removed, ["gone.json"]);
});

test("renderMarkdown — empty diff prints no-changes notice", () => {
  const md = renderMarkdown({ added: [], modified: [], removed: [] });
  assert.match(md, /No changes to derived dist files/);
});

test("renderMarkdown — formatted output with counts", () => {
  const md = renderMarkdown({
    added: ["foundations/dist/tokens/borders/_index.json", "foundations/dist/tokens/borders/radius.json"],
    modified: ["foundations/dist/tokens/typography/font-size.json"],
    removed: ["foundations/dist/component-specs/_index.json"],
  });
  assert.match(md, /\*\*Added\*\* \(2 files\)/);
  assert.match(md, /\*\*Modified\*\* \(1 file\)/);
  assert.match(md, /\*\*Removed\*\* \(1 file\)/);
  assert.match(md, /foundations\/dist\/tokens\/borders\/radius\.json/);
});

test("renderMarkdown — pluralization is correct", () => {
  const md = renderMarkdown({ added: ["only-one.json"], modified: [], removed: [] });
  assert.match(md, /\*\*Added\*\* \(1 file\):/);
  assert.doesNotMatch(md, /\(1 files\)/);
});
