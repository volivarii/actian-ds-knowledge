import "../setup-happy-dom";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
} from "@milkdown/core";
import { getMarkdown } from "@milkdown/utils";
import { TextSelection, Selection } from "@milkdown/prose/state";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  useMilkdownPresets,
  assertGuardSafe,
} from "../../src/markdown-engine/milkdownPreset";
import {
  insertReferenceLink,
  matchTrigger,
  getReferenceTriggerStateForTest,
  referenceAutocompletePlugin,
  setReferencePickerHandler,
  type ReferencePickerState,
} from "../../src/markdown-engine/referenceAutocomplete";
import {
  searchReferenceTargets,
  type ReferenceTarget,
} from "../../src/lib/referenceIndex";
import { ReferencePicker } from "../../src/markdown-engine/ReferencePicker";
import { scanFileForAnchors } from "../../src/lib/anchorIndex";
import { snippetsForSlug } from "../../src/lib/snippetExtract";

// CONTROLLER FINDING (reviewed High, empirically reproduced): insertReferenceLink
// leaves the caret at the link's right edge with storedMarks === null. The
// commonmark link mark is inclusive by default, so ProseMirror falls back to
// computing marks from the surrounding document (resolve(pos).marks()) for the
// NEXT typed character, and that computation absorbs the still-open link mark:
// typing "x" right after a freshly inserted "[Button](button)" produces
// "[Buttonx](button)" instead of "[Button](button)x". This test drives a REAL
// editor built from the shared preset (same as rich-toolbar-commands.test.ts)
// through insertReferenceLink and then simulates the next keystroke the same
// way ProseMirror resolves it when no explicit stored marks are set: via
// `tr.insertText(text, pos)` with an explicit position, which uses
// `state.storedMarks` when present and otherwise falls back to marks resolved
// at that position (see prosemirror-state Transaction.insertText).

/** Build a real editor with the SHARED preset (identical to the live editor),
 *  seed it, run insertReferenceLink against a fake trigger range, then
 *  simulate the very next keystroke landing at the resulting caret. Returns
 *  the serialized markdown after both steps. */
async function insertLinkThenType(): Promise<string> {
  const root = globalThis.document.createElement("div");
  const editor = await useMilkdownPresets(
    Editor.make().config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, "before \n");
    }),
  ).create();

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    // Paragraph text is "before" (the trailing space/newline is not enough to
    // survive commonmark parsing as a hard break). Positions 1-7 are the text
    // "before"; treat the last two characters ("re", positions 5-7) as a
    // stand-in for a real "[[query" trigger range: insertReferenceLink only
    // cares about the range bounds, not what currently occupies them.
    const range = { from: 5, to: 7 };
    // Real trigger detection (matchTrigger) only ever fires with the caret
    // sitting exactly at range.to (the match is anchored at the selection),
    // so put the caret there before calling insertReferenceLink: that is
    // what makes the post-replaceWith selection land at the link's right
    // edge instead of wherever the doc's default cursor happened to be.
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, range.to),
      ),
    );
    insertReferenceLink(view, range, {
      label: "Button",
      kind: "component",
      href: "button",
      detail: "button",
    });

    // Simulate the next keystroke exactly as ProseMirror would resolve it:
    // an explicit-position insertText, which uses state.storedMarks when set
    // and otherwise falls back to marks resolved AT that position (the path
    // that, pre-fix, absorbs the still-open inclusive link mark).
    const caret = view.state.selection.from;
    view.dispatch(view.state.tr.insertText("x", caret));
  });

  const out = editor.action(getMarkdown());
  await editor.destroy();
  return out;
}

test("typed character after an inserted reference link stays outside the link", async () => {
  const md = await insertLinkThenType();
  assert.match(
    md,
    /\[Button\]\(button\)x/,
    `expected the "x" typed right after the link to land OUTSIDE it, got: ${md}`,
  );
  assert.doesNotMatch(
    md,
    /\[Buttonx\]/,
    `the typed "x" was absorbed INTO the link label, got: ${md}`,
  );
});

