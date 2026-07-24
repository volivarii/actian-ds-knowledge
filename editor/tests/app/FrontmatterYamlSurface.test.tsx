// jsdom, not happy-dom (this screen mounts CodeMirror).
import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { EditorView } from "@codemirror/view";
import { FrontmatterBodyEditScreen } from "../../src/app/FrontmatterBodyEditScreen";
import { submissionCartSingleton } from "../../src/drafts/store-instance";

afterEach(() => {
  cleanup();
  submissionCartSingleton.clear();
});

const RECORD = [
  "---",
  "_schema_version: 1",
  "slug: dataset",
  "label: Dataset",
  "properties:",
  "  - name",
  "relationships:",
  "  hasFields: field",
  "apps:",
  "  - studio",
  "---",
  "A dataset asset.",
  "",
].join("\n");

const ENTITY_SCHEMA = new URL(
  "../../../schemas/app-context-entity.json",
  import.meta.url,
).pathname;

/** Minimal Octokit stand-in: serves the record and its schema.
 *  githubApi.ts's getTextFile/getTextFileWithSha call `gh.repos.getContent`
 *  (top-level), not `gh.rest.repos.getContent` — shaped to match that, per
 *  the brief's own instruction to read the production call site rather than
 *  bend it to a guessed fixture shape. */
function fakeOctokit() {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        const text =
          path === "app-context/src/entities/dataset.md"
            ? RECORD
            : readFileSync(ENTITY_SCHEMA, "utf8");
        return {
          data: {
            content: Buffer.from(text, "utf8").toString("base64"),
            encoding: "base64",
            sha: "deadbeef",
          },
        };
      },
    },
  } as never;
}

test("an app-context record opens as YAML, not as a form", async () => {
  const { container } = render(
    <FrontmatterBodyEditScreen
      path="app-context/src/entities/dataset.md"
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={fakeOctokit()}
    />,
  );
  const yamlPane = await screen.findByTestId(
    "yaml-frontmatter-editor",
    {},
    { timeout: 5000 },
  );
  assert.match(yamlPane.textContent ?? "", /slug: dataset/);
  // The record's fields must NOT appear as form controls.
  assert.equal(screen.queryByLabelText("Entity label"), null);
  // Stronger than the label check above (which the test's empty uiSchema={{}}
  // would pass trivially even if RJSF rendered, since only the production
  // uiSchema sets that title): RJSF's <Form> always renders a <form> element,
  // so its absence proves the RJSF branch never mounted alongside the pane.
  assert.equal(
    container.querySelector("form"),
    null,
    "no RJSF <form> should render when surface is yaml",
  );
});

test("staging an untouched record produces byte-identical content", async () => {
  render(
    <FrontmatterBodyEditScreen
      path="app-context/src/entities/dataset.md"
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={fakeOctokit()}
    />,
  );
  await screen.findByTestId("yaml-frontmatter-editor", {}, { timeout: 5000 });
  const button = await screen.findByRole("button", { name: "Add to batch" });
  fireEvent.click(button);
  const staged = submissionCartSingleton
    .list()
    .find((e) => e.path === "app-context/src/entities/dataset.md");
  assert.ok(staged, "expected a cart entry");
  assert.equal(staged!.content, RECORD);
});

// flushToCart is a useCallback whose deps are [state, path, yamlFlowAtDepth,
// preserveComments, surface] — fmText is NOT one of them. An edit alone (no
// `state` transition) does not recreate flushToCart, so if it read the plain
// `fmText` closure instead of `fmTextRef.current`, a post-edit stage would
// silently write the pre-edit text. This test types after the pane is ready
// and never touches `state` again, so it only passes if the ref is read live.
test("staging an EDITED record reflects the edit, not a stale fmText closure", async () => {
  render(
    <FrontmatterBodyEditScreen
      path="app-context/src/entities/dataset.md"
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={fakeOctokit()}
    />,
  );
  const host = await screen.findByTestId(
    "yaml-frontmatter-editor",
    {},
    { timeout: 5000 },
  );
  const view = EditorView.findFromDOM(host);
  assert.ok(view, "expected a live EditorView attached to the pane");
  view!.dispatch({
    changes: { from: view!.state.doc.length, insert: "\nnote: edited" },
  });
  const button = await screen.findByRole("button", { name: "Add to batch" });
  fireEvent.click(button);
  const staged = submissionCartSingleton
    .list()
    .find((e) => e.path === "app-context/src/entities/dataset.md");
  assert.ok(staged, "expected a cart entry");
  assert.match(
    staged!.content,
    /note: edited/,
    "staged content must reflect the edit, not the stale pre-edit text",
  );
});
