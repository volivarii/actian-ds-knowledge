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

test("a code-style mention can be turned into a link", () => {
  const text = "Distinct from `faceted-browse`.";
  const m = buildConnections({
    nodeId: "pattern:asset-detail-360",
    index: bakedGraphIndex(),
    original: {},
    live: {},
    bodies: [{ path: "p.md", text }],
  });
  let linked: [string, string] | null = null;
  render(
    <Theme>
      <ConnectionsSection
        model={m}
        file="p.md"
        onOpen={() => {}}
        onEdit={() => {}}
        onLinkMention={(s, t) => (linked = [s, t])}
      />
    </Theme>,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Faceted browse/ }));
  fireEvent.click(screen.getByRole("button", { name: "Turn it into a link" }));
  assert.deepEqual(linked, ["faceted-browse", "faceted browse"]);
});
