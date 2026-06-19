import test from "node:test";
import assert from "node:assert/strict";
import { assembleFrontmatterFile } from "../../src/app/FrontmatterBodyEditScreen";
import { splitFrontmatter } from "../../src/substrate/splitFrontmatter";

test("round-trips frontmatter semantically and preserves the body", () => {
  const data = {
    _schema_version: 2,
    slug: "action",
    label: "Action",
    confidence: { anatomy: "medium", variants: "high", motion: "high", a11y: "high" },
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
  const original = "# yaml-language-server: $schema=../../../schemas/category-defaults.json\nslug: action";
  const out = assembleFrontmatterFile({ slug: "action" }, original, "\nbody\n");
  assert.ok(
    out.includes("# yaml-language-server: $schema=../../../schemas/category-defaults.json"),
    "keeps the schema directive comment",
  );
});
