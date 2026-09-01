// jsdom, not happy-dom (this screen mounts CodeMirror).
import "../setup-dom";
import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
// The form surface uses Radix Tooltip, which needs the provider a <Theme>
// supplies. Production always renders inside one (App wraps the whole editor);
// only the raw YAML pane happened not to need it.
import { Theme } from "@radix-ui/themes";
import { EditorView } from "@codemirror/view";
import { FrontmatterBodyEditScreen } from "../../src/app/FrontmatterBodyEditScreen";
import { submissionCartSingleton } from "../../src/drafts/store-instance";
import { setWysiwygFlag } from "../helpers/editorSurface";

// These suites exercise the YAML FRONTMATTER pane; the body surface below it is
// incidental. Pin it to the source pane: the rich surface cannot mount under
// jsdom at all (only tests/setup-happy-dom.ts installs what ProseMirror needs),
// and app-context rich-body coverage lives in appContextWysiwyg.test.tsx.
beforeEach(() => setWysiwygFlag("source"));

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
  "  contains:",
  "    - field",
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
  "  contains:",
  "    - field",
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

/** The raw YAML is a SOURCE VIEW now, not what a record opens with (F9): every
 *  app-context record used to lead with `# yaml-language-server` and
 *  `_schema_version`. Every test below that exercises the pane opens it first. */
async function openSource() {
  const btn = await screen.findByRole(
    "button",
    { name: /view source/i },
    { timeout: 5000 },
  );
  await act(async () => {
    fireEvent.click(btn);
  });
  return screen.findByTestId("yaml-frontmatter-editor", {}, { timeout: 5000 });
}

test("an app-context record opens as a form, with the raw file one click away", async () => {
  // F9: line one of every entity was `# yaml-language-server: $schema=…` and
  // line two was `_schema_version: 1`, so the first two things an author read
  // were addressed to a machine. The form opens; the file is still reachable.
  const { container } = render(
    <Theme><FrontmatterBodyEditScreen
      path="app-context/src/entities/dataset.md"
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={fakeOctokit()}
    /></Theme>,
  );
  await screen.findByRole("button", { name: /view source/i }, { timeout: 5000 });
  const form = container.querySelector("form");
  assert.ok(form, "the RJSF form should be what a record opens with");
  // VISIBLE, not merely mounted. `form.fm-form.fm-collapsed` hides every field
  // in base.css, so a collapsed form is a record that still opens showing the
  // author nothing — which is what the first version of this change shipped.
  // The rule is `form.fm-form.fm-collapsed > *:not(.fm-form-children)`, so the
  // element to measure is a DIRECT child: jsdom computes an element's own
  // style and does not inherit a hidden ancestor, which is why asserting on a
  // nested control passes whether the form is collapsed or not.
  const hidden = Array.from(form!.children).filter(
    (el) => !el.classList.contains("fm-form-children"),
  );
  assert.ok(hidden.length > 0, "expected the form to render its own children");
  assert.ok(
    hidden.every((el) => getComputedStyle(el).display !== "none"),
    "the form must open expanded, not collapsed with its fields hidden",
  );
  assert.equal(
    screen.queryByTestId("yaml-frontmatter-editor"),
    null,
    "the raw YAML must not be the first thing on screen",
  );

  const pane = await openSource();
  assert.match(pane.textContent ?? "", /slug: dataset/);
});

test("staging an untouched record produces byte-identical content", async () => {
  render(
    <Theme><FrontmatterBodyEditScreen
      path="app-context/src/entities/dataset.md"
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={fakeOctokit()}
    /></Theme>,
  );
  await openSource();
  const button = await screen.findByRole(
    "button",
    { name: "Add to batch" },
    { timeout: 5000 },
  );
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
    <Theme><FrontmatterBodyEditScreen
      path="app-context/src/entities/dataset.md"
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={fakeOctokit()}
    /></Theme>,
  );
  const host = await openSource();
  const view = EditorView.findFromDOM(host);
  assert.ok(view, "expected a live EditorView attached to the pane");
  view!.dispatch({
    changes: { from: view!.state.doc.length, insert: "\nnote: edited" },
  });
  const button = await screen.findByRole(
    "button",
    { name: "Add to batch" },
    { timeout: 5000 },
  );
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
    <Theme><FrontmatterBodyEditScreen
      path="app-context/src/entities/dataset.md"
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={fakeOctokit()}
    /></Theme>,
  );
  await openSource();
  const pane = container.querySelector(".fm-yaml-pane");
  assert.ok(pane, "expected the pane wrapper to carry .fm-yaml-pane");

  // The record opens expanded now, and opening the source view expands too, so
  // the pane starts VISIBLE and the toggle's job is to hide it.
  const toggle = screen.getByRole("button", {
    name: "Toggle frontmatter",
  });
  assert.equal(toggle.textContent, "Hide", "label reads Hide while visible");
  assert.notEqual(
    getComputedStyle(pane as Element).display,
    "none",
    "opening the source view must actually show it, not just relabel a button",
  );

  fireEvent.click(toggle);
  assert.equal(toggle.textContent, "Show", "label reads Show once hidden");
  assert.equal(
    getComputedStyle(pane as Element).display,
    "none",
    "pane must actually be hidden while collapsed, not just labeled as such",
  );

  fireEvent.click(toggle);
  assert.equal(toggle.textContent, "Hide", "label reads Hide once visible again");
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
    <Theme><FrontmatterBodyEditScreen
      path={PATH_A}
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={fakeOctokit()}
    /></Theme>,
  );
  const host = await openSource();
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
    <Theme><FrontmatterBodyEditScreen
      path={PATH_A}
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={octokit}
    /></Theme>,
  );
  const hostA = await openSource();
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
    <Theme><FrontmatterBodyEditScreen
      path={PATH_B}
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={octokit}
    /></Theme>,
  );
  const hostB = await openSource();
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
    <Theme><FrontmatterBodyEditScreen
      path={PATH_A}
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={octokit}
    /></Theme>,
  );
  const hostA = await openSource();
  const viewA = EditorView.findFromDOM(hostA);
  assert.ok(viewA, "expected a live EditorView attached to file A's pane");

  // Edit file A — arms A's debounce.
  viewA!.dispatch({
    changes: { from: viewA!.state.doc.length, insert: "\nnote: edited-a" },
  });

  // Navigate to file B within the debounce window (same component instance,
  // no `key` on FrontmatterBodyEditScreen — matches EditorShell's real use).
  rerender(
    <Theme><FrontmatterBodyEditScreen
      path={PATH_B}
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={octokit}
    /></Theme>,
  );
  const hostB = await openSource();
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

