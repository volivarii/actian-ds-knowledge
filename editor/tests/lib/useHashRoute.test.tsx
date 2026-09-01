import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, cleanup, act } from "@testing-library/react";
import React from "react";
import { useHashRoute } from "../../src/lib/useHashRoute";

/** Minimal harness: mirrors what App.tsx does with the hook, and records every
 *  navigation the hook asks for so a test can assert on it. */
function Harness({
  activePath,
  onNavigate,
}: {
  activePath: string | null;
  onNavigate: (p: string | null) => void;
}) {
  useHashRoute({ activePath, exploreTab: "coverage", onNavigate });
  return null;
}

function setHash(h: string) {
  window.location.hash = h;
}

test("a deep link decides the screen on first load", () => {
  setHash("#/component/button/content");
  const seen: (string | null)[] = [];
  render(<Harness activePath={null} onNavigate={(p) => seen.push(p)} />);
  assert.deepEqual(seen, ["components/src/button/content.md"]);
  cleanup();
});

test("a deep link is not overwritten by the initial empty state", () => {
  setHash("#/entity/data-product");
  render(<Harness activePath={null} onNavigate={() => {}} />);
  assert.equal(window.location.hash, "#/entity/data-product");
  cleanup();
});

test("opening a file writes its address and its title", () => {
  setHash("#/");
  const { rerender } = render(
    <Harness activePath={null} onNavigate={() => {}} />,
  );
  rerender(
    <Harness
      activePath="components/src/button/content.md"
      onNavigate={() => {}}
    />,
  );
  assert.equal(window.location.hash, "#/component/button/content");
  assert.equal(document.title, "Button · Actian DS Knowledge Editor");
  cleanup();
});

test("going back navigates the app rather than leaving it", () => {
  setHash("#/");
  const seen: (string | null)[] = [];
  render(<Harness activePath={null} onNavigate={(p) => seen.push(p)} />);
  seen.length = 0;
  act(() => {
    setHash("#/pattern/forms");
    window.dispatchEvent(new Event("hashchange"));
  });
  assert.deepEqual(seen, ["content/src/patterns/forms.md"]);
  cleanup();
});

test("the hook's own write does not navigate the app again", () => {
  setHash("#/");
  const seen: (string | null)[] = [];
  const { rerender } = render(
    <Harness activePath={null} onNavigate={(p) => seen.push(p)} />,
  );
  seen.length = 0;
  act(() => {
    rerender(
      <Harness
        activePath="components/src/button/usage.md"
        onNavigate={(p) => seen.push(p)}
      />,
    );
    window.dispatchEvent(new Event("hashchange"));
  });
  assert.deepEqual(seen, [], "writing the address fed back into navigation");
  cleanup();
});
