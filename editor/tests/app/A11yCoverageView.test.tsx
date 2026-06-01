import "../setup-dom";
import test from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { A11yCoverageView } from "../../src/app/A11yCoverageView";
import type { TopicCoverage, ThinComponent } from "../../src/lib/a11yCoverage";

const topics: TopicCoverage[] = [
  { slug: "drag-drop", title: "Drag & Drop", componentHosts: [], categoryHosts: [], state: "orphan" },
  { slug: "tabs", title: "Tabs", componentHosts: [], categoryHosts: ["navigation"], state: "category-only" },
  { slug: "modals", title: "Modals", componentHosts: [{ slug: "modal", name: "Modal" }], categoryHosts: [], state: "single-host" },
  { slug: "buttons", title: "Buttons", componentHosts: [{ slug: "button", name: "Button" }, { slug: "sticky-footer", name: "Sticky footer" }], categoryHosts: [], state: "well-hosted" },
];
const thin: ThinComponent[] = [{ slug: "link", component: "Link" }];

test("renders topic titles and a host chip, navigates on click", () => {
  cleanup();
  const opened: string[] = [];
  render(<A11yCoverageView topics={topics} thin={thin} onOpenFile={(p) => opened.push(p)} />);
  assert.ok(screen.queryByText("Buttons"));
  assert.ok(screen.queryByText("Drag & Drop"));
  fireEvent.click(screen.getByText("Modal"));
  assert.deepEqual(opened, ["components/src/modal/_meta.yml"]);
});

test("renders the thin-components worklist and navigates", () => {
  cleanup();
  const opened: string[] = [];
  render(<A11yCoverageView topics={topics} thin={thin} onOpenFile={(p) => opened.push(p)} />);
  assert.ok(screen.queryByText(/no a11y topics yet/i));
  fireEvent.click(screen.getByText("Link"));
  assert.deepEqual(opened, ["components/src/link/_meta.yml"]);
});