// The unmount cleanup used to CLEAR pending debounce timers (justified by a
// comment claiming a late flush "would write to a cart nothing is left to
// read from" — wrong, since submissionCartSingleton is a module-level,
// localStorage-backed singleton that outlives this screen, and flushToCart
// performs no React state write). That silently dropped up to a second of
// typing every time the user navigated away before the debounce elapsed.
// The fix FIRES the pending timer's flush on unmount instead of discarding
// it, so this asserts the edit reaches the cart even though unmount() fires
// well before the 1000ms debounce would have elapsed on its own.
test("an edit still reaches the cart when the screen unmounts before the debounce elapses", async () => {
  const { unmount } = render(
    <Theme><FrontmatterBodyEditScreen
      path={PATH_A}
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      octokit={fakeOctokit()}
    /></Theme>,
  );
  const host = await openSource();
  const view = EditorView.findFromDOM(host);
  assert.ok(view, "expected a live EditorView attached to the pane");

  // Arms the 1000ms debounce; nowhere near elapsed by the time unmount()
  // runs a few lines down.
  view!.dispatch({
    changes: {
      from: view!.state.doc.length,
      insert: "\nnote: unmounted-mid-debounce",
    },
  });
  assert.equal(
    submissionCartSingleton.list().find((e) => e.path === PATH_A),
    undefined,
    "sanity: the debounce must not have fired yet",
  );

  unmount();

  const staged = submissionCartSingleton.list().find((e) => e.path === PATH_A);
  assert.ok(
    staged,
    "expected the pending debounce to flush to the cart on unmount, not be silently dropped",
  );
  assert.match(
    staged!.content,
    /note: unmounted-mid-debounce/,
    "the flushed content must carry the edit that was still pending at unmount",
  );
});

// ── The form path must not eat the file's machinery ─────────────────────────

const RECORD_WITH_DIRECTIVE = [
  "---",
  "# yaml-language-server: $schema=../../../schemas/app-context-entity.json",
  "_schema_version: 1",
  "slug: dataset",
  "label: Dataset",
  "properties:",
  "  - name",
  "relationships:",
  "  contains:",
  "    - field",
  "apps:",
  "  - studio",
  "---",
  "A dataset asset.",
  "",
].join("\n");

function fakeOctokitWithDirective() {
  return {
    repos: {
      getContent: async ({ path }: { path: string }) => {
        const text =
          path === "app-context/src/entities/dataset.md"
            ? RECORD_WITH_DIRECTIVE
            : readFileSync(ENTITY_SCHEMA, "utf8");
        return {
          data: {
            content: Buffer.from(text, "utf8").toString("base64"),
            encoding: "base64",
            sha: "deadbeef",
            type: "file",
          },
        };
      },
    },
  } as never;
}

test("staging through the FORM keeps the schema directive the author never sees", async () => {
  // The directive is a YAML comment, and a form save serialises from parsed
  // data. Without `preserveComments` on these registry entries, making the form
  // the default surface would silently strip line one of all 64 records and
  // unhook every one of them from its schema.
  render(
    <Theme><FrontmatterBodyEditScreen
      path="app-context/src/entities/dataset.md"
      schemaKey="app-context-entity"
      uiSchema={{}}
      surface="yaml"
      preserveComments
      octokit={fakeOctokitWithDirective()}
    /></Theme>,
  );
  const button = await screen.findByRole(
    "button",
    { name: "Add to batch" },
    { timeout: 5000 },
  );
  fireEvent.click(button);
  const staged = submissionCartSingleton
    .list()
    .find((e) => e.path === "app-context/src/entities/dataset.md");
  assert.ok(staged, "expected a cart entry");
  assert.match(
    staged!.content,
    /# yaml-language-server: \$schema=/,
    "the schema directive must survive a save made through the form",
  );
  // Identical apart from blank lines. The form path re-serialises where the
  // YAML path concatenated raw text, so it emits one blank line after the
  // closing `---` that the source view does not. Recorded rather than hidden:
  // the first form save of each record will show that one-line diff, and no
  // other change.
  const ignoringBlankLines = (t: string) => t.replace(/\n{2,}/g, "\n");
  assert.equal(
    ignoringBlankLines(staged!.content),
    ignoringBlankLines(RECORD_WITH_DIRECTIVE),
  );
});
