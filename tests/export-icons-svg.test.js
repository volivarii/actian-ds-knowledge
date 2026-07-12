"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { run } = require("../scripts/icons/export-icons-svg");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "icons-export-"));
}

const REGISTRY = {
  fileKey: "FILEKEY",
  components: {
    good: { category: "Icons", key: "k-good", nodeId: "1:1" },
    twocolor: { category: "Icons", key: "k-two", nodeId: "1:2" },
    amazons3: { category: "Icons", key: "k-aws", nodeId: "1:3" },
    button: { category: "Action", key: "k-btn", nodeId: "1:9" },
  },
};
const ICON_GROUPS = {
  _schema_version: 1,
  Connector: ["amazons3"],
  Common: ["good", "twocolor"],
};
const SVG = {
  "1:1": '<svg viewBox="0 0 24 24"><path d="M5 5h14v14H5z" fill="#000"/></svg>',
  "1:2":
    '<svg viewBox="0 0 24 24"><path d="M0 0h12v24H0z" fill="#0000ff"/><path d="M12 0h12v24H12z" fill="#f00"/></svg>',
  "1:3":
    '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="#ff9900"/></svg>',
};
const fakeRest = {
  getImages: (fileKey, ids) =>
    Promise.resolve({
      images: Object.fromEntries(ids.map((id) => [id, "url://" + id])),
    }),
  fetchBinary: (url) =>
    Promise.resolve(Buffer.from(SVG[url.replace("url://", "")], "utf8")),
};

test("exports clean UI icons, excludes Connector + non-Icons, degrades multicolor", async () => {
  const dir = tmp();
  const autoOutPath = path.join(dir, "icons-svg.auto.json");
  const degradedOutPath = path.join(dir, "icons.degraded.json");
  const r = await run({
    registry: REGISTRY,
    iconGroups: ICON_GROUPS,
    curatedSlugs: new Set(),
    autoOutPath,
    degradedOutPath,
    rest: fakeRest,
  });

  assert.deepEqual(
    r.exported,
    ["good"],
    "only the clean monochrome UI icon exported",
  );
  assert.deepEqual(r.degraded, [{ slug: "twocolor", reason: "multicolor" }]);
  assert.ok(
    r.skipped >= 1,
    "amazons3 (Connector) + button (non-Icons) skipped",
  );

  const auto = JSON.parse(fs.readFileSync(autoOutPath, "utf8"));
  assert.deepEqual(Object.keys(auto.icons), ["good"]);
  assert.match(auto.icons.good.body, /currentColor/);
  assert.equal(auto._schema_version, 1);

  const degraded = JSON.parse(fs.readFileSync(degradedOutPath, "utf8"));
  assert.deepEqual(degraded.degraded, [
    { slug: "twocolor", reason: "multicolor" },
  ]);
});

test("curated slugs are excluded from the degraded worklist", async () => {
  const dir = tmp();
  const r = await run({
    registry: REGISTRY,
    iconGroups: ICON_GROUPS,
    curatedSlugs: new Set(["twocolor"]),
    autoOutPath: path.join(dir, "a.json"),
    degradedOutPath: path.join(dir, "d.json"),
    rest: fakeRest,
  });
  assert.deepEqual(
    r.degraded,
    [],
    "twocolor covered by curated → not on the worklist",
  );
});

test("all targets degrade → no (empty, schema-invalid) auto file written; worklist still written", async () => {
  const dir = tmp();
  const autoOutPath = path.join(dir, "icons-svg.auto.json");
  const degradedOutPath = path.join(dir, "icons.degraded.json");
  const reg = {
    fileKey: "F",
    components: { twocolor: { category: "Icons", key: "k", nodeId: "1:2" } },
  };
  const groups = { _schema_version: 1, Common: ["twocolor"] };
  const r = await run({
    registry: reg,
    iconGroups: groups,
    curatedSlugs: new Set(),
    autoOutPath,
    degradedOutPath,
    rest: fakeRest,
  });
  assert.deepEqual(r.exported, [], "nothing clean → empty exported");
  assert.equal(
    fs.existsSync(autoOutPath),
    false,
    "no auto file when there are no clean icons",
  );
  assert.ok(
    fs.existsSync(degradedOutPath),
    "degraded worklist is still written",
  );
});

test("second identical run writes nothing (wrote=false) — no-op nights stay no-op", async () => {
  const dir = tmp();
  const opts = {
    registry: REGISTRY,
    iconGroups: ICON_GROUPS,
    curatedSlugs: new Set(),
    autoOutPath: path.join(dir, "icons-svg.auto.json"),
    degradedOutPath: path.join(dir, "icons.degraded.json"),
    rest: fakeRest,
  };
  const r1 = await run(opts);
  assert.equal(r1.wrote, true, "first run writes");
  const r2 = await run(opts);
  assert.equal(r2.wrote, false, "byte-identical rerun must not report a write");
  assert.deepEqual(r2.exported, r1.exported, "exported list itself unchanged");
});

