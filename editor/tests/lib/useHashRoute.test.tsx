import "../setup-happy-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, cleanup, act } from "@testing-library/react";
import React, { StrictMode, useCallback, useEffect, useState } from "react";
import { useHashRoute } from "../../src/lib/useHashRoute";
import { stateFromHash, DEFAULT_EXPLORE_TAB } from "../../src/lib/routes";
import type { ExploreTab } from "../../src/app/HomeScreen";

interface Api {
  setActivePath: (p: string | null) => void;
  setExploreTab: (t: ExploreTab) => void;
}

/**
 * Mirrors App.tsx: seed state from the address during the first render, then
 * let the hook keep the two in step.
 *
 * `onReady` hands the setters to the test so it can drive the app WITHOUT
 * touching the hash. Every earlier test in this file set the hash itself and
 * then asserted the hash, so the write effect always found the address already
 * correct and returned early: deleting the line that writes the address left
 * all of them green.
 */
function Harness({
  seen,
  onReady,
  report,
}: {
  seen: (string | null)[];
  onReady?: (api: Api) => void;
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
  useEffect(() => {
    onReady?.({ setActivePath, setExploreTab });
  }, [onReady]);
  report?.(exploreTab);
  return null;
}

function setHash(h: string) {
  window.location.hash = h;
}

/** Records how the address was changed: by assignment (pushes a history entry)
 *  or by replaceState (does not). */
function recordWrites<T>(run: () => T): {
  pushed: string[];
  replaced: string[];
  result: T;
} {
  const pushed: string[] = [];
  const replaced: string[] = [];
  const proto = Object.getPrototypeOf(window.location);
  const hashProp = Object.getOwnPropertyDescriptor(proto, "hash");
  const originalReplace = window.history.replaceState;
  Object.defineProperty(proto, "hash", {
    configurable: true,
    get: hashProp?.get,
    set(v: string) {
      pushed.push(v);
      hashProp?.set?.call(this, v);
    },
  });
  window.history.replaceState = ((_s: unknown, _t: string, url?: string) => {
    replaced.push(url ?? "");
    if (url) hashProp?.set?.call(window.location, url);
  }) as typeof window.history.replaceState;
  try {
    return { pushed, replaced, result: run() };
  } finally {
    if (hashProp) Object.defineProperty(proto, "hash", hashProp);
    window.history.replaceState = originalReplace;
  }
}

test("the app navigating writes the address", () => {
  // The gate that was missing. Nothing here touches the hash: the app changes
  // state, and the address has to follow it.
  setHash("#/");
  let api: Api | null = null;
  render(<Harness seen={[]} onReady={(a) => (api = a)} />);
  act(() => {
    api?.setActivePath("components/src/button/content.md");
  });
  assert.equal(window.location.hash, "#/component/button/content");
  assert.equal(document.title, "Button content · Actian DS Knowledge Editor");
  cleanup();
});

test("the app navigating pushes, so Back returns to where it was", () => {
  setHash("#/");
  let api: Api | null = null;
  const { pushed, replaced } = recordWrites(() => {
    render(<Harness seen={[]} onReady={(a) => (api = a)} />);
    act(() => {
      api?.setActivePath("content/src/patterns/forms.md");
    });
  });
  assert.deepEqual(pushed, ["#/pattern/forms"]);
  assert.deepEqual(replaced, [], "a real navigation must not replace history");
  cleanup();
});

test("choosing a home data view writes its address", () => {
  setHash("#/");
  let api: Api | null = null;
  render(<Harness seen={[]} onReady={(a) => (api = a)} />);
  act(() => {
    api?.setExploreTab("patterns");
  });
  assert.equal(window.location.hash, "#/explore/patterns");
  assert.equal(document.title, "Patterns · Actian DS Knowledge Editor");
  cleanup();
});

test("the address the app wrote is not read back as a navigation", () => {
  setHash("#/");
  const seen: (string | null)[] = [];
  let api: Api | null = null;
  render(<Harness seen={seen} onReady={(a) => (api = a)} />);
  act(() => {
    api?.setActivePath("components/src/button/usage.md");
  });
  seen.length = 0;
  act(() => {
    window.dispatchEvent(new Event("hashchange"));
  });
  assert.deepEqual(seen, [], "the hook read its own write back as a navigation");
  cleanup();
});

test("arriving on a non-canonical address corrects it without spending history", () => {
  // A chat client appended a slash. The reader should end up on the right
  // screen at the canonical address, and their first Back should still leave
  // the editor rather than landing on the rejected entry.
  setHash("#/pattern/forms/");
  const { pushed, replaced } = recordWrites(() => {
    render(<Harness seen={[]} />);
  });
  assert.deepEqual(replaced, ["#/pattern/forms"]);
  assert.deepEqual(pushed, [], "correcting an address must not push");
  cleanup();
});

test("an unreadable address is corrected too, not left in the bar", () => {
  // The screen and the address disagreed indefinitely: the address decoded to
  // the state the app already held, so React bailed out, the write effect never
  // re-ran, and the reader could copy the broken address back out.
  setHash("#/");
  render(<Harness seen={[]} />);
  act(() => {
    setHash("#/component/button/typo");
    window.dispatchEvent(new Event("hashchange"));
  });
  assert.equal(window.location.hash, "#/");
  cleanup();
});

test("a deep link survives StrictMode's double mount", () => {
  setHash("#/component/button/content");
  const { pushed, replaced } = recordWrites(() => {
    render(
      <StrictMode>
        <Harness seen={[]} />
      </StrictMode>,
    );
  });
  assert.deepEqual(pushed, [], "the hook wrote over the address it was given");
  assert.deepEqual(replaced, []);
  assert.equal(window.location.hash, "#/component/button/content");
  cleanup();
});

test("an address the browser percent-encodes is not read back as a navigation", () => {
  // location.hash returns the encoded form of what was assigned, so a raw
  // string comparison saw the hook's own write as a reader navigation and
  // navigated the app onto a path that exists nowhere.
  setHash("#/");
  const seen: (string | null)[] = [];
  let api: Api | null = null;
  render(<Harness seen={seen} onReady={(a) => (api = a)} />);
  act(() => {
    api?.setActivePath("content/src/writing/tone of voice.md");
  });
  seen.length = 0;
  act(() => {
    window.dispatchEvent(new Event("hashchange"));
  });
  assert.deepEqual(seen, [], "the encoded echo was read as a navigation");
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

test("arriving at the bare URL does not spend a history entry", () => {
  setHash("#/");
  window.location.hash = "";
  const { pushed, replaced } = recordWrites(() => {
    render(<Harness seen={[]} />);
  });
  assert.deepEqual(replaced, ["#/"]);
  assert.deepEqual(pushed, []);
  cleanup();
});