/** Same construction as insertLinkThenType above, but stops right after the
 *  insert (no follow-up keystroke) and returns the serialized markdown: the
 *  shape every CASES entry below checks against the corpus's link grammar. */
async function insertAndSerialize(target: ReferenceTarget): Promise<string> {
  const root = globalThis.document.createElement("div");
  const editor = await useMilkdownPresets(
    Editor.make().config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, "before \n");
    }),
  ).create();

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    // Same stand-in trigger range as insertLinkThenType above ("re", the
    // last two characters of "before"): insertReferenceLink only cares
    // about the range bounds, not what currently occupies them.
    const range = { from: 5, to: 7 };
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.create(view.state.doc, range.to),
      ),
    );
    insertReferenceLink(view, range, target);
  });

  const out = editor.action(getMarkdown());
  await editor.destroy();
  return out;
}

// PR-B grammar law (searchReferenceTargets' own comment in referenceIndex.ts):
// only component nodes (bare-slug links) and the current file's section
// anchors (#slug links) have an established body-link grammar. One case per
// shape.
const CASES = [
  {
    target: {
      label: "Dropdown select",
      kind: "component",
      href: "dropdown-select",
      detail: "dropdown-select",
    },
    expect: "[Dropdown select](dropdown-select)",
  },
  {
    target: {
      label: "Usage rules",
      kind: "section",
      href: "#usage-rules",
      detail: "usage-rules",
    },
    expect: "[Usage rules](#usage-rules)",
  },
] as const;

for (const { target, expect: expected } of CASES) {
  test(`insertReferenceLink: a ${target.kind} target inserts "${expected}", round-trips guard-safe, and matches the grammar its own index scans for`, async () => {
    const md = await insertAndSerialize(target);

    assert.ok(
      md.includes(expected),
      `expected the serialized markdown to contain ${expected}, got: ${md}`,
    );

    // Guard-safety: the exact contract wysiwyg-safe-paths.test.ts enforces
    // on every rich-safe file. Throws a GuardViolationError on failure,
    // which fails this test.
    await assertGuardSafe(md);

    if (target.kind === "section") {
      // Grammar invariant: a "#slug" link is exactly what anchorIndex's
      // LINK_ANCHOR_RE scans for, so the inserted link is discoverable as a
      // real reference the next time the index is built.
      const { references } = scanFileForAnchors(md);
      assert.ok(
        references.includes(target.detail),
        `expected scanFileForAnchors to capture "${target.detail}" as a reference, got: ${references.join(", ")}`,
      );
    } else {
      // Grammar invariant: a bare-slug link is exactly what snippetExtract's
      // occurrence regex looks for, so the relations panel can surface this
      // paragraph as a contextual snippet.
      const snippets = snippetsForSlug(md, target.href);
      assert.equal(
        snippets.length,
        1,
        `expected exactly one bare-slug snippet occurrence for "${target.href}", got ${snippets.length}`,
      );
    }
  });
}

// FINDING 1 regression (Important, data loss): TRIGGER_RE's negated char
// class must reject `\0`, the sentinel textBetween substitutes for an inline
// leaf atom (e.g. a <Media> chip). Without it, a trigger run can span the
// atom and apply()'s replaceWith deletes it. Drives a REAL editor (same
// shared preset as the tests above, which registers mediaNodeView) through a
// doc where a <Media> atom sits between the `[[` and the trailing query text.
test("matchTrigger: a trigger run does not span an inline atom (e.g. a <Media> chip)", async () => {
  const root = globalThis.document.createElement("div");
  const editor = await useMilkdownPresets(
    Editor.make().config((ctx) => {
      ctx.set(rootCtx, root);
      // Inline (not block) HTML: no blank line around the tag, so it parses
      // as the same "html" inline-atom node media-roundtrip.test.ts exercises,
      // sitting inside the SAME paragraph as the "[[" prefix and "bar" suffix.
      ctx.set(defaultValueCtx, '[[foo<Media role="x" />bar\n');
    }),
  ).create();

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    // Caret at the very end of the doc's only textblock, right after "bar".
    const end = Selection.atEnd(view.state.doc);
    view.dispatch(view.state.tr.setSelection(end));

    const match = matchTrigger(view.state);
    assert.equal(
      match,
      null,
      `expected no trigger match spanning the inline atom, got: ${JSON.stringify(match)}`,
    );
  });

  await editor.destroy();
});