// ---------------------------------------------------------------------------
// Ghost components (2026-07-12).
//
// The registry is built from Figma's PUBLISHED-LIBRARY endpoint
// (/v1/files/:key/components), which keeps advertising a component after its
// canvas node has been deleted. So the registry can hold entries whose nodeId
// resolves to nothing: ghosts.
//
// /v1/images returns NO url for a ghost. That is categorically different from
// "the glyph is messy" (multicolor / gradient): it means the REGISTRY IS STALE.
// Lumping both into a `render-failed` worklist is how 28 dead icons hid in
// plain sight while the registry count sat unchanged at 237 and every diff
// said "unchanged".
//
// It is also different from a transient Figma API failure, which must NEVER be
// recorded as icon loss. See the `err` test below.
// ---------------------------------------------------------------------------

// Figma returns no image URL for a node it will not render. That has TWO very
// different causes and /v1/images cannot tell them apart:
//   - the node is GONE      -> the registry is stale (a ghost)
//   - the node is there but Figma failed to render it -> render-failed
// So the exporter probes /v1/files/:key/nodes before claiming a ghost. These two
// tests pin both branches: same getImages response, opposite getNodes answer,
// opposite verdict. Without the probe the code would assert "this node no longer
// exists in Figma" on evidence that cannot support it.
function restWithMissingUrlFor(nodeId, nodeExists) {
  return {
    getImages: (fileKey, ids) =>
      Promise.resolve({
        images: Object.fromEntries(
          ids.filter((id) => id !== nodeId).map((id) => [id, "url://" + id]),
        ),
      }),
    getNodes: (fileKey, ids) =>
      Promise.resolve({
        nodes: Object.fromEntries(
          ids.map((id) => [
            id,
            // Figma returns a null entry for a node that does not exist.
            id === nodeId && !nodeExists ? null : { document: { id: id } },
          ]),
        ),
      }),
    fetchBinary: (url) =>
      Promise.resolve(Buffer.from(SVG[url.replace("url://", "")], "utf8")),
  };
}

test("node absent from /v1/nodes is a GHOST (stale registry), not a degraded glyph", async () => {
  const dir = tmp();
  const r = await run({
    registry: REGISTRY,
    iconGroups: ICON_GROUPS,
    curatedSlugs: new Set(),
    autoOutPath: path.join(dir, "icons-svg.auto.json"),
    degradedOutPath: path.join(dir, "icons.degraded.json"),
    rest: restWithMissingUrlFor("1:2", false),
  });

  assert.deepEqual(
    r.ghosts,
    ["twocolor"],
    "a node Figma has no record of must surface as a ghost, named",
  );
  assert.deepEqual(
    r.degraded,
    [{ slug: "twocolor", reason: "node-missing" }],
    "reason must say the NODE is gone, not that the glyph is bad",
  );
});

test("node that EXISTS but will not render is render-failed, NOT a ghost", async () => {
  const dir = tmp();
  const r = await run({
    registry: REGISTRY,
    iconGroups: ICON_GROUPS,
    curatedSlugs: new Set(),
    autoOutPath: path.join(dir, "icons-svg.auto.json"),
    degradedOutPath: path.join(dir, "icons.degraded.json"),
    rest: restWithMissingUrlFor("1:2", true),
  });

  assert.deepEqual(
    r.ghosts,
    [],
    "the node is still in the file, so the registry is NOT stale: claiming a ghost here would send someone hunting for a deletion that never happened",
  );
  assert.deepEqual(r.degraded, [{ slug: "twocolor", reason: "render-failed" }]);
});

test("a ghost is still reported even when a curated override masks it", async () => {
  const dir = tmp();
  const r = await run({
    registry: REGISTRY,
    iconGroups: ICON_GROUPS,
    // twocolor is hand-curated, so the glyph still resolves downstream...
    curatedSlugs: new Set(["twocolor"]),
    autoOutPath: path.join(dir, "icons-svg.auto.json"),
    degradedOutPath: path.join(dir, "icons.degraded.json"),
    rest: restWithMissingUrlFor("1:2", false),
  });

  // ...but the REGISTRY is still stale, and that is what a human needs to see.
  assert.deepEqual(r.ghosts, ["twocolor"]);
  assert.deepEqual(
    r.degraded,
    [],
    "a curated override means there is nothing for a designer to redraw, so it is not a worklist item",
  );
});

test("a Figma API error is NEVER recorded as icon loss: it fails the run", async () => {
  const dir = tmp();
  const flakyRest = {
    getImages: () =>
      Promise.resolve({
        images: {},
        errors: [{ ids: ["1:1", "1:2"], err: "Render timeout" }],
      }),
    fetchBinary: () => Promise.reject(new Error("should not be reached")),
  };
  await assert.rejects(
    () =>
      run({
        registry: REGISTRY,
        iconGroups: ICON_GROUPS,
        curatedSlugs: new Set(),
        autoOutPath: path.join(dir, "icons-svg.auto.json"),
        degradedOutPath: path.join(dir, "icons.degraded.json"),
        rest: flakyRest,
      }),
    /Render timeout/,
    "a transient API failure must abort, not silently mark every icon missing",
  );
});
