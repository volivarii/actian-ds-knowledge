import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { bakedGraphIndex } from "../../src/substrate/graphIndex";
import { buildConnections } from "../../src/lib/connections/build";
import { ConnectionsSection } from "../../src/app/connections/ConnectionsSection";
import type { ConnectionEdit } from "../../src/lib/connections/types";

beforeEach(() => globalThis.localStorage.clear());
afterEach(() => cleanup());
const v = { apps: ["studio"], components: ["tabs"] };
const model = (live: Record<string, string[]> = v) =>
  buildConnections({ nodeId: "pattern:asset-detail-360", index: bakedGraphIndex(), original: v, live });

test("+ Connect asks the kind first, then offers only that type", () => {
  const edits: ConnectionEdit[][] = [];
  render(
    <Theme>
      <ConnectionsSection model={model()} file="p.md" onOpen={() => {}} onEdit={(e) => edits.push(e)} />
    </Theme>,
  );
  fireEvent.click(screen.getByRole("button", { name: "+ Connect" }));
  const picker = screen.getByRole("region", { name: "Connect" });
  fireEvent.click(within(picker).getByRole("button", { name: /Built from/ }));
  const box = screen.getByRole("combobox", { name: /Find a component/ });
  fireEvent.change(box, { target: { value: "avat" } });
  fireEvent.keyDown(box, { key: "Enter" });
  assert.deepEqual(edits[0], [{ op: "add", field: ["components"], slug: "avatar", shape: "slug" }]);
});

test("the picker leaves out what is already linked and the record itself", () => {
  render(
    <Theme>
      <ConnectionsSection model={model()} file="p.md" onOpen={() => {}} onEdit={() => {}} />
    </Theme>,
  );
  fireEvent.click(screen.getByRole("button", { name: "+ Connect" }));
  fireEvent.click(within(screen.getByRole("region", { name: "Connect" })).getByRole("button", { name: /Built from/ }));
  fireEvent.change(screen.getByRole("combobox", { name: /Find a component/ }), { target: { value: "tab" } });
  const titles = screen.getAllByRole("option").map((o) => o.textContent);
  assert.ok(titles.some((t) => /^Table/.test(t ?? "")), `Table not offered: ${titles.join(", ")}`);
  assert.ok(!titles.some((t) => /^Tabs/.test(t ?? "")), `Tabs offered again: ${titles.join(", ")}`);
});

test("a lane's + Add skips the first step", () => {
  render(
    <Theme>
      <ConnectionsSection model={model()} file="p.md" onOpen={() => {}} onEdit={() => {}} />
    </Theme>,
  );
  const lane = screen.getByRole("group", { name: "Built from" });
  fireEvent.click(within(lane).getByRole("button", { name: "+ Add" }));
  assert.ok(screen.getByRole("combobox", { name: /Find a component/ }));
});

test("remove from the panel and with the Delete key", () => {
  const edits: ConnectionEdit[][] = [];
  render(
    <Theme>
      <ConnectionsSection model={model()} file="p.md" onOpen={() => {}} onEdit={(e) => edits.push(e)} />
    </Theme>,
  );
  const chip = screen.getByRole("button", { name: /^Tabs/ });
  fireEvent.keyDown(chip, { key: "Delete" });
  fireEvent.click(chip);
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  assert.deepEqual(
    edits.map((e) => e[0]!.op),
    ["remove", "remove"],
  );
});

test("a pending item offers Undo, which reverses it", () => {
  const edits: ConnectionEdit[][] = [];
  render(
    <Theme>
      <ConnectionsSection
        model={model({ apps: ["studio"], components: ["tabs", "avatar"] })}
        file="p.md"
        onOpen={() => {}}
        onEdit={(e) => edits.push(e)}
      />
    </Theme>,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Avatar/ }));
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  assert.deepEqual(edits[0], [{ op: "remove", field: ["components"], slug: "avatar", shape: "slug" }]);
});

test("pending changes show the draft bar and the file change", () => {
  let discarded = false;
  render(
    <Theme>
      <ConnectionsSection
        model={model({ apps: ["studio"], components: ["tabs", "avatar"] })}
        file="app-context/src/patterns/asset-detail-360.md"
        onOpen={() => {}}
        onEdit={() => {}}
        onDiscard={() => (discarded = true)}
      />
    </Theme>,
  );
  assert.ok(screen.getByText(/1 change not saved yet/));
  fireEvent.click(screen.getByRole("button", { name: /Review the file change/ }));
  assert.match(screen.getByRole("region", { name: "File change" }).textContent!, /\+\s+- avatar/);
  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  assert.equal(discarded, true);
});

test("a read-only reason replaces the editing controls", () => {
  render(
    <Theme>
      <ConnectionsSection
        model={model()}
        file="p.md"
        onOpen={() => {}}
        onEdit={() => {}}
        readOnlyReason="Close the YAML source to edit connections."
      />
    </Theme>,
  );
  assert.ok(!screen.queryByRole("button", { name: "+ Connect" }), "+ Connect shown while read-only");
  assert.ok(!screen.queryByRole("button", { name: "+ Add" }), "+ Add shown while read-only");
  assert.ok(screen.getAllByText(/Close the YAML source/).length > 0);
});

test("the list view can connect too", () => {
  render(
    <Theme>
      <ConnectionsSection model={model()} file="p.md" onOpen={() => {}} onEdit={() => {}} />
    </Theme>,
  );
  fireEvent.click(screen.getByRole("button", { name: "List" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Connect" }));
  assert.ok(screen.getByRole("region", { name: "Connect" }));
});

test("a pending link is never hidden behind +N more", () => {
  const many = ["tabs", "page-header", "breadcrumb", "side-nav", "drawer", "avatar", "checkbox", "button", "calendar"];
  const m = buildConnections({
    nodeId: "pattern:asset-detail-360",
    index: bakedGraphIndex(),
    original: { components: many },
    live: { components: [...many, "toggle"] },
  });
  render(
    <Theme>
      <ConnectionsSection model={m} file="p.md" onOpen={() => {}} onEdit={() => {}} />
    </Theme>,
  );
  const lane = screen.getByRole("group", { name: "Built from" });
  assert.ok(within(lane).getByRole("button", { name: /^Toggle.*new/ }));
  assert.ok(within(lane).getByRole("button", { name: "+1 more" }));
});
