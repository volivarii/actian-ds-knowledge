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

test("closing the picker gives focus back to the button that opened it", () => {
  render(
    <Theme>
      <ConnectionsSection model={model()} file="p.md" onOpen={() => {}} onEdit={() => {}} />
    </Theme>,
  );
  const lane = screen.getByRole("group", { name: "Built from" });
  const add = within(lane).getByRole("button", { name: "+ Add" });
  add.focus();
  fireEvent.click(add);
  fireEvent.keyDown(screen.getByRole("combobox", { name: /Find a component/ }), { key: "Escape" });
  assert.ok(document.activeElement === add, `focus went to ${document.activeElement?.tagName}`);
});

test("removing an added chip with Delete keeps focus in the section", () => {
  function Live() {
    const [live, setLive] = React.useState<Record<string, string[]>>({ apps: ["studio"], components: ["tabs", "avatar"] });
    return (
      <ConnectionsSection
        model={model(live)}
        file="p.md"
        onOpen={() => {}}
        onEdit={(es) =>
          setLive((l) => {
            const next = { ...l };
            for (const e of es)
              next[e.field[0]!] =
                e.op === "remove" ? next[e.field[0]!]!.filter((s) => s !== e.slug) : [...next[e.field[0]!]!, e.slug];
            return next;
          })
        }
      />
    );
  }
  render(
    <Theme>
      <Live />
    </Theme>,
  );
  const chip = screen.getByRole("button", { name: /^Avatar/ });
  chip.focus();
  fireEvent.keyDown(chip, { key: "Delete" });
  assert.ok(!screen.queryByRole("button", { name: /^Avatar/ }), "the added chip is gone");
  const section = screen.getByRole("region", { name: "Connections" });
  assert.ok(section.contains(document.activeElement), `focus went to ${document.activeElement?.tagName}`);
});

test("Enter in the picker search never submits the form around the section", () => {
  render(
    <Theme>
      <ConnectionsSection model={model()} file="p.md" onOpen={() => {}} onEdit={() => {}} />
    </Theme>,
  );
  fireEvent.click(screen.getByRole("button", { name: "+ Connect" }));
  fireEvent.click(within(screen.getByRole("region", { name: "Connect" })).getByRole("button", { name: /Built from/ }));
  const box = screen.getByRole("combobox", { name: /Find a component/ });
  fireEvent.change(box, { target: { value: "zzzz-no-match" } });
  assert.equal(fireEvent.keyDown(box, { key: "Enter" }), false, "Enter was not prevented");
});

test("a ref's note is shown in the panel and saved when the box loses focus", () => {
  const v = { a11y_refs: ["modals"] };
  const m = buildConnections({
    nodeId: "component:drawer",
    index: bakedGraphIndex(),
    original: v,
    live: v,
    notes: { "a11y_refs|modals": "non-modal variant does not trap focus" },
  });
  const notes: Array<[string[], string, string]> = [];
  render(
    <Theme>
      <ConnectionsSection
        model={m}
        file="_meta.yml"
        onOpen={() => {}}
        onEdit={() => {}}
        onNote={(f, s, n) => notes.push([f, s, n])}
      />
    </Theme>,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Modals/ }));
  const box = screen.getByRole("textbox", { name: "Note" }) as HTMLTextAreaElement;
  assert.equal(box.value, "non-modal variant does not trap focus");
  fireEvent.change(box, { target: { value: "non-modal variant does not trap focus; Esc closes" } });
  fireEvent.blur(box);
  assert.deepEqual(notes, [[["a11y_refs"], "modals", "non-modal variant does not trap focus; Esc closes"]]);
});
