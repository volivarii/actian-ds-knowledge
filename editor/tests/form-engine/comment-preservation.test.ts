import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleFrontmatterFilePreservingComments } from "../../src/form-engine/yamlSerializer";
import { splitFrontmatter } from "../../src/substrate/splitFrontmatter";

const FILE = [
  "---",
  'title: "Forms"',
  "nav_order: 14",
  "# Pattern fan-out - initial set. Skipped: search (has its own pattern).",
  "# Jeff: edit/correct/extend.",
  "relatedComponents: [text-input, checkbox-with-label, toggle]",
  "---",
  "",
  "Body prose.",
  "",
].join("\n");

test("interleaved comments survive a form-value edit", () => {
  const { data, frontmatterText, body } = splitFrontmatter(FILE);
  assert.ok(data && frontmatterText);
  const edited = { ...(data as object), title: "Form patterns" }; // user changed title
  const out = assembleFrontmatterFilePreservingComments(edited, frontmatterText, body);
  assert.ok(out.includes("# Pattern fan-out - initial set"), "interleaved comment 1 kept");
  assert.ok(out.includes("# Jeff: edit/correct/extend."), "interleaved comment 2 kept");
  assert.match(out, /title:\s*["']?Form patterns["']?/, "title updated");
  const reparsed = splitFrontmatter(out);
  assert.deepEqual((reparsed.data as { relatedComponents: string[] }).relatedComponents, [
    "text-input", "checkbox-with-label", "toggle",
  ], "relatedComponents preserved");
});

test("no-frontmatter / null originalText falls back cleanly", () => {
  const out = assembleFrontmatterFilePreservingComments({ title: "X" }, null, "Body.\n");
  assert.match(out, /title:\s*["']?X["']?/);
});
