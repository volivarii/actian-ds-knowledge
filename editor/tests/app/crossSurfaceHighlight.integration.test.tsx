// End-to-end composition: a real Preview (with a typed inline link) and a real
// Connections section (with the matching link chip) under one root wired by
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
import { ConnectionsSection } from "../../src/app/connections/ConnectionsSection";
import { buildConnections } from "../../src/lib/connections/build";
import { bakedGraphIndex } from "../../src/substrate/graphIndex";
import { installCrossSurfaceHighlight } from "../../src/lib/crossSurfaceHighlight";

afterEach(() => cleanup());

// Button's guidance links to Table, so its Connections carry a Table chip.
const BUTTON = buildConnections({
  nodeId: "component:button",
  index: bakedGraphIndex(),
  bodies: [{ path: "components/src/button/usage.md", text: "Use it inside a [table](table)." }],
});

function over(el: Element) {
  el.dispatchEvent(new Event("pointerover", { bubbles: true }));
}

test("hovering a preview link to a component lights the matching Connections chip (and clears on leave)", () => {
  const root = document.createElement("div");
  document.body.append(root);
  render(
    <Theme>
      <div>
        <Preview text={"Use it inside a [table](table)."} />
        <ConnectionsSection model={BUTTON} file="components/src/button/_meta.yml" onOpen={() => {}} />
      </div>
    </Theme>,
    { container: root },
  );
  const uninstall = installCrossSurfaceHighlight(root);

  const link = root.querySelector('.md-ref[data-ref="table"]');
  const row = root.querySelector('.cx-chip[data-ref="table"]');
  assert.ok(link, "preview rendered a typed link with data-ref=table");
  assert.ok(row, "Connections rendered a chip with data-ref=table");

  over(link!);
  assert.ok(
    row!.classList.contains("rel-hot"),
    "the Connections chip lights when the inline link is hovered",
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
