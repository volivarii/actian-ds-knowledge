"use strict";
// Driver-level behaviors added for the variant-set slice: canonical axis
// renaming via the anatomy root name, the root-id join guard, skip reasons,
// coverage-from-disk merging, and the --slugs arg guard.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const harvest = require("../scripts/components/harvest-token-bindings");

const SET_TEXT = `
type TagXProps = {
  className?: string;
  status?: "Fail" | "Success";
};
export default function TagX({ className, status = "Fail" }: TagXProps) {
  const isSuccess = status === "Success";
  return (
    <div className={className || \`\${String.raw\`gap-[var(--spacing\\/spacing-2xs,4px)] \`}\${isSuccess ? "bg-[var(--color-bg-warning,#fff9e5)]" : "bg-[var(--color-bg-default,white)]"}\`} id={isSuccess ? "node-1_2" : "node-1_1"}>
      <p className={\`text-[length:var(--font-size-sm,12px)] \${isSuccess ? "text-[color:var(--color-text-default,black)]" : 'text-[color:var(--color-text-tertiary,#50505d)]'}\`} id={isSuccess ? "node-1_4" : "node-1_3"}>x</p>
    </div>
  );
}`;

function mkTmp() {
  return {
    cap: fs.mkdtempSync(path.join(os.tmpdir(), "cap-")),
    anat: fs.mkdtempSync(path.join(os.tmpdir(), "anat-")),
    out: fs.mkdtempSync(path.join(os.tmpdir(), "out-")),
  };
}
const TOKENS = path.join(__dirname, "..", "tokens", "tokens.json");

test("driver canonicalizes axis names from the anatomy root and joins root bindings", () => {
  const t = mkTmp();
  fs.writeFileSync(path.join(t.cap, "tag-x.design-context.txt"), SET_TEXT);
  fs.writeFileSync(
    path.join(t.anat, "tag-x.json"),
    JSON.stringify({
      slug: "tag-x",
      root: {
        id: "1:1",
        kind: "container",
        name: "Status=Fail",
        children: [{ id: "1:3", kind: "text" }],
      },
    }),
  );
  const res = harvest.run({
    captureDir: t.cap,
    tokensPath: TOKENS,
    anatomyDir: t.anat,
    outDir: t.out,
    slugs: ["tag-x"],
    harvestedAt: "2026-07-02T00:00:00Z",
  });
  const doc = res.written["tag-x"];
  assert.deepEqual(doc.variantDefaults, { Status: "Fail" }); // canonical casing, not "status"
  const bgs = doc.byNodeId["1:1"].filter(
    (b) => b.property === "background-color",
  );
  assert.deepEqual(bgs[0].variant, { prop: "Status", values: ["Success"] });
  assert.deepEqual(bgs[1].variant, { prop: "Status", values: ["Fail"] }); // default-scoped LAST
  const labelBindings = doc.byNodeId["1:3"];
  assert.ok(
    Array.isArray(labelBindings),
    "conditional label attached to its anatomy id",
  );
  const labelColors = labelBindings.filter((b) => b.property === "color");
  assert.equal(labelColors.length, 2);
  assert.deepEqual(labelColors[0].variant, {
    prop: "Status",
    values: ["Success"],
  }); // non-default first
  assert.deepEqual(labelColors[1].variant, {
    prop: "Status",
    values: ["Fail"],
  }); // default last
  assert.equal(labelColors[1].token, "--zen-color-text-tertiary");
  const labelSize = labelBindings.find((b) => b.property === "font-size");
  assert.deepEqual(labelSize, {
    property: "font-size",
    token: "--zen-font-size-sm",
    grade: "semantic",
  });
});

test("driver skips with a reason when the anatomy root is not among the set root ids", () => {
  const t = mkTmp();
  fs.writeFileSync(path.join(t.cap, "tag-x.design-context.txt"), SET_TEXT);
  fs.writeFileSync(
    path.join(t.anat, "tag-x.json"),
    JSON.stringify({
      slug: "tag-x",
      root: { id: "9:9", kind: "container", name: "Status=Fail", children: [] },
    }),
  );
  const res = harvest.run({
    captureDir: t.cap,
    tokensPath: TOKENS,
    anatomyDir: t.anat,
    outDir: t.out,
    slugs: ["tag-x"],
    harvestedAt: "2026-07-02T00:00:00Z",
  });
  assert.equal(Object.keys(res.written).length, 0);
  assert.equal(res.skipped.length, 1);
  assert.equal(res.skipped[0].slug, "tag-x");
  assert.match(res.skipped[0].reason, /root/);
  const cov = fs.readFileSync(path.join(t.out, "coverage.md"), "utf8");
  assert.match(cov, /tag-x \(.*root.*\)/);
});

test("coverage merges pre-existing on-disk sidecars (widening keeps old rows)", () => {
  const t = mkTmp();
  // Pre-existing sidecar from an earlier family run
  fs.writeFileSync(
    path.join(t.out, "old-slug.json"),
    JSON.stringify({
      _schema_version: 1,
      slug: "old-slug",
      byNodeId: {
        z: [{ property: "color", token: "--zen-x", grade: "primitive" }],
      },
    }),
  );
  fs.writeFileSync(path.join(t.cap, "tag-x.design-context.txt"), SET_TEXT);
  fs.writeFileSync(
    path.join(t.anat, "tag-x.json"),
    JSON.stringify({
      slug: "tag-x",
      root: { id: "1:1", kind: "container", name: "Status=Fail", children: [] },
    }),
  );
  harvest.run({
    captureDir: t.cap,
    tokensPath: TOKENS,
    anatomyDir: t.anat,
    outDir: t.out,
    slugs: ["tag-x"],
    harvestedAt: "2026-07-02T00:00:00Z",
  });
  const cov = fs.readFileSync(path.join(t.out, "coverage.md"), "utf8");
  assert.match(cov, /old-slug/);
  assert.match(cov, /tag-x/);
});

test("parseArgs throws on a dangling flag value", () => {
  assert.throws(() => harvest.parseArgs(["node", "x", "--slugs"]), /--slugs/);
  assert.deepEqual(harvest.parseArgs(["node", "x", "--slugs", "a,b"]).slugs, [
    "a",
    "b",
  ]);
});

test("canonicalAxes parses single and multi-axis root names", () => {
  assert.deepEqual(harvest.canonicalAxes("Status=Fail"), { status: "Status" });
  assert.deepEqual(harvest.canonicalAxes("Type=Item, State=Default"), {
    type: "Type",
    state: "State",
  });
  assert.deepEqual(harvest.canonicalAxes(undefined), {});
});
