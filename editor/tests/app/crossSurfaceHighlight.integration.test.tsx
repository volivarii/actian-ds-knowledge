// End-to-end composition: a real Preview (with a typed inline link) and a real
// RelationsPanel (with the matching graph neighbour) under one root wired by
// installCrossSurfaceHighlight. Guards the contract that both ends emit the
// SAME data-ref (the bare component slug), which is what makes the coordinated
// highlight work and what would silently break if either end changed format.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import { render, cleanup } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import React from "react";
import { Preview } from "../../src/markdown-engine/Preview";
import { RelationsPanel } from "../../src/app/RelationsPanel";
import { installCrossSurfaceHighlight } from "../../src/lib/crossSurfaceHighlight";
import type { Neighbor } from "../../src/lib/referenceIndex";

afterEach(() => cleanup());

const TABLE_NEIGHBOR: Neighbor = {
  id: "component:table",
  node: { id: "component:table", type: "component", title: "Table" },
  edgeType: "composed_of",
  note: null,
  direction: "in",
};

function over(el: Element) {
  el.dispatchEvent(new Event("pointerover", { bubbles: true }));
}

test("hovering a preview link to a component lights the matching relations-rail row (and clears on leave)", () => {
  const root = document.createElement("div");
  document.body.append(root);
  render(
    <Theme>
      <div>
        <Preview text={"Use it inside a [table](table)."} />
        <RelationsPanel
          text={"## Usage {#usage}\n\nBody.\n"}
          file="components/src/button/content.md"
          counts={new Map()}
          incoming={[]}
          outgoing={[]}
          graphNeighbors={[TABLE_NEIGHBOR]}
          onNavigate={() => {}}
          onOpenFile={() => {}}
          collapsed={false}
          onToggleCollapsed={() => {}}
        />
      </div>
    </Theme>,
    { container: root },
  );
  const uninstall = installCrossSurfaceHighlight(root);

  const link = root.querySelector('.md-ref[data-ref="table"]');
  const row = root.querySelector('[data-testid="graph-row"][data-ref="table"]');
  assert.ok(link, "preview rendered a typed link with data-ref=table");
  assert.ok(row, "rail rendered a graph row with data-ref=table");

  over(link!);
  assert.ok(
    row!.classList.contains("rel-hot"),
    "the rail row lights when the inline link is hovered",
  );
  assert.ok(
    link!.classList.contains("rel-hot"),
    "the inline link lights too (both share the ref)",
  );

  // moving onto plain prose clears both
  over(root.querySelector(".md-prose")!);
  assert.ok(!row!.classList.contains("rel-hot"));
  assert.ok(!link!.classList.contains("rel-hot"));

  uninstall();
  document.body.removeChild(root);
});
