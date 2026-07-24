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

// The collapse-toggle test asserts the ACTUAL visual effect, not just the
// class name, so the real stylesheet has to be loaded into jsdom (it is
// normally only pulled in transitively via App.tsx, which this screen is
// rendered without). jsdom's CSSOM applies class-selector rules from an
// injected <style> tag, verified against this exact file in isolation
// before relying on it here.
const baseCss = readFileSync(
  new URL("../../src/styles/base.css", import.meta.url).pathname,
  "utf8",
);
const styleTag = document.createElement("style");
styleTag.textContent = baseCss;
document.head.appendChild(styleTag);

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

const RECORD_B = [
  "---",
  "_schema_version: 1",
  "slug: pipeline",
  "label: Pipeline",
  "properties:",
  "  - name",
  "relationships:",
  "  hasFields: field",
  "apps:",
  "  - studio",
  "---",
  "A pipeline asset.",
  "",
].join("\n");

const PATH_A = "app-context/src/entities/dataset.md";
const PATH_B = "app-context/src/entities/pipeline.md";

/** Serves two distinct entity records (PATH_A/PATH_B) plus their shared
 *  schema — used by the cross-file debounce-flush test, which needs a
 *  SECOND file to navigate to while the first file's debounce is pending. */
function fakeOctokitTwoFiles() {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        const text =
          path === PATH_A
            ? RECORD
            : path === PATH_B
              ? RECORD_B
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
  // The record's fields must NOT appear as form controls. RJSF's <Form>
  // always renders a <form> element, so its absence proves the RJSF branch
  // never mounted alongside the pane. (A queryByLabelText("Entity label")
  // check would be vacuous here: this test's uiSchema={{}} never sets that
  // title, so the label can't appear regardless of which branch rendered.)
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
  // The #280 no-silent-overwrite guarantee (detectStaleBase) depends on a
  // real remote blob sha reaching the cart entry. This is the routed
  // production path (surface="yaml"), unlike frontmatterStaleBase.test.tsx
  // and appContextAppHybrid.test.tsx, which render the RJSF branch directly.
  assert.equal(
    staged!.basedOnSha,
    "deadbeef",
    "staged edit must carry the remote blob sha, not an empty base",
  );
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

// The only .fm-collapsed rule in base.css targets `form.fm-form.fm-collapsed`
// (the RJSF branch). The YAML pane wrapper is a plain Box, so it needs (and
// now has) its own `.fm-yaml-pane.fm-collapsed` rule — this asserts the
// class actually hides the pane, not just that the class name is present.
test("the collapse toggle actually hides and shows the YAML pane", async () => {
  const { container } = render(
    <FrontmatterBodyEditScreen
      path="app-context/src/entities/dataset.md"
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={fakeOctokit()}
    />,
  );
  await screen.findByTestId("yaml-frontmatter-editor", {}, { timeout: 5000 });
  const pane = container.querySelector(".fm-yaml-pane");
  assert.ok(pane, "expected the pane wrapper to carry .fm-yaml-pane");

  // bodyless=false (the config for all three app-context entries) seeds
  // fmCollapsed to `!bodyless` = true, so the record opens collapsed.
  const toggle = screen.getByRole("button", {
    name: "Toggle frontmatter",
  });
  assert.equal(toggle.textContent, "Show", "label reads Show while hidden");
  assert.equal(
    getComputedStyle(pane as Element).display,
    "none",
    "pane must actually be hidden while collapsed, not just labeled as such",
  );

  fireEvent.click(toggle);
  assert.equal(toggle.textContent, "Hide", "label reads Hide once visible");
  assert.notEqual(
    getComputedStyle(pane as Element).display,
    "none",
    "pane must become visible after expanding",
  );

  fireEvent.click(toggle);
  assert.equal(toggle.textContent, "Show");
  assert.equal(
    getComputedStyle(pane as Element).display,
    "none",
    "pane must hide again after re-collapsing",
  );
});

// Every other test in this file reaches the cart through the explicit "Add
// to batch" button, which calls flushToCart directly — none of them exercise
// scheduleFlush (the debounce armed by the pane's own onChange). Deleting
// the scheduleFlush(...) call from the pane's onChange would fail nothing
// above. This test waits out the real 1000ms debounce rather than using
// node:test's mock timers: `mock.timers.enable` emits Node's
// ExperimentalWarning as two comment lines into the TAP stream on stdout
// (not stderr), which is noise in the machine-readable test output. A real
// ~1.1s wait is cheap and keeps this file to one consistent timing strategy,
// matching the cross-file test below.
test("editing the YAML pane debounces the flush via scheduleFlush, not just the button", async () => {
  render(
    <FrontmatterBodyEditScreen
      path={PATH_A}
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
    changes: { from: view!.state.doc.length, insert: "\nnote: debounced" },
  });
  assert.equal(
    submissionCartSingleton.list().find((e) => e.path === PATH_A),
    undefined,
    "an edit must not stage immediately — only once the debounce fires",
  );

  await new Promise((resolve) => setTimeout(resolve, 1100));

  const staged = submissionCartSingleton.list().find((e) => e.path === PATH_A);
  assert.ok(staged, "expected the debounced flush to reach the cart");
  assert.match(
    staged!.content,
    /note: debounced/,
    "the debounced flush must carry the edit",
  );
});

