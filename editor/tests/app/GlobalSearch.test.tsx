import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Theme } from "@radix-ui/themes";
import React from "react";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import { GlobalSearch } from "../../src/app/GlobalSearch";
import { buildSearchIndex } from "../../src/lib/searchIndex";
import type { SearchBodyDoc } from "../../src/lib/searchBodies";

afterEach(() => cleanup());
const AUTHORABLE = new Set(["button", "modal", "combo-box"]);
const INDEX = buildSearchIndex(AUTHORABLE);

function mount(bodyDocs?: readonly SearchBodyDoc[]) {
  const calls: string[] = [];
  const runs: string[] = [];
  let loads = 0;
  const loadBodies = () => {
    loads += 1;
    return Promise.resolve(bodyDocs ?? []);
  };
  const actions = [
    {
      id: "home",
      label: "Go home",
      group: "Navigate",
      run: () => runs.push("home"),
    },
  ];
  render(
    <Theme>
      <GlobalSearch
        index={INDEX}
        authorable={AUTHORABLE}
        actions={actions}
        onOpenFile={(p) => calls.push(p)}
        loadBodies={loadBodies}
      />
    </Theme>,
  );
  return {
    calls,
    runs,
    loadCount: () => loads,
    input: screen.getByLabelText(
      /search the design system/i,
    ) as HTMLInputElement,
  };
}

test("GlobalSearch: typing a component name opens it on mousedown", () => {
  const { calls, input } = mount();
  fireEvent.change(input, { target: { value: "button" } });
  fireEvent.mouseDown(screen.getByText("Button"));
  assert.deepEqual(calls, ["workspace/button"]);
});

test("GlobalSearch: ArrowDown then Enter opens the first result", () => {
  const { calls, input } = mount();
  fireEvent.change(input, { target: { value: "modal" } });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
  assert.equal(calls[0], "workspace/modal");
});

test("GlobalSearch: bare Enter (no ArrowDown) falls through to the top hit", () => {
  const { calls, input } = mount();
  fireEvent.change(input, { target: { value: "modal" } });
  fireEvent.keyDown(input, { key: "Enter" });
  assert.equal(calls[0], "workspace/modal");
});

test("GlobalSearch: an action runs on mousedown", () => {
  const { runs, input } = mount();
  fireEvent.change(input, { target: { value: "home" } });
  fireEvent.mouseDown(screen.getByText("Go home"));
  assert.deepEqual(runs, ["home"]);
});

test("GlobalSearch: empty query shows Actions only, and rows never show a path", () => {
  const { input } = mount();
  fireEvent.focus(input);
  assert.ok(screen.getByText("Go home"));
  assert.equal(screen.queryByText("Button"), null);
  fireEvent.change(input, { target: { value: "button" } });
  assert.equal(screen.queryByText("workspace/button"), null);
});

test("GlobalSearch: after a selection, Enter on the reshown popover opens the top hit (no stale active index)", () => {
  const { runs, input } = mount();
  // A multi-row query, then move the highlight to index 1.
  fireEvent.change(input, { target: { value: "o" } });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  // Select via Enter: this clears the query and (the fix under test) resets
  // active. Without the reset, active would stay at 1.
  fireEvent.keyDown(input, { key: "Enter" });
  // Reopen on the now-empty query (Actions only = one row). A leftover active
  // of 1 would make the next Enter run rows[1] (undefined) and silently do
  // nothing; the reset makes it fall through to the top hit.
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "Enter" });
  assert.deepEqual(runs, ["home"]);
});

// ── Body search (finding F2) ────────────────────────────────────────────────

const BUTTON_CONTENT: SearchBodyDoc = {
  path: "components/src/button/content.md",
  text: "Style Use sentence case for all button labels.",
};

async function engage(input: HTMLInputElement, value: string) {
  await act(async () => {
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value } });
  });
}

