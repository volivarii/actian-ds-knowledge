"use strict";
// Studio's versions of the search result card and the drawer, as Studio draws
// them. Before this, both fragments' Studio cells were Explorer's: a Studio
// page drew the checkbox, the Shared tag, completion and last updated BESIDE a
// bordered Explorer box (#722), a drawer at 420px with an Overview / Lineage /
// Quality strip no app has (#708), and an authored empty description printed
// the Figma specimen's sentence (#717).
//
// Sources: app-context/src/recipes/captures/faceted-browse.png (Studio's
// Catalog rows), the Figma component's App=Studio parts listed in #722, and
// the two drawer recipes (right-sliding-drawer for Explorer,
// studio-quick-edit-drawer for Studio): both 550px wide, Studio's tabs General,
// Properties, People, Suggestions, Studio's header two icon buttons and
// Explorer's three.
//
// Renders through derive-from-renderer.js and reads ds-base.css, so the test
// judges the renderer on this revision, not a dist a later CI step regenerates.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { deriveFragment } = require("../../scripts/render/derive-from-renderer.js");
const DS = require("../../components/render/renderer/html-renderers/ds-html-map.js");
const ROOT = path.resolve(__dirname, "../..");
const CSS = fs.readFileSync(path.join(ROOT, "components/render/renderer/ds-base.css"), "utf8");
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
const rule = (sel) => {
  const m = CSS.match(new RegExp("(^|\\n)" + sel.replace(/[.\-]/g, "\\$&") + "\\s*\\{([^}]*)\\}"));
  return m ? m[2].replace(/\/\*[\s\S]*?\*\//g, "") : null;
};
const card = (props, variant) =>
  DS.renderDSComponent({ dsSlug: "search-result-card", variant: variant || "App=Studio, State=Default", props });
const drawer = (variant, props) => DS.renderDSComponent({ dsSlug: "drawer", variant, props: props || {} });

// ── search result card ─────────────────────────────────────────────────────

test("a Studio search result card keeps checkbox, Shared, completion and last updated inside the card", () => {
  const c = cells(deriveFragment("search-result-card")).Studio;
  assert.ok(c, "no Studio cell");
  const inCard = c.slice(c.indexOf("ds-search-result-card"));
  for (const part of ["ds-checkbox", "ds-search-result-card__shared", "ds-progress", "Last updated"]) assert.ok(inCard.includes(part), part);
});

test("the Studio card carries each part Figma's App=Studio has: connection, property chips, suggestion chip", () => {
  const c = cells(deriveFragment("search-result-card")).Studio;
  for (const cls of ["ds-search-result-card__connection", "ds-search-result-card__chip", "ds-search-result-card__suggestion"]) {
    assert.ok(c.includes(cls), cls);
  }
});

test("the gallery carries a Studio Selected cell beside Explorer's two", () => {
  const c = cells(deriveFragment("search-result-card"));
  assert.deepEqual(Object.keys(c), ["Default", "Selected", "Studio", "Studio selected"]);
  assert.match(c["Studio selected"], /ds-search-result-card--studio ds-search-result-card--selected/);
});

test("the Studio card is a flat row closed by a bottom rule, filling its width", () => {
  const r = rule(".ds-search-result-card--studio");
  assert.ok(r, "no --studio rule");
  assert.match(r, /border:\s*0/);
  assert.match(r, /border-bottom:\s*1px solid/);
  assert.match(r, /border-radius:\s*0/);
  assert.match(r, /width:\s*100%/);
});

test("an empty description prints the product's words, not a specimen sentence", () => {
  const html = card({ Title: "Business Rule Quality", Description: "" });
  assert.ok(html.includes("No summary available"));
  assert.ok(!html.includes("A product is anything"));
});

test("an authored empty text prop renders empty on Explorer too (#717)", () => {
  const html = card({ Title: "T", Description: "", Catalog: "" }, "App=Explorer, State=Default");
  assert.ok(!html.includes("A product is anything"), "specimen description");
  assert.ok(!html.includes('ds-search-result-card__desc'), "empty description draws no paragraph");
  assert.ok(!/ds-search-result-card__catalog">Catalog</.test(html), "specimen catalog");
});

test("Studio's optional parts are omitted when the screen gives none", () => {
  const html = card({ Title: "T" });
  for (const cls of ["__connection", "__chip", "__suggestion", "__updated"]) assert.ok(!html.includes("ds-search-result-card" + cls), cls);
});

test("Studio's completion clamps to 0..100 and a hostile value cannot reach the markup", () => {
  assert.match(card({ Completion: 140 }), /aria-valuenow="100"/);
  const h = card({ Title: "<img src=x>", Properties: "Code: <b>", Completion: "x\" onload=\"y" });
  assert.ok(!/<img src=x|<b>|onload=/.test(h));
});

// Studio's live Catalog (manufacturing.zeenea.app, 2026-09-30) draws a
// lifecycle stage pill left of the completion bar ("In Review", "Approved",
// "Not staged") and a "Data Product: <name> / Connection: <name>" line. The
// stage is the tenant's own word, so the screen passes its label and the
// design system hue it maps to (read-only-tag's Stage-1..8), never a name the
// renderer maps itself.
test("a Studio card draws its lifecycle stage as a read-only stage tag, left of the completion", () => {
  const html = card({ Title: "T", Stage: "In Review", "Stage type": "Stage-6", Completion: 100 });
  assert.match(html, /<span class="ds-tag ds-tag--stage-6 ds-tag-stage ds-search-result-card__stage"><span class="ds-tag-stage__dot"><\/span>In Review<\/span>/);
  assert.ok(html.indexOf("ds-search-result-card__stage") < html.indexOf("ds-search-result-card__progress"), "stage before completion");
});

test("a Studio stage with no type is the base stage tag, and no stage draws nothing", () => {
  assert.match(card({ Stage: "Not staged" }), /class="ds-tag ds-tag--stage-1 ds-tag-stage ds-search-result-card__stage"/);
  assert.ok(!card({ Title: "T" }).includes("ds-search-result-card__stage"));
  assert.ok(!/onload|<b>/.test(card({ Stage: "<b>", "Stage type": 'x" onload="y' })));
  assert.match(card({ Stage: "S", "Stage type": 'x" onload="y' }), /ds-tag--stage-1 /, "a malformed type falls back to Stage-1");
});

test("a Studio card's source line names the data product, then the connection", () => {
  const html = card({ Title: "T", "Data product": "removal", Connection: "connPowerBI" });
  assert.match(
    html,
    /<p class="ds-search-result-card__connection">Data Product: <span class="ds-search-result-card__link">removal<\/span> \/ Connection: <span class="ds-search-result-card__link">connPowerBI<\/span><\/p>/,
  );
  assert.match(card({ "Data product": "Customers" }), /__connection">Data Product: <span class="ds-search-result-card__link">Customers<\/span><\/p>/);
});

// An icon-only button drew `add` whatever it stood for, so a drawer header
// built from buttons showed a plus where the product shows open-in-full-page
// and close. `Icon` names the glyph (an icons.json slug); without it the
// captured default `add` stays.
test("an icon-only button draws the glyph its Icon names, add by default", (t) => {
  DS.setIcons({ add: { viewBox: "0 0 16 16", body: '<path d="add"/>' }, close: { viewBox: "0 0 16 16", body: '<path d="close"/>' } });
  t.after(() => DS.setIcons(null));
  const b = (props) => DS.renderDSComponent({ dsSlug: "button", variant: "Emphasis=Icon-only", props });
  assert.match(b({ Label: "Close", Icon: "close" }), /aria-label="Close"[\s\S]*d="close"/);
  assert.match(b({ Label: "Add" }), /d="add"/);
  assert.match(b({ Label: "X", Icon: "no-such-icon" }), /d="add"/, "an unknown slug falls back to the captured default");
  assert.ok(!/onload/.test(b({ Label: "X", Icon: '"><img onload=x>' })));
});

// ── drawer ─────────────────────────────────────────────────────────────────

test("the Studio drawer is 550 wide and has no fixed Overview/Lineage/Quality strip", () => {
  assert.match(rule(".ds-drawer"), /width:\s*550px/);
  const d = cells(deriveFragment("drawer")).Studio;
  assert.ok(d, "no Studio cell");
  assert.ok(!/Overview[\s\S]*Lineage[\s\S]*Quality/.test(d));
});

test("the drawer's tabs come from props.Tabs, the first active, and none are drawn without it", () => {
  const d = cells(deriveFragment("drawer")).Studio;
  const tabs = [...d.matchAll(/role="tab"[^>]*>([^<]*)/g)].map((m) => m[1]);
  assert.deepEqual(tabs, ["General", "Properties", "People", "Suggestions"]);
  assert.match(d, /aria-selected="true">General</);
  assert.ok(!drawer("App=Studio").includes('role="tablist"'));
});

test("a Content prop fills the drawer's panel", () => {
  const html = drawer("App=Studio", { Content: "Checklist before publishing" });
  assert.match(html, /ds-drawer__panel[^>]*>Checklist before publishing</);
  assert.ok(!drawer("App=Studio").includes("ds-drawer__panel"));
});

test("Studio's drawer header has open-in-full-page and close; Explorer's adds favourite", () => {
  const names = (h) => [...h.slice(h.indexOf("ds-drawer__actions")).matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names(drawer("App=Studio")), ["Open in full page", "Close"]);
  assert.deepEqual(names(drawer("App=Explorer")), ["Add to favorites", "Open in full page", "Close"]);
});

// The render contract lists a leaf's props by reading literal `props.X` in its
// case block, and the consumers (the plugin, the Claude Design bundle, the
// empty-slot and omission gates) read the contract. A prop read through a
// variable key vanishes from all of them with nothing failing.
test("the render contract lists every prop the card reads, with the defaults it states", () => {
  const { deriveContract } = require("../../scripts/render/derive-contract.js");
  const props = Object.fromEntries(
    deriveContract().slugs["search-result-card"].props.map((p) => [p.name, p.default]),
  );
  for (const name of ["Title", "Tech name", "Type", "Catalog", "Description", "Body", "Connection", "Suggestion", "Last updated", "Completion", "Properties", "Shared", "Stage", "Stage type", "Data product"]) {
    assert.ok(name in props, name);
  }
  assert.equal(props.Title, "Financial Summary EY2024");
  assert.equal(props.Type, "Category");
  assert.equal(props.Catalog, "Catalog");
  assert.match(props.Description, /^A product is anything/);
  assert.equal(props.Body, undefined, "Body is an alias: the default belongs to the chain's head");
});

// --studio resets the border after --focus in the file, so Focus needs a rule
// of its own on the pair or it draws exactly as Default (no visible focus).
test("Studio's Focus state draws a visible ring", () => {
  const r = rule(".ds-search-result-card--studio.ds-search-result-card--focus");
  assert.ok(r, "no Studio focus rule");
  assert.match(r, /--zen-focus-ring-primary/);
});