// FINDING 2 regression (Important): a trigger dismissed via Escape stores
// `dismissedAt` as an absolute position from the doc at dismiss time. A later
// transaction that edits EARLIER in the doc shifts everything after it, so
// the plugin must map `dismissedAt` through `tr.mapping` before comparing it
// against the freshly-derived match. Uses the real close() path (the same one
// Escape drives via ReferencePickerState), not the plugin's private `dismiss`
// helper, to stay on the module's public surface.
test("triggerPlugin: a dismissed trigger stays suppressed after an earlier edit shifts its position", async () => {
  const root = globalThis.document.createElement("div");
  const editor = await useMilkdownPresets(
    Editor.make().config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, "before\n\n[[bar\n");
    }),
  )
    .use(referenceAutocompletePlugin)
    .create();

  let latestState: ReferencePickerState | null = null;
  setReferencePickerHandler((s) => {
    latestState = s;
  });

  let originalFrom = -1;
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const end = Selection.atEnd(view.state.doc);
    view.dispatch(view.state.tr.setSelection(end));

    const live = matchTrigger(view.state);
    assert.ok(live, "expected the [[bar run to open the picker");
    originalFrom = live!.from;

    assert.ok(latestState, "expected the handler to have been emitted to");
    latestState!.close(); // Escape path: dismiss via the real public API.

    const dismissed = getReferenceTriggerStateForTest(view.state);
    assert.equal(dismissed?.match, null, "close() must suppress the match");
    assert.equal(dismissed?.dismissedAt, originalFrom);

    // Edit EARLIER in the doc (position 1, inside the first paragraph): this
    // shifts every position after it, including the dismissed trigger, by 1.
    view.dispatch(view.state.tr.insertText("X", 1));

    const afterShift = getReferenceTriggerStateForTest(view.state);
    assert.equal(
      afterShift?.dismissedAt,
      originalFrom + 1,
      "dismissedAt must be re-mapped through the earlier edit's transaction",
    );
    assert.equal(
      afterShift?.match,
      null,
      "the shifted run must remain suppressed, not reopen the picker",
    );
  });

  setReferencePickerHandler(null);
  await editor.destroy();
});

// FINDING 3(b) regression (Important, collision): the plugin must close the
// picker when focus leaves the editor's DOM entirely (e.g. the user tabs into
// a frontmatter field or a RelationsPanel row without dismissing the [[ run),
// since PM's transaction-derived state has no notion of DOM focus on its own.
test("triggerPlugin: focusout on the editor DOM closes the picker (emits null)", async () => {
  const root = globalThis.document.createElement("div");
  const editor = await useMilkdownPresets(
    Editor.make().config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, "[[bar\n");
    }),
  )
    .use(referenceAutocompletePlugin)
    .create();

  let latestState: ReferencePickerState | null | "unset" = "unset";
  setReferencePickerHandler((s) => {
    latestState = s;
  });

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const end = Selection.atEnd(view.state.doc);
    view.dispatch(view.state.tr.setSelection(end));
  });
  assert.notEqual(latestState, "unset", "expected the picker to open first");
  assert.ok(latestState, "expected an open trigger before testing focusout");

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    view.dom.dispatchEvent(new Event("focusout", { bubbles: true }));
  });
  assert.equal(latestState, null, "focusout must close the picker (emit null)");

  setReferencePickerHandler(null);
  await editor.destroy();
});

