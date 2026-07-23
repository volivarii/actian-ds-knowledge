import "../setup-dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { GlobalSearch } from "../../src/app/GlobalSearch";
import { buildSearchIndex } from "../../src/lib/searchIndex";

afterEach(() => cleanup());
const INDEX = buildSearchIndex(new Set(["button", "modal", "combo-box"]));

function mount() {
  const calls: string[] = [];
  const runs: string[] = [];
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
        actions={actions}
        onOpenFile={(p) => calls.push(p)}
      />
    </Theme>,
  );
  return {
    calls,
    runs,
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
