"use strict";
// DELIVERABLE gate for the variant-set shape: run the REAL harvest driver over
// the REAL captured tag-status set codegen + the REAL committed anatomy dist,
// and prove variant-scoped render facts land on the rendered slug with the
// defensive ordering a variant-UNAWARE consumer needs (default variant last).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const harvest = require("../scripts/components/harvest-token-bindings");

test("DELIVERABLE: tag-status set harvest yields scoped render facts on the anatomy root", () => {
  const cap = fs.mkdtempSync(path.join(os.tmpdir(), "cap-"));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "out-"));
  fs.copyFileSync(
    path.join(__dirname, "fixtures", "tag-status.design-context.txt"),
    path.join(cap, "tag-status.design-context.txt"),
  );

  const res = harvest.run({
    captureDir: cap,
    tokensPath: path.join(__dirname, "..", "tokens", "tokens.json"),
    anatomyDir: path.join(__dirname, "..", "components", "dist", "anatomy"), // REAL anatomy
    outDir: out,
    slugs: ["tag-status"],
    harvestedAt: "2026-07-02T00:00:00Z",
  });
  assert.deepEqual(res.skipped, []);
  const doc = JSON.parse(fs.readFileSync(path.join(out, "tag-status.json"), "utf8"));

  // 1) Canonical axis + default from the set codegen.
  assert.deepEqual(doc.variantDefaults, { Status: "Fail" });

  // 2) Unscoped base facts on the anatomy root 7370:4928.
  const root = doc.byNodeId["7370:4928"];
  assert.ok(Array.isArray(root), "anatomy root present");
  const unscoped = Object.fromEntries(root.filter((b) => !b.variant).map((b) => [b.property, b]));
  assert.deepEqual(unscoped["border-width"], { property: "border-width", token: "--zen-border-width-md", grade: "semantic" });
  assert.deepEqual(unscoped["gap"], { property: "gap", token: "--zen-spacing-2xs", grade: "semantic" });
  assert.deepEqual(unscoped["padding-inline"], { property: "padding-inline", token: "--zen-spacing-xs", grade: "semantic" });
  assert.deepEqual(unscoped["border-radius"], { property: "border-radius", token: "--zen-border-radius-xs", grade: "semantic" });
  assert.deepEqual(unscoped["height"], { property: "height", token: "--zen-lg", grade: "primitive" }); // known leak, overlay later

  // 3) Variant-scoped background facts, defensive ordering (default LAST).
  const bgs = root.filter((b) => b.property === "background-color");
  assert.equal(bgs.length, 5);
  const byToken = Object.fromEntries(bgs.map((b) => [b.token, b]));
  assert.deepEqual(byToken["--zen-color-bg-warning"].variant, { prop: "Status", values: ["Warning"] });
  assert.equal(byToken["--zen-color-bg-warning"].grade, "semantic");
  assert.deepEqual(byToken["--zen-success-25"].variant, { prop: "Status", values: ["Success"] });
  assert.equal(byToken["--zen-success-25"].grade, "primitive");
  assert.deepEqual(byToken["--zen-color-bg-sunken"].variant, { prop: "Status", values: ["Stopped", "Sleeping", "Offline", "Pending"] });
  assert.deepEqual(byToken["--zen-primary-25"].variant, { prop: "Status", values: ["Loading", "Maintenance", "Scheduled", "Queued"] });
  // else-branch inference: Fail is the only uncovered declared value; it is the default -> LAST
  const last = bgs[bgs.length - 1];
  assert.deepEqual(last, { property: "background-color", token: "--zen-error-25", grade: "primitive", variant: { prop: "Status", values: ["Fail"] } });

  // 4) Scoped border-color: disabled group is semantic, default (Fail) last.
  const bcs = root.filter((b) => b.property === "border-color");
  const bcByToken = Object.fromEntries(bcs.map((b) => [b.token, b]));
  assert.equal(bcByToken["--zen-border-disabled"].grade, "semantic");
  assert.deepEqual(bcs[bcs.length - 1].variant.values, ["Fail"]);

  // 5) Label text facts on the DEFAULT branch's text node (in anatomy).
  const label = Object.fromEntries((doc.byNodeId["7314:4575"] || []).map((b) => [b.property, b]));
  assert.deepEqual(label["color"], { property: "color", token: "--zen-color-text-tertiary", grade: "semantic" });
  assert.deepEqual(label["font-family"], { property: "font-family", token: "--zen-font-family-text", grade: "semantic" });
  assert.deepEqual(label["font-size"], { property: "font-size", token: "--zen-font-size-sm", grade: "semantic" });
  assert.deepEqual(label["font-weight"], { property: "font-weight", token: "--zen-font-weight-regular", grade: "semantic" });
  assert.deepEqual(label["line-height"], { property: "line-height", token: "--zen-font-lineheight-sm", grade: "semantic" });
  assert.deepEqual(label["letter-spacing"], { property: "letter-spacing", token: "--zen-font-letterspacing-3", grade: "primitive" });

  // 6) Icon instance node excluded; non-default branches' children absent.
  assert.equal(doc.byNodeId["7314:4574"], undefined);
  assert.equal(doc.byNodeId["7314:4584"], undefined); // Warning branch label: not in anatomy
});
