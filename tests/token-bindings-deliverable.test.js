"use strict";
// DELIVERABLE gate (anti-inert): run the real harvest driver end-to-end over the
// captured card-for-perimeter design-context + the card's full own-node anatomy,
// and prove the card SHELL render facts land on the rendered variant slug, that
// nested instances (and their primitive leaks) are excluded, and that every
// emitted binding matches the shape the plugin seam consumes.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const harvest = require("../scripts/components/harvest-token-bindings");

// Own-node ids from the real card-for-perimeter design-context. Nested instances
// 14783:7552 (Digram, --blue/50 leak) and 14783:7557 (Progress bar small,
// --primary/400 leak) are kind:instance → excluded by the anatomy join.
const CARD_ANATOMY = {
  slug: "card-for-perimeter",
  root: {
    id: "14783:7564",
    kind: "container",
    children: [
      { id: "14783:7552", kind: "instance" },
      {
        id: "14783:7553",
        kind: "container",
        children: [
          {
            id: "14783:7554",
            kind: "container",
            children: [
              { id: "14783:7555", kind: "text" },
              { id: "14783:7556", kind: "text" },
            ],
          },
          { id: "14783:7557", kind: "instance" },
        ],
      },
    ],
  },
};

const PROPS = new Set([
  "color", "background-color", "background", "border-color", "border-top-color",
  "border-bottom-color", "border-width", "border-radius", "font-size", "font-weight",
  "line-height", "letter-spacing", "font-family", "fill", "stroke", "box-shadow",
  "opacity", "padding", "padding-block", "padding-bottom", "padding-inline",
  "padding-left", "padding-right", "padding-top", "gap", "row-gap", "column-gap",
]);
const GRADES = new Set(["semantic", "primitive", "literal"]);

test("DELIVERABLE: card-for-perimeter harvest yields the plugin-consumable render-grade shape on the rendered slug", () => {
  const cap = fs.mkdtempSync(path.join(os.tmpdir(), "cap-"));
  const anat = fs.mkdtempSync(path.join(os.tmpdir(), "anat-"));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "out-"));
  fs.copyFileSync(
    path.join(__dirname, "fixtures", "card-for-perimeter.design-context.txt"),
    path.join(cap, "card-for-perimeter.design-context.txt"),
  );
  fs.writeFileSync(path.join(anat, "card-for-perimeter.json"), JSON.stringify(CARD_ANATOMY));

  harvest.run({
    captureDir: cap,
    tokensPath: path.join(__dirname, "..", "tokens", "tokens.json"),
    anatomyDir: anat,
    outDir: out,
    slugs: ["card-for-perimeter"],
    harvestedAt: "2026-07-01T00:00:00Z",
  });
  const doc = JSON.parse(fs.readFileSync(path.join(out, "card-for-perimeter.json"), "utf8"));

  // 1) The card SHELL facts land on the rendered variant slug's ROOT node (the anti-inert core).
  assert.deepEqual(doc.byNodeId["14783:7564"], [
    { property: "background-color", token: "--zen-color-bg-default", grade: "semantic" },
    { property: "border-radius", token: "--zen-border-radius-sm", grade: "semantic" },
    { property: "padding", token: "--zen-spacing-sm", grade: "semantic" },
  ]);

  // 2) Nested instances (and their primitive leaks) are excluded by the anatomy join.
  assert.equal(doc.byNodeId["14783:7552"], undefined);
  assert.equal(doc.byNodeId["14783:7557"], undefined);

  // 3) Contract shape the plugin seam consumes: every binding is {property in enum, token ^--zen-, grade in enum}.
  let total = 0;
  for (const id of Object.keys(doc.byNodeId)) {
    for (const b of doc.byNodeId[id]) {
      total++;
      assert.ok(PROPS.has(b.property), "property in enum: " + b.property);
      assert.ok(/^--zen-/.test(b.token), "token --zen-: " + b.token);
      assert.ok(GRADES.has(b.grade), "grade in enum: " + b.grade);
    }
  }
  assert.ok(total >= 3, "at least the 3 root shell bindings present");

  // 4) Provenance stamp is honest (agent-run MCP source).
  assert.equal(doc._meta.source, "figma-mcp:get_design_context");
  assert.equal(doc._meta.auto_generated, true);
});
