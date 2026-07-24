// jsdom, not happy-dom: happy-dom is the ProseMirror/Milkdown bootstrap.
// CodeMirror tests in this repo use setup-dom (see
// tests/markdown-engine/CodeMirrorEditor.test.tsx:1).
import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render, cleanup, screen } from "@testing-library/react";
import { YamlFrontmatterEditor } from "../../src/frontmatter-engine/YamlFrontmatterEditor";
import type { JsonSchema } from "../../src/frontmatter-engine/schemaWalk";

afterEach(cleanup);

const ENTITY: JsonSchema = JSON.parse(
  readFileSync(
    new URL("../../../schemas/app-context-entity.json", import.meta.url)
      .pathname,
    "utf8",
  ),
) as JsonSchema;

test("renders the frontmatter text as editable content", async () => {
  render(
    <YamlFrontmatterEditor
      initialText={"slug: dataset\nlabel: Dataset"}
      schema={ENTITY}
      onChange={() => {}}
    />,
  );
  const surface = await screen.findByRole("textbox", {}, { timeout: 5000 });
  assert.match(surface.textContent ?? "", /slug: dataset/);
  assert.match(surface.textContent ?? "", /label: Dataset/);
});

test("labels the surface for assistive tech", async () => {
  render(
    <YamlFrontmatterEditor
      initialText="slug: x"
      schema={ENTITY}
      onChange={() => {}}
    />,
  );
  const surface = await screen.findByRole("textbox", {}, { timeout: 5000 });
  assert.equal(surface.getAttribute("aria-label"), "Frontmatter YAML");
});
