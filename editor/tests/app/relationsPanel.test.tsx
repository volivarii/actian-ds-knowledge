// RelationsPanel: the rail beside the body editor, which is the document's
// outline. A record's links moved to its Connections section; see
// connections-retire.test.tsx for the guard that keeps them out of the rail.
// `collapsed` is a controlled prop owned by the parent screen: the panel does
// not read or write localStorage itself, so these tests drive visibility via
// the prop and separately pin the exported storage util.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import {
  RelationsPanel,
  readRelationsPanelCollapsed,
  writeRelationsPanelCollapsed,
} from "../../src/app/RelationsPanel";
import type { Heading } from "../../src/lib/headingScan";

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

const TEXT = "## Usage {#usage}\n\nBody.\n\n## Style {#style}\n\nMore.\n";

function renderPanel(overrides: Partial<React.ComponentProps<typeof RelationsPanel>> = {}) {
  const calls: string[] = [];
  const navs: Array<{ heading: Heading; index: number }> = [];
  const utils = render(
    <Theme>
      <RelationsPanel
        text={TEXT}
        onNavigate={(heading, index) => navs.push({ heading, index })}
        collapsed={false}
        onToggleCollapsed={() => calls.push("toggle")}
        {...overrides}
      />
    </Theme>,
  );
  return { ...utils, calls, navs };
}

const rows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-testid='outline-row']")) as HTMLElement[];

test("renders the outline headings", () => {
  const { container } = renderPanel();
  assert.deepEqual(
    rows(container).map((r) => r.textContent),
    ["Usage", "Style"],
  );
});

test("clicking an outline row navigates to that heading, passing its index", () => {
  const { container, navs } = renderPanel();
  fireEvent.click(rows(container).find((r) => r.textContent === "Style")!);
  assert.equal(navs.length, 1);
  assert.equal(navs[0]!.index, 1);
  assert.equal(navs[0]!.heading.text, "Style");
});

test("an outline row responds to Enter like a click", () => {
  const { container, navs } = renderPanel();
  fireEvent.keyDown(rows(container)[0]!, { key: "Enter" });
  assert.equal(navs.length, 1);
});

test("the rail lists no links: no Referenced by, References or graph groups", () => {
  const { container } = renderPanel();
  const txt = container.textContent ?? "";
  for (const gone of ["Referenced by", "References", "In the graph", "Manage"])
    assert.ok(!txt.includes(gone), `the rail still shows ${gone}`);
});

test("clicking the toggle button calls onToggleCollapsed (collapsed state is owned by the parent)", () => {
  const { calls } = renderPanel();
  fireEvent.click(screen.getByLabelText("Toggle relations panel"));
  assert.ok(calls.includes("toggle"));
});

test("collapsed=true hides the outline, keeps the header", () => {
  const { container } = renderPanel({ collapsed: true });
  assert.ok(container.textContent!.includes("Outline"));
  assert.ok(!container.textContent!.includes("Usage"));
});

test("readRelationsPanelCollapsed / writeRelationsPanelCollapsed round-trip through localStorage", () => {
  assert.equal(readRelationsPanelCollapsed(), false);
  writeRelationsPanelCollapsed(true);
  assert.equal(localStorage.getItem("relationsPanelCollapsed"), "1");
  assert.equal(readRelationsPanelCollapsed(), true);
  writeRelationsPanelCollapsed(false);
  assert.equal(localStorage.getItem("relationsPanelCollapsed"), "0");
  assert.equal(readRelationsPanelCollapsed(), false);
});

test("outline renders nothing when text has no headings", () => {
  const { container } = renderPanel({ text: "just prose, no headings" });
  assert.equal(rows(container).length, 0);
});

test("outline indentation: H2 deeper than H1, H3 deeper than H2", () => {
  const { container } = renderPanel({ text: "# Top\n## Section\n### Sub\n" });
  const pads = rows(container).map((el) => parseFloat(el.style.paddingLeft));
  assert.equal(pads.length, 3);
  assert.ok(pads[0]! < pads[1]!);
  assert.ok(pads[1]! < pads[2]!);
});

test("activeAnchor marks the matching outline row (data-active)", () => {
  const { container } = renderPanel({ activeAnchor: "style" });
  const r = rows(container);
  assert.equal(r.find((x) => x.textContent === "Style")!.getAttribute("data-active"), "true");
  assert.equal(r.find((x) => x.textContent === "Usage")!.getAttribute("data-active"), null);
});

test("activeAnchor of null (rich mode) marks no outline row", () => {
  const { container } = renderPanel({ activeAnchor: null });
  assert.equal(container.querySelectorAll("[data-active='true']").length, 0);
});
