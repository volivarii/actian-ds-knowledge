import test from "node:test";
import assert from "node:assert/strict";
import { assembleFrontmatterFile } from "../../src/app/FrontmatterBodyEditScreen";
import { splitFrontmatter } from "../../src/substrate/splitFrontmatter";

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
