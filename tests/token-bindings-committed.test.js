"use strict";
// Guards the REAL committed token-binding sidecars against the committed anatomy:
// every sidecar node-id must be a non-instance anatomy node (the join holds), and
// every binding matches the plugin-consumable shape. Doubles as a staleness guard —
// if a Figma sync changes a node id, the stale sidecar key fails here until re-harvest.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "..", "components", "dist", "token-bindings");
const ANADIR = path.join(__dirname, "..", "components", "dist", "anatomy");

const PROPS = new Set([
  "color",
  "background-color",
  "background",
  "border-color",
  "border-top-color",
  "border-bottom-color",
  "border-width",
  "border-radius",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "font-family",
  "fill",
  "stroke",
  "box-shadow",
  "opacity",
  "padding",
  "padding-block",
  "padding-bottom",
  "padding-inline",
  "padding-left",
  "padding-right",
  "padding-top",
  "gap",
  "row-gap",
  "column-gap",
  "height",
  "width",
]);
const GRADES = new Set(["semantic", "primitive", "literal"]);

function ownNodeIds(root) {
  const s = new Set();
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if (n.kind === "instance") return; // instance boundary: exclude id + descendants
    if (n.id) s.add(n.id);
    (n.children || []).forEach(walk);
  })(root);
  return s;
}

const sidecars = fs.existsSync(DIR)
  ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json"))
  : [];

test("committed token-binding sidecars join the committed anatomy by node-id", () => {
  assert.ok(sidecars.length >= 1, "at least one committed sidecar");
  for (const f of sidecars) {
    const slug = f.replace(/\.json$/, "");
    const sc = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
    const an = JSON.parse(
      fs.readFileSync(path.join(ANADIR, slug + ".json"), "utf8"),
    );
    const own = ownNodeIds(an.root);
    for (const id of Object.keys(sc.byNodeId)) {
      assert.ok(
        own.has(id),
        slug +
          ": sidecar node " +
          id +
          " must be a non-instance anatomy node (join/staleness)",
      );
      for (const b of sc.byNodeId[id]) {
        assert.ok(
          PROPS.has(b.property),
          slug + " " + id + ": property " + b.property,
        );
        assert.match(b.token, /^--zen-/);
        assert.ok(GRADES.has(b.grade), slug + " " + id + ": grade " + b.grade);
        const extra = Object.keys(b).filter(
          (k) => !["property", "token", "grade", "variant"].includes(k),
        );
        assert.deepEqual(
          extra,
          [],
          slug + " " + id + ": unexpected binding keys " + extra,
        );
        if (b.variant) {
          assert.equal(typeof b.variant.prop, "string");
          assert.ok(
            Array.isArray(b.variant.values) && b.variant.values.length >= 1,
          );
        }
      }
    }
  }
});

test("card-for-perimeter committed sidecar carries the card shell facts on the root node", () => {
  const sc = JSON.parse(
    fs.readFileSync(path.join(DIR, "card-for-perimeter.json"), "utf8"),
  );
  const root = sc.byNodeId["14783:7564"];
  assert.ok(Array.isArray(root), "root node 14783:7564 present in the sidecar");
  const byProp = Object.fromEntries(root.map((b) => [b.property, b]));
  assert.deepEqual(byProp["background-color"], {
    property: "background-color",
    token: "--zen-color-bg-default",
    grade: "semantic",
  });
  assert.deepEqual(byProp["padding"], {
    property: "padding",
    token: "--zen-spacing-sm",
    grade: "semantic",
  });
  assert.deepEqual(byProp["border-radius"], {
    property: "border-radius",
    token: "--zen-border-radius-sm",
    grade: "semantic",
  });
});

test("tag-status committed sidecar carries scoped status facts with the default variant last", () => {
  const sc = JSON.parse(
    fs.readFileSync(path.join(DIR, "tag-status.json"), "utf8"),
  );
  assert.deepEqual(sc.variantDefaults, { Status: "Fail" });
  const bgs = sc.byNodeId["7370:4928"].filter(
    (b) => b.property === "background-color",
  );
  assert.ok(bgs.length >= 4, "scoped background facts present");
  assert.deepEqual(
    bgs[bgs.length - 1].variant.values,
    ["Fail"],
    "default variant sorts last (CSS last-wins safety)",
  );
});