// Reproduces finding 1's cross-file sequence directly: arm the debounce on
// file A, then re-render the SAME screen instance with file B's path (no
// `key` — EditorShell renders FrontmatterBodyEditScreen without one, so a
// path change updates props in place exactly like this), and let A's timer
// fire while B is on screen. Before the fix, flushToCart's assembly read
// fmTextRef.current at flush time — a live ref that by then held B's text —
// so A's cart entry silently ended up with B's frontmatter. The fix threads
// the YAML text through as a snapshot argument taken when the debounce was
// scheduled, so A's own text is what lands regardless of what's on screen
// when the timer fires.
//
// This test uses REAL timers (not node:test's mock timers): it needs a
// state-driven re-render + async file load (B's own getContent call, then
// splitFrontmatter + schema fetch) to complete BETWEEN arming the timer and
// firing it, and doing that under a globally-faked setTimeout risked
// entangling React's own scheduling with the fake clock. A real ~1.1s wait
// is cheap and unambiguous here.
test("a debounced flush armed on file A survives a switch to file B and stages under A with A's own frontmatter", async () => {
  const octokit = fakeOctokitTwoFiles();
  const { rerender } = render(
    <FrontmatterBodyEditScreen
      path={PATH_A}
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={octokit}
    />,
  );
  const hostA = await screen.findByTestId(
    "yaml-frontmatter-editor",
    {},
    { timeout: 5000 },
  );
  const viewA = EditorView.findFromDOM(hostA);
  assert.ok(viewA, "expected a live EditorView attached to file A's pane");

  // Edit file A's YAML — arms the 1000ms debounce with A's own text.
  viewA!.dispatch({
    changes: { from: viewA!.state.doc.length, insert: "\nnote: edited-a" },
  });

  // Navigate to file B within the debounce window. EditorShell renders this
  // screen without a `key`, so this rerender updates props on the SAME
  // component instance — the pending timer from A's edit is not cancelled.
  rerender(
    <FrontmatterBodyEditScreen
      path={PATH_B}
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={octokit}
    />,
  );
  const hostB = await screen.findByTestId(
    "yaml-frontmatter-editor",
    {},
    { timeout: 5000 },
  );
  // Sanity: B actually loaded (its own content, not A's).
  assert.match(
    hostB.textContent ?? "",
    /slug: pipeline/,
    "expected file B's pane to show B's own content",
  );

  // Pin the ordering this test depends on: A's timer must still be pending
  // at this crossing point. Without this, the test would silently stop
  // testing the cross-file case if B's load ever outran the 1000ms debounce
  // (CI under load, an extra fetch added later) — A's flush would have
  // already fired while A was still current, and every assertion below
  // would still pass for the wrong reason.
  assert.equal(
    submissionCartSingleton.list().find((e) => e.path === PATH_A),
    undefined,
    "A's timer must still be pending at the crossing point",
  );

  // Let A's still-pending 1000ms timer fire while B is on screen.
  await new Promise((resolve) => setTimeout(resolve, 1100));

  const stagedA = submissionCartSingleton.list().find((e) => e.path === PATH_A);
  assert.ok(stagedA, "file A should have a cart entry from its own timer");
  assert.match(
    stagedA!.content,
    /note: edited-a/,
    "A's cart entry must contain A's own edit",
  );
  assert.match(
    stagedA!.content,
    /slug: dataset/,
    "A's cart entry must contain A's own frontmatter",
  );
  assert.doesNotMatch(
    stagedA!.content,
    /slug: pipeline/,
    "A's cart entry must NOT contain B's frontmatter",
  );

  const stagedB = submissionCartSingleton.list().find((e) => e.path === PATH_B);
  assert.equal(
    stagedB,
    undefined,
    "B was never edited and has no armed timer, so it must not be staged",
  );
});

