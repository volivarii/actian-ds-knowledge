// ReferencePicker positioning: the caret-anchored `[[` popup must stay inside
// the viewport. These tests drive the component with fake picker state at
// different caret rects and assert the resolved fixed-position style (left is
// clamped near the right edge; the card flips above the caret when there is no
// room below). Keyboard nav + result rendering are covered via
// referenceAutocomplete.test.ts and the search layer; here we pin geometry.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { ReferencePicker } from "../../src/markdown-engine/ReferencePicker";
import type { ReferencePickerState } from "../../src/markdown-engine/referenceAutocomplete";

afterEach(cleanup);

function makeState(rect: {
  left: number;
  bottom: number;
  top?: number;
}): ReferencePickerState {
  return {
    query: "",
    // Default top to just above the caret line when a test does not exercise
    // the flip-up path; the flip tests pass an explicit top.
    rect: {
      left: rect.left,
      bottom: rect.bottom,
      top: rect.top ?? rect.bottom,
    },
    editorDom: document.body,
    apply: () => {},
    close: () => {},
  };
}

function fixedCard(container: HTMLElement): HTMLElement {
  const el = Array.from(container.querySelectorAll("*")).find(
    (n) => (n as HTMLElement).style?.position === "fixed",
  );
  assert.ok(el, "expected a position:fixed popup card");
  return el as HTMLElement;
}

function renderPicker(state: ReferencePickerState) {
  return render(
    <Theme>
      <ReferencePicker state={state} currentBodyText="" />
    </Theme>,
  );
}

test("popup renders below the caret at its left when there is room", () => {
  const { container } = renderPicker(makeState({ left: 100, bottom: 200 }));
  const card = fixedCard(container);
  assert.equal(card.style.left, "100px");
  assert.equal(card.style.top, "204px");
  assert.equal(card.style.bottom, "");
});

test("left edge is clamped so a 320px card near the right margin stays on-screen", () => {
  const vw = window.innerWidth;
  const { container } = renderPicker(makeState({ left: vw - 10, bottom: 200 }));
  const card = fixedCard(container);
  // Expected clamp: viewport width - card width (320) - margin (8).
  assert.equal(card.style.left, `${vw - 320 - 8}px`);
});

test("left edge never goes negative when the caret sits at the far left", () => {
  const { container } = renderPicker(makeState({ left: 0, bottom: 200 }));
  const card = fixedCard(container);
  assert.equal(card.style.left, "8px");
});

test("card flips above the caret when there is no room for its full height below", () => {
  const vh = window.innerHeight;
  // Caret near the bottom: little space below, plenty above.
  const { container } = renderPicker(
    makeState({ left: 100, bottom: vh - 20, top: vh - 40 }),
  );
  const card = fixedCard(container);
  assert.equal(card.style.top, "");
  // bottom = viewportH - caretTop + 4
  assert.equal(card.style.bottom, `${vh - (vh - 40) + 4}px`);
});
