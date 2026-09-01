import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, cleanup, act } from "@testing-library/react";
import React, { StrictMode, useCallback, useState } from "react";
import { useHashRoute } from "../../src/lib/useHashRoute";
import { stateFromHash, DEFAULT_EXPLORE_TAB } from "../../src/lib/routes";
import type { ExploreTab } from "../../src/app/HomeScreen";

/** Mirrors what App.tsx does: seed state from the address during the first
 *  render, then let the hook keep the two in step. `seen` records every
 *  navigation the address asked for. */
function Harness({
  seen,
  report,
}: {
  seen: (string | null)[];
  report?: (tab: ExploreTab) => void;
}) {
  const [activePath, setActivePath] = useState<string | null>(
    () => stateFromHash(window.location.hash).activePath,
  );
  const [exploreTab, setExploreTab] = useState<ExploreTab>(
    () => stateFromHash(window.location.hash).exploreTab ?? DEFAULT_EXPLORE_TAB,
  );
  const onNavigate = useCallback(
    (p: string | null, tab: ExploreTab | null) => {
      seen.push(p);
      setActivePath(p);
      if (tab) setExploreTab(tab);
    },
    [seen],
  );
  useHashRoute({ activePath, exploreTab, onNavigate });
  report?.(exploreTab);
  return null;
}

function setHash(h: string) {
  window.location.hash = h;
}

test("a deep link survives the first render", () => {
  setHash("#/entity/data-product");
  render(<Harness seen={[]} />);
  assert.equal(window.location.hash, "#/entity/data-product");
  assert.equal(document.title, "Data Product · Actian DS Knowledge Editor");
  cleanup();
});

test("a deep link survives StrictMode's double mount", () => {
  // The regression this guards: a read-on-mount effect guarded by a ref runs
  // twice under StrictMode, because refs outlive the simulated remount, and
  // the second run writes the home address over the deep link.
  setHash("#/component/button/content");
  const writes: string[] = [];
  const proto = Object.getPrototypeOf(window.location);
  const original = Object.getOwnPropertyDescriptor(proto, "hash");
  Object.defineProperty(proto, "hash", {
    configurable: true,
    get: original?.get,
    set(v: string) {
      writes.push(v);
      original?.set?.call(this, v);
    },
  });
  try {
    render(
      <StrictMode>
        <Harness seen={[]} />
      </StrictMode>,
    );
  } finally {
    if (original) Object.defineProperty(proto, "hash", original);
  }
  assert.deepEqual(writes, [], "the hook wrote over the address it was given");
  assert.equal(window.location.hash, "#/component/button/content");
  cleanup();
});

test("opening a file writes its address and its title", () => {
  setHash("#/");
  const seen: (string | null)[] = [];
  render(<Harness seen={seen} />);
  act(() => {
    setHash("#/component/button/content");
    window.dispatchEvent(new Event("hashchange"));
  });
  assert.equal(window.location.hash, "#/component/button/content");
  assert.equal(document.title, "Button · Actian DS Knowledge Editor");
  cleanup();
});

test("going back navigates the app rather than leaving it", () => {
  setHash("#/");
  const seen: (string | null)[] = [];
  render(<Harness seen={seen} />);
  seen.length = 0;
  act(() => {
    setHash("#/pattern/forms");
    window.dispatchEvent(new Event("hashchange"));
  });
  assert.deepEqual(seen, ["content/src/patterns/forms.md"]);
  cleanup();
});

test("going back off a home tab restores the default tab", () => {
  // Without this, Back from #/explore/patterns to #/ leaves the tab strip on
  // Patterns while the address says home, and neither can correct the other.
  setHash("#/explore/patterns");
  let tab: ExploreTab | null = null;
  render(<Harness seen={[]} report={(t) => (tab = t)} />);
  assert.equal(tab, "patterns");
  act(() => {
    setHash("#/");
    window.dispatchEvent(new Event("hashchange"));
  });
  assert.equal(tab, "coverage", "the address said home, the tab did not follow");
  cleanup();
});

test("the hook's own write does not navigate the app again", () => {
  setHash("#/");
  const seen: (string | null)[] = [];
  render(<Harness seen={seen} />);
  seen.length = 0;
  act(() => {
    setHash("#/component/button/usage");
    window.dispatchEvent(new Event("hashchange"));
    // The write effect now runs for the navigation above. Its own echo must
    // not be read back as a second navigation.
    window.dispatchEvent(new Event("hashchange"));
  });
  assert.deepEqual(
    seen,
    ["components/src/button/usage.md"],
    "the address fed back into navigation",
  );
  cleanup();
});

test("arriving at the bare URL does not spend a history entry", () => {
  setHash("#/");
  window.location.hash = "";
  let replaced: string | null = null;
  const original = window.history.replaceState;
  window.history.replaceState = ((
    _s: unknown,
    _t: string,
    url?: string | null,
  ) => {
    replaced = url ?? null;
  }) as typeof window.history.replaceState;
  try {
    render(<Harness seen={[]} />);
  } finally {
    window.history.replaceState = original;
  }
  assert.equal(replaced, "#/");
  cleanup();
});
