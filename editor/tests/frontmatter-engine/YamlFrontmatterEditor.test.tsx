// jsdom, not happy-dom: happy-dom is the ProseMirror/Milkdown bootstrap.
// CodeMirror tests in this repo use setup-dom (see
// tests/markdown-engine/CodeMirrorEditor.test.tsx:1).
import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { forceLinting } from "@codemirror/lint";
import { startCompletion } from "@codemirror/autocomplete";
import { YamlFrontmatterEditor } from "../../src/frontmatter-engine/YamlFrontmatterEditor";
import type { JsonSchema } from "../../src/frontmatter-engine/schemaWalk";

afterEach(cleanup);

// `EditorView.destroyed` is a private field in CM6's own types (it is a
// plain property at runtime, not a real JS private field), so a structural
// cast through `unknown` reads it without extending EditorView's type.
interface DestroyableView {
  destroyed: boolean;
}

/** Grab the live CM6 view mounted under the pane's host element. */
function findView(host: HTMLElement): EditorView {
  const view = EditorView.findFromDOM(host);
  assert.ok(view, "expected a live EditorView attached to the host");
  return view;
}

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

// Neither test above exercises linting, completion, onChange-after-rerender,
// or unmount teardown: the text comes straight from `doc:`, the aria-label
// from `contentAttributes`, and CM6 sets role="textbox" on its own. The four
// tests below join the pure frontmatter-engine modules to a live view so a
// regression in any of those four wires is actually observable.

test("mounts the linter: a schema-invalid record produces a lint decoration", async () => {
  render(
    <YamlFrontmatterEditor
      // Fails validation twice over: "NOT-VALID" doesn't match slug's
      // kebab-case pattern, and every other required property is missing.
      initialText="slug: NOT-VALID"
      schema={ENTITY}
      onChange={() => {}}
    />,
  );
  await screen.findByRole("textbox", {}, { timeout: 5000 });
  const host = screen.getByTestId("yaml-frontmatter-editor");
  const view = findView(host);

  forceLinting(view);

  await waitFor(
    () => {
      assert.ok(
        host.querySelector(".cm-lintRange-error"),
        "expected a lint-derived error decoration after forceLinting",
      );
    },
    { timeout: 3000 },
  );
});

test("mounts the completion source: a key position offers schema properties", async () => {
  render(
    <YamlFrontmatterEditor
      initialText=""
      schema={ENTITY}
      onChange={() => {}}
    />,
  );
  await screen.findByRole("textbox", {}, { timeout: 5000 });
  const host = screen.getByTestId("yaml-frontmatter-editor");
  const view = findView(host);

  // Empty doc, cursor at 0: a top-level key position, where the schema's
  // root properties (slug, label, properties, relationships, apps,
  // _schema_version) are legal completions.
  startCompletion(view);

  await waitFor(
    () => {
      const labels = Array.from(
        host.querySelectorAll(".cm-completionLabel"),
      ).map((el) => el.textContent);
      assert.ok(
        labels.includes("slug"),
        `expected a "slug" completion among: ${labels.join(", ") || "(none)"}`,
      );
    },
    { timeout: 3000 },
  );
});

test("onChange fires through the latest ref, not a frozen mount closure", () => {
  const firstCalls: string[] = [];
  const { rerender } = render(
    <YamlFrontmatterEditor
      initialText="slug: x"
      schema={ENTITY}
      onChange={(text) => firstCalls.push(text)}
    />,
  );
  const host = screen.getByTestId("yaml-frontmatter-editor");
  const view = findView(host);

  view.dispatch({ changes: { from: view.state.doc.length, insert: "\n" } });
  assert.deepEqual(firstCalls, ["slug: x\n"]);

  // Same key, so the pane does NOT remount (same mount-effect instance, same
  // view). Only the onChange prop changes.
  const secondCalls: string[] = [];
  rerender(
    <YamlFrontmatterEditor
      initialText="slug: x"
      schema={ENTITY}
      onChange={(text) => secondCalls.push(text)}
    />,
  );
  assert.equal(
    findView(host),
    view,
    "expected the pane to keep its view across rerender",
  );

  view.dispatch({ changes: { from: view.state.doc.length, insert: "!" } });
  assert.deepEqual(
    firstCalls,
    ["slug: x\n"],
    "the stale (first) onChange must not fire again",
  );
  assert.deepEqual(
    secondCalls,
    ["slug: x\n!"],
    "the latest onChange must fire",
  );
});

test("destroys the CodeMirror view on unmount", async () => {
  const { unmount } = render(
    <YamlFrontmatterEditor
      initialText="slug: x"
      schema={ENTITY}
      onChange={() => {}}
    />,
  );
  await screen.findByRole("textbox", {}, { timeout: 5000 });
  const host = screen.getByTestId("yaml-frontmatter-editor");
  const view = findView(host) as unknown as DestroyableView;

  assert.equal(view.destroyed, false, "expected a live view before unmount");
  unmount();
  assert.equal(
    view.destroyed,
    true,
    "expected the view destroyed after unmount",
  );
});