test("GlobalSearch: the body corpus is not fetched until the field is used", async () => {
  const { input, loadCount } = mount([BUTTON_CONTENT]);
  assert.equal(loadCount(), 0, "300 KB of prose on a page nobody searched");
  await engage(input, "sentence case");
  assert.equal(loadCount(), 1);
});

test("GlobalSearch: a phrase from the guidance opens the document it is in", async () => {
  const { input, calls } = mount([BUTTON_CONTENT]);
  await engage(input, "sentence case");
  const row = screen.getByText(/sentence case for all button labels/i);
  assert.ok(row, "the snippet says why the row is here");
  fireEvent.mouseDown(row);
  assert.deepEqual(calls, ["components/src/button/content.md"]);
});

test("GlobalSearch: a query that matches nothing says so", async () => {
  const { input } = mount([BUTTON_CONTENT]);
  await engage(input, "nothing at all matches this");
  const status = screen.getByRole("status");
  assert.match(status.textContent ?? "", /No matches for/i);
  assert.match(status.textContent ?? "", /nothing at all matches this/i);
});

test("GlobalSearch: an empty field never says 'no matches'", async () => {
  // Focus alone still offers the Actions group, as it always has. What must
  // not happen is the new empty state firing for a query nobody typed.
  // `assert.ok(x === null)`, never `assert.equal(node, null)`: node:test
  // serialises the whole DOM node to build the diff and is SIGKILLed for it.
  const { input } = mount([BUTTON_CONTENT]);
  await act(async () => {
    fireEvent.focus(input);
  });
  assert.ok(screen.queryByRole("status") === null, "no empty state yet");
  assert.ok(screen.queryByRole("listbox") !== null, "actions still offered");
});

test("GlobalSearch: a re-render mid-load does not strand the popover", async () => {
  // The regression a "have we started" flag produces: the re-render's cleanup
  // cancels the first subscription, the second run returns early on the flag,
  // and nothing ever delivers the corpus. Passing a fresh `loadBodies` on each
  // render is how a caller triggers it — the same shape as `onOpenFile` above.
  let release: (d: readonly SearchBodyDoc[]) => void = () => {};
  const corpus = new Promise<readonly SearchBodyDoc[]>((r) => {
    release = r;
  });
  // A FRESH element each time, so `loadBodies` gets a new identity and the
  // effect actually re-runs. Re-rendering the same element object changes no
  // dependency, so it would prove nothing.
  const view = () => (
    <Theme>
      <GlobalSearch
        index={INDEX}
        authorable={AUTHORABLE}
        actions={[]}
        onOpenFile={() => {}}
        loadBodies={() => corpus}
      />
    </Theme>
  );
  const { rerender } = render(view());
  const input = screen.getByLabelText(
    /search the design system/i,
  ) as HTMLInputElement;
  await engage(input, "sentence case");
  rerender(view()); // a new loadBodies identity, corpus still in flight
  await act(async () => {
    release([BUTTON_CONTENT]);
  });
  assert.ok(
    screen.queryByText(/sentence case for all button labels/i) !== null,
    "the corpus arrived but never reached the popover",
  );
});

test("GlobalSearch: a corpus that fails to load does not claim it was searched", async () => {
  const calls: string[] = [];
  render(
    <Theme>
      <GlobalSearch
        index={INDEX}
        authorable={AUTHORABLE}
        actions={[]}
        onOpenFile={(p) => calls.push(p)}
        loadBodies={() => Promise.reject(new Error("chunk 404"))}
      />
    </Theme>,
  );
  const input = screen.getByLabelText(
    /search the design system/i,
  ) as HTMLInputElement;
  await engage(input, "sentence case");
  const status = screen.getByRole("status");
  assert.match(status.textContent ?? "", /No matches for/i);
  assert.match(status.textContent ?? "", /Titles only/i);
  assert.ok(
    !/covers titles and guidance text/i.test(status.textContent ?? ""),
    "must not claim the guidance was searched",
  );
});
