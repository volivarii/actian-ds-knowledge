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
  assert.equal(doc.byNodeId["14783:7552"], undefined); // nested instance (Digram, blue/50) excluded by the anatomy join
  assert.ok(fs.existsSync(path.join(out, "coverage.md")));
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
