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
const model = () =>
  buildConnections({
    nodeId: "entity:catalog-object",
    index: bakedGraphIndex(),
    original: { apps: ["studio"], "relationships.relatesTo": ["glossary-item"] },
    live: { apps: ["studio"], "relationships.relatesTo": ["glossary-item"] },
  });

test("shows one count, each group's words and where it is stored", () => {
  render(
    <Theme>
      <ConnectionsSection model={model()} file="app-context/src/entities/catalog-object.md" onOpen={() => {}} />
    </Theme>,
  );
  assert.ok(screen.getByRole("heading", { name: "Connections" }));
  const related = screen.getByRole("group", { name: /Related to/ });
  assert.ok(within(related).getByText("Entities Catalog Object is related to."));
  assert.ok(within(related).getByText("Editable here"));
});

test("selecting a link explains it in a sentence and says where it is stored", () => {
  render(
    <Theme>
      <ConnectionsSection model={model()} file="app-context/src/entities/catalog-object.md" onOpen={() => {}} />
    </Theme>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Glossary Item/ }));
  const panel = screen.getByRole("region", { name: "Selected connection" });
  assert.match(panel.textContent!, /Catalog Object is related to Glossary Item\./);
  assert.match(panel.textContent!, /catalog-object\.md/);
  assert.match(panel.textContent!, /Glossary Item says it/);
});

test("a Figma link says it can't be changed here", () => {
  const m = buildConnections({ nodeId: "component:button", index: bakedGraphIndex() });
  render(
    <Theme>
      <ConnectionsSection model={m} file="components/src/button/_meta.yml" onOpen={() => {}} />
    </Theme>,
  );
  fireEvent.click(screen.getAllByRole("button", { name: /^Action/ })[0]!);
  assert.match(screen.getByRole("region", { name: "Selected connection" }).textContent!, /Set in Figma/);
});

test("Esc clears the panel", () => {
  render(
    <Theme>
      <ConnectionsSection model={model()} file="x.md" onOpen={() => {}} />
    </Theme>,
  );
  const chip = screen.getByRole("button", { name: /Glossary Item/ });
  fireEvent.click(chip);
  fireEvent.keyDown(chip, { key: "Escape" });
  assert.match(screen.getByRole("region", { name: "Selected connection" }).textContent!, /Select a link/);
});

test("Open calls onOpen with the node id", () => {
  let opened = "";
  render(
    <Theme>
      <ConnectionsSection model={model()} file="x.md" onOpen={(id) => (opened = id)} />
    </Theme>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Glossary Item/ }));
  fireEvent.click(screen.getByRole("button", { name: "Open Glossary Item" }));
  assert.equal(opened, "entity:glossary-item");
});

test("a hub shows a filter box in the list", () => {
  const m = buildConnections({ nodeId: "category:third-party-logos", index: bakedGraphIndex() });
  render(
    <Theme>
      <ConnectionsSection model={m} file="x" onOpen={() => {}} />
    </Theme>,
  );
  fireEvent.click(screen.getByRole("button", { name: "List" }));
  assert.ok(screen.getByRole("textbox", { name: /Filter 90/ }));
});

test("Enter in the filter box never submits the form around the section", () => {
  const m = buildConnections({ nodeId: "category:third-party-logos", index: bakedGraphIndex() });
  render(
    <Theme>
      <ConnectionsSection model={m} file="x" onOpen={() => {}} />
    </Theme>,
  );
  fireEvent.click(screen.getByRole("button", { name: "List" }));
  assert.equal(fireEvent.keyDown(screen.getByRole("textbox", { name: /Filter 90/ }), { key: "Enter" }), false);
});
