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
import { TextSelection } from "@milkdown/prose/state";
import React from "react";
import { Theme } from "@radix-ui/themes";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import {
  useMilkdownPresets,
  assertGuardSafe,
} from "../../src/markdown-engine/milkdownPreset";
import {
  insertReferenceLink,
  searchReferenceTargets,
  type ReferenceTarget,
  type ReferencePickerState,
} from "../../src/markdown-engine/referenceAutocomplete";
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

// Picker component: renders the REAL searchReferenceTargets results for a
// query with a known top hit (no stubbed result data), and owns Enter/click
// apply itself (see the capture-phase-listener header comment in
// referenceAutocomplete.ts). happy-dom's coordsAtPos is not exercised here
// (the stubbed state's rect is a plain literal, never derived from a live
// view), so no real-coordinate assertions are made.
test("ReferencePicker: renders the top component row with its badge and Enter calls apply with that target", () => {
  cleanup();
  const applied: { target: ReferenceTarget | null } = { target: null };
  const state: ReferencePickerState = {
    query: "but",
    rect: { left: 0, bottom: 0 },
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

  fireEvent.keyDown(document, { key: "Enter" });
  assert.equal(applied.target?.href, top.href);
  cleanup();
});

test("ReferencePicker: clicking a row calls apply with that target", () => {
  cleanup();
  const applied: { target: ReferenceTarget | null } = { target: null };
  const state: ReferencePickerState = {
    query: "but",
    rect: { left: 0, bottom: 0 },
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
  cleanup();
});