// The test above proves A's ARMED-BUT-UNTOUCHED timer survives a switch to
// B. It does not prove A's timer survives B *also* being edited. Before the
// fix, debounceRef was a single shared slot: B's own onChange called
// scheduleFlush, which unconditionally cleared "the" pending timer — A's,
// since it was the only one — before arming B's. One keystroke in B silently
// dropped A's armed edit. The fix keys debounceRef by path (a Map), so
// scheduling B's flush clears only B's own prior entry and leaves A's alone.
test("typing in file B while A's debounce is pending does not cancel A's timer", async () => {
  const octokit = fakeOctokitTwoFiles();
  const { rerender } = render(
    <FrontmatterBodyEditScreen
      path={PATH_A}
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={octokit}
    />,
  );
  const hostA = await screen.findByTestId(
    "yaml-frontmatter-editor",
    {},
    { timeout: 5000 },
  );
  const viewA = EditorView.findFromDOM(hostA);
  assert.ok(viewA, "expected a live EditorView attached to file A's pane");

  // Edit file A — arms A's debounce.
  viewA!.dispatch({
    changes: { from: viewA!.state.doc.length, insert: "\nnote: edited-a" },
  });

  // Navigate to file B within the debounce window (same component instance,
  // no `key` on FrontmatterBodyEditScreen — matches EditorShell's real use).
  rerender(
    <FrontmatterBodyEditScreen
      path={PATH_B}
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={octokit}
    />,
  );
  const hostB = await screen.findByTestId(
    "yaml-frontmatter-editor",
    {},
    { timeout: 5000 },
  );
  const viewB = EditorView.findFromDOM(hostB);
  assert.ok(viewB, "expected a live EditorView attached to file B's pane");

  // Edit file B too — this must NOT cancel A's still-pending timer.
  viewB!.dispatch({
    changes: { from: viewB!.state.doc.length, insert: "\nnote: edited-b" },
  });

  // Let both timers fire.
  await new Promise((resolve) => setTimeout(resolve, 1100));

  const stagedA = submissionCartSingleton.list().find((e) => e.path === PATH_A);
  assert.ok(
    stagedA,
    "A's timer must have survived B's edit and staged on its own schedule",
  );
  assert.match(
    stagedA!.content,
    /note: edited-a/,
    "A's cart entry must contain A's own edit",
  );

  const stagedB = submissionCartSingleton.list().find((e) => e.path === PATH_B);
  assert.ok(stagedB, "B's own edit must also stage on its own timer");
  assert.match(
    stagedB!.content,
    /note: edited-b/,
    "B's cart entry must contain B's own edit",
  );
});
