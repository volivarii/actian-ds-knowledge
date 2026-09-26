import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import React from "react";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { bakedGraphIndex } from "../../src/substrate/graphIndex";
import { buildConnections } from "../../src/lib/connections/build";
import { ConnectionsSection } from "../../src/app/connections/ConnectionsSection";
import { VERBS } from "../../src/lib/connections/vocabulary";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");
afterEach(() => {
  cleanup();
  globalThis.localStorage.clear();
});

test("the relations rail is the outline only; connections live in one section", () => {
  const src = readFileSync(join(SRC, "app", "RelationsPanel.tsx"), "utf8");
  for (const gone of ["Referenced by", "In the graph", "GraphView", "onManageConnections", "neighborhoodLayout"])
    assert.ok(!src.includes(gone), `RelationsPanel still has ${gone}`);
  for (const f of ["ConnectionsPopover", "SectionInspector", "TopicPicker", "NeighborhoodPanel"])
    assert.ok(!existsSync(join(SRC, "app", `${f}.tsx`)), `${f}.tsx still exists`);
  for (const screenFile of ["MarkdownEditScreen.tsx", "FrontmatterBodyEditScreen.tsx"]) {
    const s = readFileSync(join(SRC, "app", screenFile), "utf8");
    for (const gone of ["ConnectionsPopover", "neighborhoodLayout", "graphNeighborsForFile"])
      assert.ok(!s.includes(gone), `${screenFile} still uses ${gone}`);
  }
});

const FORBIDDEN = [
  "a11y_refs",
  "motion_refs",
  "foundations_refs",
  "relatedComponents",
  "frontmatter",
  "composed_of",
  "in_category",
  "uses_component",
  "entity_related",
  "shown_in",
  "term_about",
  "in_app",
  // The camelCase verb keys; the one-word ones (contains, uses) are English.
  ...VERBS.filter((v) => /[A-Z]/.test(v)),
];

test("the Connections section shows an author no field names, edge types or verb keys", () => {
  const cases = [
    { nodeId: "component:button" },
    { nodeId: "entity:catalog-object", original: { "relationships.contains": ["metadata"] }, live: { "relationships.contains": ["metadata"] } },
    { nodeId: "pattern:asset-detail-360" },
    { nodeId: "category:action" },
  ];
  for (const c of cases) {
    const m = buildConnections({ index: bakedGraphIndex(), ...c });
    for (const view of ["Map", "List"]) {
      const { container, unmount } = render(
        <Theme>
          <ConnectionsSection model={m} file="x.md" onOpen={() => {}} onEdit={() => {}} />
        </Theme>,
      );
      fireEvent.click(screen.getByRole("button", { name: view }));
      // Open the panel on the first link too, so its sentence is checked.
      fireEvent.click(container.querySelector(".cx-chip")!);
      const txt = container.textContent ?? "";
      for (const token of FORBIDDEN)
        assert.ok(!new RegExp(`\\b${token}\\b`).test(txt), `${c.nodeId} (${view}) shows "${token}"`);
      unmount();
    }
  }
});
