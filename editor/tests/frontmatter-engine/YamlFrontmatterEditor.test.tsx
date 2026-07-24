// jsdom, not happy-dom: happy-dom is the ProseMirror/Milkdown bootstrap.
// CodeMirror tests in this repo use setup-dom (see
// tests/markdown-engine/CodeMirrorEditor.test.tsx:1).
import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { EditorView, activateHover } from "@codemirror/view";
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

const APP: JsonSchema = JSON.parse(
  readFileSync(
    new URL("../../../schemas/app-context-app.json", import.meta.url).pathname,
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

// The label also has to say how to leave, per WCAG 2.1.2 (no keyboard trap):
// Tab is bound to indentWithTab in this pane (see the mount effect below),
// so a bare "Frontmatter YAML" label would leave a keyboard user stuck with
// no stated way out.
test("labels the surface for assistive tech, including how to leave it", async () => {
  render(
    <YamlFrontmatterEditor
      initialText="slug: x"
      schema={ENTITY}
      onChange={() => {}}
    />,
  );
  const surface = await screen.findByRole("textbox", {}, { timeout: 5000 });
  assert.equal(
    surface.getAttribute("aria-label"),
    "Frontmatter YAML. Press Escape then Tab to leave this editor.",
  );
});

test("mounts the dark theme facet so CM6 selects its dark base styles over light", async () => {
  render(
    <YamlFrontmatterEditor
      initialText="slug: x"
      schema={ENTITY}
      onChange={() => {}}
    />,
  );
  await screen.findByRole("textbox", {}, { timeout: 5000 });
  const host = screen.getByTestId("yaml-frontmatter-editor");
  const view = findView(host);
  assert.equal(
    view.state.facet(EditorView.darkTheme),
    true,
    "expected the dark theme facet so CM6 picks its dark base theme over light",
  );
});

// The pane's own keymap binds indentWithTab (unlike the markdown body editor
// — see the inverse assertion in CodeMirrorEditor.test.tsx), so Tab must
// actually indent here, not just be a label claim.
test("binds Tab to indent the current line", async () => {
  render(
    <YamlFrontmatterEditor
      initialText="slug: x"
      schema={ENTITY}
      onChange={() => {}}
    />,
  );
  await screen.findByRole("textbox", {}, { timeout: 5000 });
  const host = screen.getByTestId("yaml-frontmatter-editor");
  const view = findView(host);

  view.dispatch({ selection: { anchor: 0 } });
  const before = view.state.doc.toString();
  view.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Tab",
      code: "Tab",
      keyCode: 9,
      bubbles: true,
      cancelable: true,
    } as KeyboardEventInit),
  );
  assert.notEqual(
    view.state.doc.toString(),
    before,
    "expected Tab to indent the current line",
  );
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

test("mounts the hover extension: hovering a top-level key shows its schema documentation", async () => {
  render(
    <YamlFrontmatterEditor
      initialText={"slug: dataset\nlabel: Dataset"}
      schema={ENTITY}
      onChange={() => {}}
    />,
  );
  await screen.findByRole("textbox", {}, { timeout: 5000 });
  const host = screen.getByTestId("yaml-frontmatter-editor");
  const view = findView(host);

  // activateHover bypasses the real mouse-hover timer/geometry (jsdom has no
  // real layout) and directly invokes the source at a position, the same way
  // forceLinting/startCompletion above bypass their own real triggers.
  const pos = view.state.doc.toString().indexOf("slug") + 1; // inside "slug"
  activateHover(view, pos, 1);

  await waitFor(
    () => {
      const card = host.querySelector(".cm-schema-hover");
      assert.ok(card, "expected a hover card in the DOM");
      const text = card!.textContent ?? "";
      // CONTENT, not just presence: a card that renders empty, or shows a
      // different key's docs, must fail this. `slug`'s required + full
      // description + an actual example value (not a placeholder) are all
      // asserted, matching the schema fixture, not a guess.
      assert.match(text, /slug/);
      assert.match(text, /required/);
      assert.match(
        text,
        /Kebab-case id; doubles as the filename \(minus \.md\) and the cross-reference target\./,
      );
      assert.match(
        text,
        /pipeline/,
        "expected an example value from the schema",
      );
    },
    { timeout: 3000 },
  );
});

// The test above only proves TOP-LEVEL resolution: a wrong implementation
// that always looked up the key at the schema ROOT (ignoring block nesting)
// would already pass it. This one hovers a key nested inside a
// `properties[]` sequence item (the shape the task brief names explicitly)
// and asserts it gets exactly THAT key's own documentation, not its
// sibling's — genuinely exercising the block-path walk, not just presence.
test("mounts the hover extension: a nested key inside a properties[] item shows its own documentation, not a sibling's", async () => {
  const text = "properties:\n  - name: status\n    type: enum";
  render(
    <YamlFrontmatterEditor
      initialText={text}
      schema={ENTITY}
      onChange={() => {}}
    />,
  );
  await screen.findByRole("textbox", {}, { timeout: 5000 });
  const host = screen.getByTestId("yaml-frontmatter-editor");
  const view = findView(host);

  const pos = text.indexOf("type: enum") + 1; // inside the nested "type"
  activateHover(view, pos, 1);

  await waitFor(
    () => {
      const card = host.querySelector(".cm-schema-hover");
      assert.ok(card, "expected a hover card for the nested `type` key");
      const cardText = card!.textContent ?? "";
      assert.match(
        cardText,
        /Logical type of the field, used to shape generated form controls and table columns\./,
      );
      assert.doesNotMatch(
        cardText,
        /Field name as shown in the UI\./,
        "must show `type`'s own docs, not its sibling `name`'s",
      );
    },
    { timeout: 3000 },
  );
});

// A different collision than the properties[] one above: the app schema
// defines "label" TWICE — once at the record root ("Human-readable display
// name of the app…") and once nested at sidebar[].label ("Display text for
// the sidebar navigation item."). A resolver bug that fell back to a
// root/global lookup by key NAME (ignoring the block path) would still pass
// every ENTITY-schema hover test above, since none of those fixtures reuse a
// key name across nesting levels — this is the one fixture in this suite
// that would actually catch it.
test("mounts the hover extension: sidebar[].label shows the sidebar item's own documentation, not the root label's", async () => {
  const text =
    "label: Studio\nsidebar:\n  - label: Pipelines\n    id: pipelines";
  render(
    <YamlFrontmatterEditor
      initialText={text}
      schema={APP}
      onChange={() => {}}
    />,
  );
  await screen.findByRole("textbox", {}, { timeout: 5000 });
  const host = screen.getByTestId("yaml-frontmatter-editor");
  const view = findView(host);

  // The SECOND "label" in the text — the nested sidebar item's, not the
  // root record's own label on line 1.
  const pos = text.indexOf("label: Pipelines") + 1;
  activateHover(view, pos, 1);

  await waitFor(
    () => {
      const card = host.querySelector(".cm-schema-hover");
      assert.ok(card, "expected a hover card for sidebar[].label");
      const cardText = card!.textContent ?? "";
      assert.match(cardText, /Display text for the sidebar navigation item\./);
      assert.doesNotMatch(
        cardText,
        /Human-readable display name of the app shown in navigation and documentation\./,
        "must show sidebar[].label's own docs, not the root label's",
      );
    },
    { timeout: 3000 },
  );
});

test("the hover extension shows no card when hovering a value, not a key", async () => {
  render(
    <YamlFrontmatterEditor
      initialText="slug: dataset"
      schema={ENTITY}
      onChange={() => {}}
    />,
  );
  await screen.findByRole("textbox", {}, { timeout: 5000 });
  const host = screen.getByTestId("yaml-frontmatter-editor");
  const view = findView(host);

  const pos = view.state.doc.toString().indexOf("dataset") + 2;
  activateHover(view, pos, 1);

  // The source is synchronous (no promise), so a dispatch either happened
  // during activateHover's own call or never happens at all — no card is
  // the immediately-observable, stable result here.
  assert.equal(host.querySelector(".cm-schema-hover"), null);
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
