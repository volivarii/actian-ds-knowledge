import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import "../setup-dom";
import React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { Theme } from "@radix-ui/themes";
import { ConnectionsSummary } from "../../src/app/connections/ConnectionsSummary";

afterEach(() => cleanup());

test("a guidance file points to its component's connections and lists its own links", () => {
  let went = "";
  render(
    <Theme>
      <ConnectionsSummary
        path="components/src/button/usage.md"
        text="A [table](table) and a [tip](tooltip)."
        onNavigate={(p) => (went = p)}
      />
    </Theme>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open Button's connections" }));
  assert.equal(went, "workspace/button");
  assert.ok(screen.getByRole("button", { name: /^Table/ }));
  assert.ok(screen.getByRole("button", { name: /tooltip.*not in graph/ }));
});

test("an accessibility file lists its sections that have connections, each opening a dialog", () => {
  render(
    <Theme>
      <ConnectionsSummary
        path="accessibility/src/components.md"
        text={"## Buttons {#buttons}\n\n## Modals {#modals}\n\n## Nothing {#not-a-node}\n"}
        onNavigate={() => {}}
      />
    </Theme>,
  );
  assert.ok(!screen.queryByRole("button", { name: /Nothing/ }), "a heading with no graph node gets no button");
  fireEvent.click(screen.getByRole("button", { name: /^Buttons, \d+ connections/ }));
  const dialog = screen.getByRole("dialog");
  assert.ok(within(dialog).getByText("Required by"));
});

test("a file with no graph node renders nothing", () => {
  const { container } = render(
    <Theme>
      <ConnectionsSummary path="accessibility/src/intro.md" text="# Intro" onNavigate={() => {}} />
    </Theme>,
  );
  assert.ok(!container.querySelector(".cx-summary"), "no summary for a file with no graph node");
});
