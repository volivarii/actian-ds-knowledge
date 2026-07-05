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
