"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const harvest = require("../scripts/components/harvest-token-bindings");

test("run() writes a validated sidecar for card-for-perimeter", () => {
  const cap = fs.mkdtempSync(path.join(os.tmpdir(), "cap-"));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "out-"));
  fs.copyFileSync(
    __dirname + "/fixtures/card-for-perimeter.design-context.txt",
    path.join(cap, "card-for-perimeter.design-context.txt"),
  );
  // minimal anatomy fixture: own root container + one nested instance (proves
  // the own-node intersection excludes instances)
  const anat = fs.mkdtempSync(path.join(os.tmpdir(), "anat-"));
  fs.writeFileSync(
    path.join(anat, "card-for-perimeter.json"),
    JSON.stringify({
      slug: "card-for-perimeter",
      root: {
        id: "14783:7564",
        kind: "container",
        children: [{ id: "14783:7552", kind: "instance" }],
      },
    }),
  );
  harvest.run({
    captureDir: cap,
    tokensPath: __dirname + "/../tokens/tokens.json",
    anatomyDir: anat,
    outDir: out,
    slugs: ["card-for-perimeter"],
    harvestedAt: "2026-07-01T00:00:00Z",
  });
  const doc = JSON.parse(
    fs.readFileSync(path.join(out, "card-for-perimeter.json"), "utf8"),
  );
  assert.equal(doc.slug, "card-for-perimeter");
  assert.deepEqual(doc.byNodeId["14783:7564"][0], {
    property: "background-color",
    token: "--zen-color-bg-default",
    grade: "semantic",
  });
  const paddingBinding = doc.byNodeId["14783:7564"].find(
    (b) => b.property === "padding",
  );
  assert.deepEqual(paddingBinding, {
    property: "padding",
    token: "--zen-spacing-sm",
    grade: "semantic",
  }); // proves spacing is harvested, not dropped by the schema-property workaround
  assert.equal(doc.byNodeId["14783:7552"], undefined); // nested instance (Digram, blue/50) excluded by the anatomy join
  assert.ok(fs.existsSync(path.join(out, "coverage.md")));
});

test("collectOwnNodeIds stops at instance boundaries even when an instance (unexpectedly) carries children", () => {
  // Anatomy convention says instances have no children, but that is not
  // schema-enforced. Build a tree where instance B *does* carry a child
  // container C with its own id, and prove C's id never enters the
  // own-node set (defense-in-depth: exclusion must not rely on the
  // "instances have no children" convention).
  const anatomy = {
    slug: "instance-boundary-guard",
    root: {
      id: "A1:1",
      kind: "container",
      children: [
        {
          id: "A1:2",
          kind: "instance",
          children: [{ id: "A1:3", kind: "container" }],
        },
      ],
    },
  };
  const ownIds = harvest.collectOwnNodeIds(anatomy.root, new Set());
  assert.ok(ownIds.has("A1:1")); // root container: own node
  assert.equal(ownIds.has("A1:2"), false); // instance itself: excluded
  assert.equal(ownIds.has("A1:3"), false); // nested under instance: excluded even though it carries an id

  // End-to-end: prove the same guard holds through run(), where a captured
  // design-context binding exists on C's id but must not survive the
  // anatomy join because its ancestor is an instance.
  const cap = fs.mkdtempSync(path.join(os.tmpdir(), "cap-"));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "out-"));
  const anat = fs.mkdtempSync(path.join(os.tmpdir(), "anat-"));
  fs.writeFileSync(
    path.join(cap, "instance-boundary-guard.design-context.txt"),
    [
      '<div className="bg-[var(--color-bg-default,white)]" data-node-id="A1:1">',
      '  <div className="bg-[var(--blue/50,#cfeafd)]" data-node-id="A1:2">',
      '    <div className="bg-[var(--color-bg-sunken,#e1e1e6)]" data-node-id="A1:3" />',
      "  </div>",
      "</div>",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(anat, "instance-boundary-guard.json"),
    JSON.stringify(anatomy),
  );
  harvest.run({
    captureDir: cap,
    tokensPath: __dirname + "/../tokens/tokens.json",
    anatomyDir: anat,
    outDir: out,
    slugs: ["instance-boundary-guard"],
    harvestedAt: "2026-07-01T00:00:00Z",
  });
  const doc = JSON.parse(
    fs.readFileSync(path.join(out, "instance-boundary-guard.json"), "utf8"),
  );
  assert.ok(doc.byNodeId["A1:1"]); // own root binding harvested
  assert.equal(doc.byNodeId["A1:2"], undefined); // instance itself excluded
  assert.equal(doc.byNodeId["A1:3"], undefined); // nested under instance: must be excluded despite a real captured binding
});

test("run() skips a slug gracefully when anatomy is missing (no throw, no sidecar, coverage still written)", () => {
  const cap = fs.mkdtempSync(path.join(os.tmpdir(), "cap-"));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "out-"));
  const anat = fs.mkdtempSync(path.join(os.tmpdir(), "anat-"));
  fs.copyFileSync(
    __dirname + "/fixtures/card-for-perimeter.design-context.txt",
    path.join(cap, "card-for-perimeter.design-context.txt"),
  );
  // No anatomy file written for this slug.
  harvest.run({
    captureDir: cap,
    tokensPath: __dirname + "/../tokens/tokens.json",
    anatomyDir: anat,
    outDir: out,
    slugs: ["card-for-perimeter"],
    harvestedAt: "2026-07-01T00:00:00Z",
  });
  assert.equal(fs.existsSync(path.join(out, "card-for-perimeter.json")), false);
  assert.ok(fs.existsSync(path.join(out, "coverage.md")));
});
