import { test } from "node:test";
import assert from "node:assert/strict";
import { matchFrontmatterForm } from "../../src/lib/frontmatterForms";
import { assembleFrontmatterFile } from "../../src/app/FrontmatterBodyEditScreen";
import { splitFrontmatter } from "../../src/substrate/splitFrontmatter";

// Fixture modeled on the real foundations/src/tokens.md frontmatter:
// leading comment block + flow-style arrays of {ref, note}.
const FM = [
  "# P8 transversal refs - file-scoped (Option A). Authoritative subsection",
  "# inventory lives elsewhere; this file's refs are the union across sections.",
  "a11y_refs:",
  "  - { ref: typography, note: covers text token rules }",
  "  - { ref: focus-keyboard, note: focus-ring tokens }",
  "motion_refs:",
  "  - { ref: drawer-open-close }",
  "  - { ref: success-toast }",
].join("\n");
const FILE = `---\n${FM}\n---\n\nBody prose here.\n`;

test("foundations files route to the foundations form, block style", () => {
  const m = matchFrontmatterForm("foundations/src/tokens.md");
  assert.equal(m?.schemaKey, "foundations");
  assert.equal(m?.flowAtDepth, null);
});

test("block-style serialize is semantically identical (dist-safe)", () => {
  const { data, frontmatterText, body } = splitFrontmatter(FILE);
  assert.ok(data); // parses under the yaml lib
  const out = assembleFrontmatterFile(data, frontmatterText, body, null);
  const reparsed = splitFrontmatter(out);
  // foundations-derive parses frontmatter via YAML.parse (scripts/lib/frontmatter.js),
  // so semantic equality of parsed data proves dist output is unchanged.
  assert.deepEqual(reparsed.data, data);
});

test("leading comment block is preserved verbatim on save", () => {
  const { data, frontmatterText, body } = splitFrontmatter(FILE);
  const out = assembleFrontmatterFile(data, frontmatterText, body, null);
  assert.ok(out.includes("# P8 transversal refs - file-scoped (Option A)"));
});

test("block style has no inline flow maps after serialize", () => {
  const { data, frontmatterText, body } = splitFrontmatter(FILE);
  const out = assembleFrontmatterFile(data, frontmatterText, body, null);
  assert.ok(!/-\s*\{\s*ref:/.test(out)); // no `- { ref: ... }` flow maps remain
});