// Picker component: renders the REAL searchReferenceTargets results for a
// query with a known top hit (no stubbed result data), and owns Enter/click
// apply itself (see the capture-phase-listener header comment in
// referenceAutocomplete.ts). happy-dom's coordsAtPos is not exercised here
// (the stubbed state's rect is a plain literal, never derived from a live
// view), so no real-coordinate assertions are made.
test("ReferencePicker: renders the top component row with its badge and Enter calls apply with that target", () => {
  cleanup();
  const applied: { target: ReferenceTarget | null } = { target: null };
  // A real element standing in for the editor's contenteditable root: the
  // capture-phase keydown handler now scopes to state.editorDom.contains(),
  // so the test's synthetic Enter must originate from inside it (or a
  // descendant) to be treated as "the picker is still relevant".
  const editorDom = document.body.appendChild(document.createElement("div"));
  const state: ReferencePickerState = {
    query: "but",
    rect: { left: 0, bottom: 0, top: 0 },
    editorDom,
    apply: (t) => {
      applied.target = t;
    },
    close: () => {},
  };

  // React.createElement (not JSX): this file is .ts, not .tsx, matching
  // the brief's file list exactly.
  render(
    React.createElement(
      Theme,
      null,
      React.createElement(ReferencePicker, {
        state,
        currentBodyText: "",
      }),
    ),
  );

  const top = searchReferenceTargets("but", "")[0]!;
  assert.ok(screen.getByText(top.label), "top result's label did not render");
  assert.ok(
    screen.getAllByText("component").length > 0,
    "no component badge rendered",
  );

  fireEvent.keyDown(editorDom, { key: "Enter" });
  assert.equal(applied.target?.href, top.href);
  editorDom.remove();
  cleanup();
});

test("ReferencePicker: clicking a row calls apply with that target", () => {
  cleanup();
  const applied: { target: ReferenceTarget | null } = { target: null };
  const editorDom = document.body.appendChild(document.createElement("div"));
  const state: ReferencePickerState = {
    query: "but",
    rect: { left: 0, bottom: 0, top: 0 },
    editorDom,
    apply: (t) => {
      applied.target = t;
    },
    close: () => {},
  };

  render(
    React.createElement(
      Theme,
      null,
      React.createElement(ReferencePicker, {
        state,
        currentBodyText: "",
      }),
    ),
  );

  const top = searchReferenceTargets("but", "")[0]!;
  fireEvent.mouseDown(screen.getByText(top.label));
  assert.equal(applied.target?.href, top.href);
  editorDom.remove();
  cleanup();
});

test("ReferencePicker: a keydown whose target is outside editorDom is not consumed", () => {
  cleanup();
  const applied: { target: ReferenceTarget | null } = { target: null };
  const closed: { called: boolean } = { called: false };
  const editorDom = document.body.appendChild(document.createElement("div"));
  const outside = document.body.appendChild(document.createElement("div"));
  const state: ReferencePickerState = {
    query: "but",
    rect: { left: 0, bottom: 0, top: 0 },
    editorDom,
    apply: (t) => {
      applied.target = t;
    },
    close: () => {
      closed.called = true;
    },
  };

  render(
    React.createElement(
      Theme,
      null,
      React.createElement(ReferencePicker, {
        state,
        currentBodyText: "",
      }),
    ),
  );

  // Enter, Escape, and arrow keys all originate from an element the picker's
  // editorDom does not contain (e.g. a frontmatter form field, or a
  // RelationsPanel row): none of them should reach apply/close.
  fireEvent.keyDown(outside, { key: "Enter" });
  fireEvent.keyDown(outside, { key: "Escape" });
  fireEvent.keyDown(outside, { key: "ArrowDown" });
  assert.equal(
    applied.target,
    null,
    "apply must not fire for an outside target",
  );
  assert.equal(
    closed.called,
    false,
    "close must not fire for an outside target",
  );

  editorDom.remove();
  outside.remove();
  cleanup();
});
