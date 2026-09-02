import "../setup-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, waitFor, fireEvent, act } from "@testing-library/react";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { EditorView } from "@codemirror/view";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { FrontmatterBodyEditScreen } from "../../src/app/FrontmatterBodyEditScreen";
import { MarkdownEditScreen } from "../../src/app/MarkdownEditScreen";
import { matchFrontmatterForm } from "../../src/lib/frontmatterForms";
import { submissionCartSingleton, draftStoreSingleton } from "../../src/drafts/store-instance";
import { setWysiwygFlag } from "../helpers/editorSurface";
import { fakeOctokit } from "../helpers/fakeOctokit";

// Sub-task 1114, second round: the rule "stage on a real change only" must
// hold on the source editor too, must not undo the author's own choices, and
// must survive coming back to a file that is already in the batch.

const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const SCHEMA = readFileSync(resolve(REPO, "schemas/content.json"), "utf8");
const PATH = "content/src/patterns/forms.md";
const FORM = matchFrontmatterForm(PATH)!;
const formProps = {
  schemaKey: FORM.schemaKey,
  uiSchema: FORM.uiSchema,
  bodyless: FORM.bodyless,
  yamlFlowAtDepth: FORM.flowAtDepth,
  preserveComments: FORM.preserveComments,
  frontmatterOptional: FORM.frontmatterOptional,
  surface: FORM.surface,
};
const WITH_BLANK = '---\ntitle: "Forms"\nnav_order: 14\n---\n\n# Forms\n\nProse.\n';
const AFTER_DEBOUNCE = 1100;
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, AFTER_DEBOUNCE)));

function bodyView(container: HTMLElement): EditorView {
  const host = container.querySelector(".cm-editor") as HTMLElement | null;
  assert.ok(host, "a CodeMirror body editor is mounted");
  const view = EditorView.findFromDOM(host!);
  assert.ok(view, "a live EditorView");
  return view!;
}

test("deleting the blank line after the fence in the source editor is the author's change and stays", async () => {
  cleanup();
  setWysiwygFlag("source");
  submissionCartSingleton.clear();
  const { container } = render(
    <Theme>
      <FrontmatterBodyEditScreen path={PATH} {...formProps} octokit={fakeOctokit({ "schemas/content.json": SCHEMA, [PATH]: WITH_BLANK })} />
    </Theme>,
  );
  await waitFor(() => assert.ok(screen.getByText("Prose body")), { timeout: 8000 });
  const view = bodyView(container);
  assert.equal(view.state.doc.sliceString(0, 1), "\n", "the body starts with the blank line the file has");
  await act(async () => {
    view.dispatch({ changes: { from: 0, to: 1 } });
  });
  await settle();
  const staged = submissionCartSingleton.list().find((e) => e.path === PATH);
  assert.ok(staged, "a deliberate deletion is a real change");
  assert.ok(staged!.content.includes("---\n# Forms"), "and the blank line is not put back behind the author's back");
  cleanup();
});

test("an explicit Add to batch is not undone by a pending automatic flush that nets to no change", async () => {
  cleanup();
  setWysiwygFlag("source");
  submissionCartSingleton.clear();
  const { container } = render(
    <Theme>
      <FrontmatterBodyEditScreen path={PATH} {...formProps} octokit={fakeOctokit({ "schemas/content.json": SCHEMA, [PATH]: WITH_BLANK })} />
    </Theme>,
  );
  await waitFor(() => assert.ok(screen.getByText("Prose body")), { timeout: 8000 });
  const view = bodyView(container);
  await act(async () => {
    view.dispatch({ changes: { from: view.state.doc.length, insert: "x" } });
  });
  await act(async () => {
    view.dispatch({ changes: { from: view.state.doc.length - 1, to: view.state.doc.length } });
  });
  // The debounce is now armed with content equal to the file. Stage explicitly
  // before it fires.
  const form = container.querySelector("form");
  assert.ok(form, "the RJSF form is on screen");
  await act(async () => {
    fireEvent.submit(form!);
  });
  assert.ok(submissionCartSingleton.list().find((e) => e.path === PATH), "explicitly staged");
  await settle();
  assert.ok(
    submissionCartSingleton.list().find((e) => e.path === PATH),
    "the author's explicit stage survives the automatic flush that followed it",
  );
  cleanup();
});

test("a file reopened from the batch and typed back to what main has leaves the batch", async () => {
  cleanup();
  setWysiwygFlag("source");
  submissionCartSingleton.clear();
  const edited = WITH_BLANK.replace('title: "Forms"', 'title: "Forms, edited"');
  submissionCartSingleton.add({ path: PATH, content: edited, basedOnSha: `sha-${PATH}`, addedAt: Date.now() });
  render(
    <Theme>
      <FrontmatterBodyEditScreen path={PATH} {...formProps} octokit={fakeOctokit({ "schemas/content.json": SCHEMA, [PATH]: WITH_BLANK })} />
    </Theme>,
  );
  const input = (await screen.findByLabelText(/^title/i, {}, { timeout: 8000 })) as HTMLInputElement;
  assert.equal(input.value, "Forms, edited", "the screen reopened the staged edit");
  await act(async () => {
    fireEvent.change(input, { target: { value: "Forms" } });
  });
  await settle();
  assert.equal(
    submissionCartSingleton.list().find((e) => e.path === PATH),
    undefined,
    "back to main's bytes: nothing left to submit",
  );
  cleanup();
});

test("a plain markdown file typed and reverted keeps no draft", async () => {
  cleanup();
  setWysiwygFlag("source");
  const path = "content/src/global-guidelines.md";
  draftStoreSingleton.clear(path);
  const file = "## Heading {#h}\n\nProse.\n";
  const { container } = render(
    <Theme>
      <MarkdownEditScreen path={path} octokit={fakeOctokit({ [path]: file })} />
    </Theme>,
  );
  await waitFor(() => assert.ok(container.querySelector(".cm-editor")), { timeout: 8000 });
  const view = bodyView(container);
  await act(async () => {
    view.dispatch({ changes: { from: view.state.doc.length, insert: "x" } });
  });
  await settle();
  assert.ok(draftStoreSingleton.allPaths().has(path), "a typed change is a draft");
  await act(async () => {
    view.dispatch({ changes: { from: view.state.doc.length - 1, to: view.state.doc.length } });
  });
  await settle();
  assert.ok(!draftStoreSingleton.allPaths().has(path), "typed back to the file: no draft, no restore prompt next time");
  cleanup();
});
