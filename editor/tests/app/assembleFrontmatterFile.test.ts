import test from "node:test";
import assert from "node:assert/strict";
import { assembleFrontmatterFile } from "../../src/app/FrontmatterBodyEditScreen";
import { splitFrontmatter } from "../../src/substrate/splitFrontmatter";
import { assembleFrontmatterFilePreservingComments, preserveFenceSeparator } from "../../src/form-engine/yamlSerializer";

test("round-trips frontmatter semantically and preserves the body", () => {
  const data = {
    _schema_version: 2,
    slug: "action",
    label: "Action",
    confidence: {
      anatomy: "medium",
      variants: "high",
      motion: "high",
      a11y: "high",
    },
  };
  const body = "\n# Action\nprose\n";
  const out = assembleFrontmatterFile(data, "slug: action", body);
  assert.ok(out.startsWith("---\n"), "opens with a fence");
  assert.ok(out.includes("\n---\n"), "has a closing fence");
  const reparsed = splitFrontmatter(out);
  assert.deepEqual(reparsed.data, data);
  assert.equal(reparsed.body, body);
});

test("preserves a leading yaml-language-server comment", () => {
  const original =
    "# yaml-language-server: $schema=../../../schemas/category-defaults.json\nslug: action";
  const out = assembleFrontmatterFile({ slug: "action" }, original, "\nbody\n");
  assert.ok(
    out.includes(
      "# yaml-language-server: $schema=../../../schemas/category-defaults.json",
    ),
    "keeps the schema directive comment",
  );
});

// Fix B: flowAtDepth param
const APP_FORM_DATA = {
  _schema_version: 1,
  slug: "studio",
  label: "Studio",
  header: { type: "Studio" },
  sidebar: [{ label: "Dashboard", id: "dashboard" }],
};
const APP_BODY = "\n## Purpose\n\nGovernance\n";

test("assembleFrontmatterFile with flowAtDepth=null produces block-style sidebar", () => {
  const out = assembleFrontmatterFile(APP_FORM_DATA, null, APP_BODY, null);
  // Block-style: each sidebar item expanded across multiple lines
  assert.ok(out.includes("- label:"), "has block-style '- label:' key");
  assert.ok(out.includes("  id:"), "has block-style '  id:' indented key");
  assert.ok(!out.includes("- { label"), "does NOT have flow-style '- { label'");
  assert.ok(!out.includes("- {label"), "does NOT have flow-style '- {label'");
});

test("assembleFrontmatterFile default (no 4th arg) produces flow-style sidebar", () => {
  const out = assembleFrontmatterFile(APP_FORM_DATA, null, APP_BODY);
  // Default flowAtDepth:2 → sidebar items serialize as inline objects
  const hasFlow = out.includes("- { label") || out.includes("- {label");
  assert.ok(hasFlow, "default serialization uses flow-style for sidebar items");
});

// Sub-task 1114 (F15): a save of an unchanged file must produce the bytes that
// were loaded. The assembler used to force a blank line after the closing
// fence, and 87 of the 97 frontmatter files in this repo have none, so every
// save of those files carried one byte the author never typed, and a file
// typed back to what it was could never leave the batch.
test("1114: an unchanged file with no blank line after the fence reassembles to identical bytes", () => {
  const file = "---\ntitle: \"Forms\"\nnav_order: 14\n---\n# Forms\n\nProse.\n";
  const split = splitFrontmatter(file);
  assert.ok(split.data, "fixture parses");
  assert.equal(
    assembleFrontmatterFilePreservingComments(split.data, split.frontmatterText, split.body),
    file,
    "comment-preserving path is byte-stable",
  );
  // The plain path re-serialises YAML (quotes are its own call), so its
  // byte-stability is asserted on a fixture it would write itself.
  const plain = "---\ntitle: Forms\nnav_order: 14\n---\n# Forms\n\nProse.\n";
  const p = splitFrontmatter(plain);
  assert.equal(
    assembleFrontmatterFile(p.data, p.frontmatterText, p.body, 2),
    plain,
    "plain path adds no blank line after the fence",
  );
});

test("1114: an unchanged file WITH a blank line after the fence keeps it", () => {
  const file = "---\ntitle: \"Forms\"\n---\n\n# Forms\n";
  const split = splitFrontmatter(file);
  assert.equal(
    assembleFrontmatterFilePreservingComments(split.data, split.frontmatterText, split.body),
    file,
  );
});

// The rich editor's round trip drops a blank line at the top of the body, and
// the assembler used to put one back for EVERY file. The blank line is the
// loaded file's property: restore it only where it was, never invent it.
test("1114: preserveFenceSeparator restores a blank line the round trip dropped, and never invents one", () => {
  assert.equal(preserveFenceSeparator("\n# Title\n", "# Title\n"), "\n# Title\n", "had one, lost it: restored");
  assert.equal(preserveFenceSeparator("# Title\n", "# Title\n"), "# Title\n", "never had one: none added");
  assert.equal(preserveFenceSeparator("\n# Title\n", "\n# Title\n"), "\n# Title\n", "had one, kept it: unchanged");
  assert.equal(preserveFenceSeparator("# Title\n", "\n# Title\n"), "\n# Title\n", "gained one in the editor: a real edit, kept");
});
