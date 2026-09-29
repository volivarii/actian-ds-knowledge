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

test("each app's side-nav cell shows its record's labels, children included, in order", () => {
  const c = cells(sideNav);
  for (const [slug, v] of Object.entries(VARIANT)) {
    const want = [];
    for (const i of apps[slug].sidebar) {
      want.push(i.label);
      for (const ch of i.children || []) want.push(ch.label);
    }
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

test("Admin's record names no icons, so its cell draws none", () => {
  assert.ok(apps.administration.sidebar.every((i) => !i.icon));
  assert.ok(!/ds-sidenav__icon"><svg/.test(cells(sideNav).Admin));
});

test("New Item is drawn as an action and Import's sub-items as sub-items", () => {
  const studio = cells(sideNav).Studio;
  assert.match(studio, /ds-sidenav__item--action[^>]*>(?:(?!<\/a>).)*New Item/);
  assert.equal((studio.match(/ds-sidenav__item--sub/g) || []).length, 2);
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
