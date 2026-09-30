"use strict";
// The side-nav and global-header fragments draw their app cells from each app's
// record (app-context/dist/app-context.json, derived from
// app-context/src/apps/<app>.md). A fragment that disagrees with the record is
// the defect this guards: before it, every app's rail read "Catalog, Pipelines,
// Connections, Settings", a list no Actian app has.
//
// Renders through derive-from-renderer.js rather than reading
// components/render/dist/fragments/, so the test judges the renderer on this
// revision and not the dist a later CI step regenerates. The record is read
// from app-context/dist: run `npm run derive:app-context` first after editing
// an app file.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { deriveFragment } = require("../../scripts/render/derive-from-renderer.js");
const ROOT = path.resolve(__dirname, "../..");
const apps = JSON.parse(fs.readFileSync(path.join(ROOT, "app-context/dist/app-context.json"), "utf8")).apps;
const PREFIX = '<div data-render-cell="';

function cells(html) {
  const out = {};
  let i = html.indexOf(PREFIX);
  while (i !== -1) {
    const labelEnd = html.indexOf('"', i + PREFIX.length);
    const label = html.slice(i + PREFIX.length, labelEnd);
    const next = html.indexOf(PREFIX, labelEnd);
    out[label] = html.slice(labelEnd, next === -1 ? html.length : next);
    i = next;
  }
  return out;
}
const labels = (h) => [...h.matchAll(/ds-sidenav__label">([^<]*)/g)].map((m) => m[1]);
const VARIANT = { studio: "Studio", administration: "Admin" };
const sideNav = deriveFragment("side-nav");
const header = deriveFragment("global-header");

// An item with sub-items is drawn expanded by default, as the live product
// and default.webp both draw Import, so its sub-items follow it in the list.
test("each app's side-nav cell shows its record's labels in order, sub-items under their parent", () => {
  const c = cells(sideNav);
  for (const [slug, v] of Object.entries(VARIANT)) {
    const want = apps[slug].sidebar.flatMap((i) => [i.label, ...(i.children || []).map((ch) => ch.label)]);
    assert.ok(c[v], "no " + v + " cell");
    assert.deepEqual(labels(c[v]), want, v);
  }
});

test("no generic default labels anywhere", () => {
  assert.ok(!/Pipelines|Settings/.test(sideNav));
});

test("Studio's bottom block holds the bottom items", () => {
  const studio = cells(sideNav).Studio;
  const bottom = studio.slice(studio.indexOf("ds-sidenav__bottom"));
  assert.deepEqual(labels(bottom), ["Access requests", "Catalog design", "Analytics"]);
});

test("Studio's icons are the record's, and an item without one draws none", () => {
  const studio = cells(sideNav).Studio;
  const withIcon = apps.studio.sidebar.filter((i) => i.icon).length;
  assert.equal((studio.match(/ds-sidenav__icon"><svg/g) || []).length, withIcon);
});

test("Admin's icons are the record's, and an item without one draws none", () => {
  const admin = cells(sideNav).Admin;
  const withIcon = apps.administration.sidebar.filter((i) => i.icon).length;
  assert.ok(withIcon > 0 && withIcon < apps.administration.sidebar.length, "the record should mix items with and without an icon");
  assert.equal((admin.match(/ds-sidenav__icon"><svg/g) || []).length, withIcon);
});

test("New Item is drawn as an action", () => {
  const studio = cells(sideNav).Studio;
  assert.match(studio, /ds-sidenav__item--action[^>]*>(?:(?!<\/a>).)*New Item/);
});

// Sub-items follow their parent while it is expanded, the default, whichever
// item is active (the live Studio, 2026-09-30).
const DS = require("../../components/render/renderer/html-renderers/ds-html-map.js");
// The Studio cell's own Groups (drawn from the record), rendered with an Active.
const studioGroups = require("../../components/render/renderer/matrix.js")
  .variantMatrix("side-nav")
  .find((c) => c.label === "Studio").props.Groups;
function studioRail(active) {
  return DS.renderDSComponent({
    dsSlug: "side-nav",
    variant: "App=Studio",
    props: { Groups: studioGroups, Active: active },
  });
}
test("Import's sub-items are drawn right under it, in the record's order", () => {
  const subs = apps.studio.sidebar.find((it) => it.id === "import").children.map((c) => c.label);
  for (const active of ["Catalog", "Import", "Select a file"]) {
    const html = studioRail(active);
    const at = labels(html);
    const i = at.indexOf("Import");
    assert.deepEqual(at.slice(i, i + 3), ["Import", ...subs], active);
    assert.equal((html.match(/ds-sidenav__item--sub/g) || []).length, 2, active);
  }
  assert.match(studioRail("Select a file"), /ds-sidenav__item--sub is-active"><span class="ds-sidenav__icon"><\/span><span class="ds-sidenav__label">Select a file/);
});

test("Studio's header cell shows the record's context and search", () => {
  const h = cells(header).Studio;
  const { context, search } = apps.studio.header;
  assert.ok(h.includes('context-label">' + context.label + "<"), "context label");
  assert.ok(h.includes('context-value">' + context.value + "<"), "context value");
  assert.ok(h.includes('search-scope-value">' + search.scope + "<"), "search scope");
  assert.ok(h.includes('placeholder="' + search.placeholder + '"'), "search placeholder");
});

test("an app with an empty sidebar gets no side-nav cell", () => {
  assert.equal(apps.explorer.sidebar.length, 0);
  assert.equal(cells(sideNav).Explorer, undefined);
});

// Open or closed is the user's, and it persists across pages: on the live
// Studio (2026-09-30) Import collapsed stayed collapsed on the Dashboard, and
// expanded stayed open on the Catalog, whichever item was active. Expanded is
// the default both the product and components/dist/media/side-nav/default.webp
// draw: a chevron-up at the row's right edge and the sub-items under it.
// Collapsed keeps a chevron, pointing down, and drops the sub-items.
test("an item with sub-items is drawn expanded whatever is active, with the chevron up", () => {
  for (const html of [cells(sideNav).Studio, studioRail("Catalog"), studioRail("Import")]) {
    assert.match(html, /aria-expanded="true"[^>]*>(?:(?!<\/a>).)*Import(?:(?!<\/a>).)*ds-sidenav__chevron/);
    assert.equal((html.match(/ds-sidenav__item--sub/g) || []).length, 2);
  }
});

test("an item the screen marks collapsed keeps a chevron, down, and drops its sub-items", (t) => {
  // Real glyphs, so the two chevrons can differ: the module draws no icon
  // until one is injected.
  DS.setIcons({ "arrow-up": { viewBox: "0 0 16 16", body: '<path d="up"/>' }, "arrow-down": { viewBox: "0 0 16 16", body: '<path d="down"/>' } });
  t.after(() => DS.setIcons(null));
  const up = DS.renderDSComponent({ dsSlug: "side-nav", variant: "App=Studio", props: { Groups: JSON.stringify([{ items: [{ label: "Import", children: [{ label: "Select a file" }] }] }]) } });
  const down = DS.renderDSComponent({ dsSlug: "side-nav", variant: "App=Studio", props: { Groups: JSON.stringify([{ items: [{ label: "Import", expanded: false, children: [{ label: "Select a file" }] }] }]) } });
  const chevron = (h) => h.slice(h.indexOf("ds-sidenav__chevron"), h.indexOf("</a>", h.indexOf("ds-sidenav__chevron")));
  assert.match(down, /aria-expanded="false"[^>]*>(?:(?!<\/a>).)*Import(?:(?!<\/a>).)*ds-sidenav__chevron/);
  assert.ok(!down.includes("Select a file"), "no sub-items when collapsed");
  assert.notEqual(chevron(down), chevron(up), "the collapsed chevron is not the expanded one");
  assert.ok(up.includes("Select a file"));
  assert.match(chevron(down), /d="down"/);
  assert.match(chevron(up), /d="up"/);
});

test("a sub-item's label lines up with its parent's, as the Figma default draws it", () => {
  const css = fs.readFileSync(path.join(ROOT, "components/render/renderer/ds-base.css"), "utf8");
  const rule = /\.ds-sidenav__item--sub\s*\{([^}]*)\}/.exec(css);
  assert.ok(!rule || !/padding/.test(rule[1]), "no extra indent: the empty icon slot already aligns the label");
});

test("a record with two groups and no bottom items keeps both groups at the top", () => {
  const { navGroupsOf } = require("../../components/render/renderer/matrix.js");
  const groups = navGroupsOf([
    { label: "One", id: "one", group: "a" },
    { label: "Two", id: "two", group: "b" },
  ]);
  const html = DS.renderDSComponent({ dsSlug: "side-nav", variant: "App=Admin", props: { Groups: JSON.stringify(groups) } });
  const bottom = html.slice(html.indexOf("ds-sidenav__bottom"));
  assert.deepEqual(labels(bottom), []);
  assert.deepEqual(labels(html), ["One", "Two"]);
});
