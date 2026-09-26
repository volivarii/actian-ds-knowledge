import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { bakedGraphIndex } from "../../src/substrate/graphIndex";
import { buildConnections } from "../../src/lib/connections/build";
import { ConnectionsSection } from "../../src/app/connections/ConnectionsSection";

beforeEach(() => globalThis.localStorage.clear());
afterEach(() => cleanup());

test("the map is the default: record in the middle, out lanes left, in lanes right", () => {
  const m = buildConnections({ nodeId: "component:button", index: bakedGraphIndex() });
  render(
    <Theme>
      <ConnectionsSection model={m} file="x" onOpen={() => {}} />
    </Theme>,
  );
  const left = screen.getByRole("group", { name: "Button links to" });
  const right = screen.getByRole("group", { name: "Links to Button" });
  assert.ok(within(left).getByText("Built from"));
  assert.ok(within(right).getByText("Nested in"));
  assert.ok(screen.getByRole("group", { name: "Button, the record" }));
});

test("a hub lane shows 12 then +78 more", () => {
  const m = buildConnections({ nodeId: "category:third-party-logos", index: bakedGraphIndex() });
  render(
    <Theme>
      <ConnectionsSection model={m} file="x" onOpen={() => {}} />
    </Theme>,
  );
  assert.ok(screen.getByRole("button", { name: "+78 more" }));
});

test("the view choice is remembered", () => {
  const m = buildConnections({ nodeId: "component:button", index: bakedGraphIndex() });
  const { unmount } = render(
    <Theme>
      <ConnectionsSection model={m} file="x" onOpen={() => {}} />
    </Theme>,
  );
  fireEvent.click(screen.getByRole("button", { name: "List" }));
  unmount();
  render(
    <Theme>
      <ConnectionsSection model={m} file="x" onOpen={() => {}} />
    </Theme>,
  );
  assert.ok(!screen.queryByRole("group", { name: "Button links to" }), "the list view came back as the map");
});

test("selecting a chip in the map opens the same panel", () => {
  const m = buildConnections({ nodeId: "component:button", index: bakedGraphIndex() });
  render(
    <Theme>
      <ConnectionsSection model={m} file="x" onOpen={() => {}} />
    </Theme>,
  );
  const right = screen.getByRole("group", { name: "Links to Button" });
  fireEvent.click(within(right).getAllByRole("button")[0]!);
  assert.doesNotMatch(screen.getByRole("region", { name: "Selected connection" }).textContent!, /Select a link/);
});

test("a group of mentions only shows no count, never a 0 beside its chips", () => {
  const text = "Distinct from `faceted-browse`.";
  const m = buildConnections({
    nodeId: "pattern:asset-detail-360",
    index: bakedGraphIndex(),
    original: {},
    live: {},
    bodies: [{ path: "p.md", text }],
  });
  for (const view of ["Map", "List"]) {
    const { unmount } = render(
      <Theme>
        <ConnectionsSection model={m} file="p.md" onOpen={() => {}} />
      </Theme>,
    );
    fireEvent.click(screen.getByRole("button", { name: view }));
    const lane = screen.getByRole("group", { name: /^Named in the text/ });
    assert.equal(lane.querySelectorAll(".cx-count").length, 0, `${view}: a count is shown`);
    unmount();
  }
});

test("counts are singular when there is one", () => {
  const m = buildConnections({ nodeId: "a11y:icons", index: bakedGraphIndex() });
  render(
    <Theme>
      <ConnectionsSection model={m} file="x" onOpen={() => {}} />
    </Theme>,
  );
  const text = screen.getByRole("heading", { name: "Connections" }).closest("section")!.textContent!;
  assert.match(text, /1 in 1 kind(?!s)/);
  assert.match(text, /1 connection(?!s)/);
});
