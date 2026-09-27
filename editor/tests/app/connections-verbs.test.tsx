import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import React from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { bakedGraphIndex } from "../../src/substrate/graphIndex";
import { buildConnections } from "../../src/lib/connections/build";
import { ConnectionsSection } from "../../src/app/connections/ConnectionsSection";
import type { ConnectionEdit } from "../../src/lib/connections/types";
import { applyConnectionEdit, ownedValues } from "../../src/lib/connections/owned";

beforeEach(() => globalThis.localStorage.clear());
afterEach(() => cleanup());

test("changing an entity's relation type is one edit: remove from one, add to the other", () => {
  const v = { "relationships.contains": ["metadata"] };
  const m = buildConnections({ nodeId: "entity:catalog-object", index: bakedGraphIndex(), original: v, live: v });
  const edits: ConnectionEdit[][] = [];
  render(
    <Theme>
      <ConnectionsSection model={m} file="e.md" onOpen={() => {}} onEdit={(e) => edits.push(e)} />
    </Theme>,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Metadata/ }));
  fireEvent.change(screen.getByRole("combobox", { name: "Change to" }), { target: { value: "uses" } });
  // Picking in the list (arrow keys on a closed select commit on some
  // platforms) changes nothing until the author confirms.
  assert.equal(edits.length, 0, "the select alone wrote an edit");
  fireEvent.click(screen.getByRole("button", { name: "Change" }));
  assert.deepEqual(edits[0], [
    { op: "remove", field: ["relationships", "contains"], slug: "metadata", shape: "slug" },
    { op: "add", field: ["relationships", "uses"], slug: "metadata", shape: "slug" },
  ]);
});

test("Change to is offered only on a saved entity relation", () => {
  const v = { apps: ["studio"] };
  const m = buildConnections({ nodeId: "entity:catalog-object", index: bakedGraphIndex(), original: v, live: v });
  render(
    <Theme>
      <ConnectionsSection model={m} file="e.md" onOpen={() => {}} onEdit={() => {}} />
    </Theme>,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Studio/ }));
  assert.ok(!screen.queryByRole("combobox", { name: "Change to" }), "Change to offered on a product link");
});

test("after Change, focus stays in the section and the relation is selected in its new group", () => {
  function Live() {
    const [data, setData] = React.useState<Record<string, unknown>>({ relationships: { contains: ["metadata"] } });
    const v0 = { "relationships.contains": ["metadata"] };
    const m = buildConnections({
      nodeId: "entity:catalog-object",
      index: bakedGraphIndex(),
      original: v0,
      live: ownedValues("entity", data),
    });
    return (
      <ConnectionsSection
        model={m}
        file="e.md"
        onOpen={() => {}}
        onEdit={(es) => setData((d) => es.reduce((x, e) => applyConnectionEdit(x, e), d))}
      />
    );
  }
  render(
    <Theme>
      <Live />
    </Theme>,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Metadata/ }));
  fireEvent.change(screen.getByRole("combobox", { name: "Change to" }), { target: { value: "uses" } });
  const change = screen.getByRole("button", { name: "Change" });
  change.focus();
  fireEvent.click(change);
  const section = screen.getByRole("region", { name: "Connections" });
  assert.ok(section.contains(document.activeElement), `focus went to ${document.activeElement?.tagName}`);
  assert.match(screen.getByRole("region", { name: "Selected connection" }).textContent ?? "", /uses Metadata/i);
});
