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
  const out = assembleFrontmatterFilePreservingComments(
    edited,
    frontmatterText,
    body,
  );
  assert.ok(
    out.includes("# Pattern fan-out - initial set"),
    "interleaved comment 1 kept",
  );
  assert.ok(
    out.includes("# Jeff: edit/correct/extend."),
    "interleaved comment 2 kept",
  );
  assert.match(out, /title:\s*["']?Form patterns["']?/, "title updated");
  const reparsed = splitFrontmatter(out);
  assert.deepEqual(
    (reparsed.data as { relatedComponents: string[] }).relatedComponents,
    ["text-input", "checkbox-with-label", "toggle"],
    "relatedComponents preserved",
  );
});

test("no-frontmatter / null originalText falls back cleanly", () => {
  const out = assembleFrontmatterFilePreservingComments(
    { title: "X" },
    null,
    "Body.\n",
  );
  assert.match(out, /title:\s*["']?X["']?/);
});

const FOUND = [
  "---",
  "# P8 transversal refs - file scoped.",
  "a11y_refs:",
  "  - { ref: typography, note: text token rules }",
  "  - { ref: focus-keyboard, note: focus-ring tokens }",
  "motion_refs:",
  "  - { ref: drawer-open-close }",
  "  - { ref: success-toast }",
  "---",
  "",
  "Body.",
  "",
].join("\n");

test("removing BOTH adjacent keys drops both (no iterator-skip resurrection)", () => {
  const { frontmatterText, body } = splitFrontmatter(FOUND);
  const out = assembleFrontmatterFilePreservingComments(
    {},
    frontmatterText,
    body,
  );
  assert.doesNotMatch(out, /a11y_refs:/);
  assert.doesNotMatch(out, /motion_refs:/); // the bug: motion_refs used to survive
});

test("removing only the first of two adjacent keys keeps the second gone-check correct", () => {
  const { data, frontmatterText, body } = splitFrontmatter(FOUND);
  const kept = { motion_refs: (data as { motion_refs: unknown }).motion_refs }; // a11y_refs removed
  const out = assembleFrontmatterFilePreservingComments(
    kept,
    frontmatterText,
    body,
  );
  assert.doesNotMatch(out, /a11y_refs:/);
  assert.match(out, /motion_refs:/);
});

test("editing only one key does NOT reflow untouched inline values (no churn)", () => {
  const src = [
    "---",
    'title: "Forms"',
    "# note about rc",
    "relatedComponents: [a, b, c]",
    "---",
    "",
    "Body.",
    "",
  ].join("\n");
  const { data, frontmatterText, body } = splitFrontmatter(src);
  const edited = { ...(data as object), title: "Renamed" };
  const out = assembleFrontmatterFilePreservingComments(
    edited,
    frontmatterText,
    body,
  );
  assert.match(
    out,
    /relatedComponents:\s*\[a, b, c\]/,
    "untouched flow array stays inline",
  );
  assert.match(out, /# note about rc/, "comment kept");
  assert.match(out, /title:\s*["']?Renamed["']?/);
});
