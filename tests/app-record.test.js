"use strict";
// The app record (app-context/src/apps/<app>.md) is the one record of each
// app's chrome. Studio's side navigation must equal the Figma anatomy, with the
// product screenshot winning where the two disagree (contract of 2026-09-29).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { splitFrontmatter } = require("../scripts/app-context/lib.js");
const ROOT = path.resolve(__dirname, "..");
const yaml = (f) => splitFrontmatter(fs.readFileSync(path.join(ROOT, f), "utf8")).data;
const icons = Object.keys(
  JSON.parse(fs.readFileSync(path.join(ROOT, "components/dist/icons/icons.json"), "utf8")).icons,
);

// The screenshot wins where it and the Figma anatomy disagree (contract). Each override is named,
// so a new disagreement fails instead of passing.
const SCREENSHOT_WINS = { "Access request": "Access requests", "New item": "New Item" };

function anatomyNav() {
  const a = JSON.parse(fs.readFileSync(path.join(ROOT, "components/dist/anatomy/side-nav.json"), "utf8"));
  const top = [];
  a.root.children.forEach((g) =>
    (g.children || []).forEach((n) => {
      if (n.name !== "nav item" || !n.props || !n.props.Name) return;
      const label = SCREENSHOT_WINS[n.props.Name] || n.props.Name;
      if (n.props.Level === "Sub") top[top.length - 1].children.push(label);
      else top.push({ label, children: [] });
    }),
  );
  return top;
}

test("Studio's sidebar equals the anatomy, screenshot overrides applied", () => {
  const s = yaml("app-context/src/apps/studio.md").sidebar;
  assert.deepEqual(
    s.map((i) => ({ label: i.label, children: (i.children || []).map((c) => c.label) })),
    anatomyNav(),
  );
});

test("every sidebar icon exists in icons.json", () => {
  for (const f of fs.readdirSync(path.join(ROOT, "app-context/src/apps"))) {
    for (const i of yaml("app-context/src/apps/" + f).sidebar || []) {
      if (i.icon) assert.ok(icons.includes(i.icon), f + ": unknown icon " + i.icon);
    }
  }
});

test("Studio's bottom block is Access requests, Catalog design, Analytics", () => {
  const s = yaml("app-context/src/apps/studio.md").sidebar;
  assert.deepEqual(
    s.filter((i) => i.position === "bottom").map((i) => i.label),
    ["Access requests", "Catalog design", "Analytics"],
  );
});

test("Studio's header carries context and search", () => {
  const h = yaml("app-context/src/apps/studio.md").header;
  assert.deepEqual(h.context, { label: "Catalog", value: "Default" });
  assert.equal(h.search.placeholder, "Search your items...");
});
