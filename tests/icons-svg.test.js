"use strict";

// Contract gates for the curated icon-SVG substrate (K2). The schema
// (schemas/icons-svg.json, checked in classc-schemas.test.js) validates shape;
// these tests enforce the semantic contract the render tier depends on:
// well-formed geometry, the currentColor-only coloring rule, slug validity
// against the dskit registry, and derive idempotency.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const { deriveIcons } = require("../scripts/icons/derive-icons-svg");

function load(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

const src = load("components/src/icons-svg.json");
const registry = load("components/dist/registries/dskit.json");
const iconGroups = load("components/src/icon-groups.json");

const autoPath = path.join(ROOT, "components/src/icons-svg.auto.json");
const auto = fs.existsSync(autoPath)
  ? JSON.parse(fs.readFileSync(autoPath, "utf8"))
  : null;
const { mergeIconSources } = require("../scripts/icons/derive-icons-svg");
const mergedIcons = mergeIconSources(auto, src).icons;

test("derive runs clean on live src and emits every icon", () => {
  const dist = deriveIcons(src, registry, iconGroups);
  assert.equal(
    Object.keys(dist.icons).length,
    Object.keys(src.icons).length,
    "every src icon must appear in dist",
  );
});

test("every icon: well-formed viewBox (4 numbers) + non-empty body", () => {
  for (const [slug, icon] of Object.entries(mergedIcons)) {
    const parts = icon.viewBox.trim().split(/\s+/);
    assert.equal(parts.length, 4, `${slug}: viewBox must be 4 numbers`);
    for (const p of parts) {
      assert.ok(
        !Number.isNaN(Number(p)),
        `${slug}: non-numeric viewBox part "${p}"`,
      );
    }
    assert.ok(icon.body && icon.body.trim().length > 0, `${slug}: empty body`);
  }
});

test("body is inner markup — no root <svg> / width= / height=", () => {
  for (const [slug, icon] of Object.entries(mergedIcons)) {
    assert.ok(
      !/<svg[\s>]/i.test(icon.body),
      `${slug}: body contains a root <svg>`,
    );
    // Match the width/height PRESENTATION attribute (always whitespace-preceded
    // inside a tag), not the `-width`/`-height` suffix of `stroke-width` etc.
    // A `\b` boundary wrongly fires on `stroke-width=` (boundary sits between the
    // hyphen and "width"); stroked icons like favorite-filled legitimately carry it.
    assert.ok(
      !/\swidth=/.test(icon.body),
      `${slug}: body carries a width= attr`,
    );
    assert.ok(
      !/\sheight=/.test(icon.body),
      `${slug}: body carries a height= attr`,
    );
  }
});

test("coloring contract — every fill/stroke is currentColor or none (no hex, no var())", () => {
  const problems = [];
  for (const [slug, icon] of Object.entries(mergedIcons)) {
    const attrs = icon.body.match(/(fill|stroke)="([^"]*)"/g) || [];
    for (const a of attrs) {
      const val = a.replace(/^(fill|stroke)="/, "").replace(/"$/, "");
      if (val !== "currentColor" && val !== "none")
        problems.push(`${slug}: ${a}`);
    }
  }
  assert.deepEqual(
    problems,
    [],
    "Non-normalized fills/strokes:\n" + problems.join("\n"),
  );
});

test("every slug resolves in the dskit registry as category Icons", () => {
  const comps = registry.components || {};
  for (const slug of Object.keys(src.icons)) {
    const reg = comps[slug];
    assert.ok(reg, `${slug}: not found in dskit registry`);
    assert.equal(
      reg.category,
      "Icons",
      `${slug}: category "${reg && reg.category}", expected "Icons"`,
    );
  }
});

test("derive joins provenance (group/dsKey/nodeId) from registry + icon-groups", () => {
  const dist = deriveIcons(src, registry, iconGroups);
  const close = dist.icons.close;
  if (close) {
    assert.equal(close.dsKey, registry.components.close.key);
    assert.equal(close.nodeId, registry.components.close.nodeId);
  }
  for (const icon of Object.values(dist.icons)) {
    assert.ok(
      typeof icon.dsKey === "string" && icon.dsKey.length > 0,
      "dsKey joined",
    );
    assert.ok(
      typeof icon.nodeId === "string" && icon.nodeId.length > 0,
      "nodeId joined",
    );
  }
});

test("derive rejects a slug absent from the registry", () => {
  const bad = {
    _schema_version: 1,
    icons: { "not-a-real-icon-xyz": { viewBox: "0 0 1 1", body: "<path/>" } },
  };
  assert.throws(
    () => deriveIcons(bad, registry, iconGroups),
    /not found in dskit registry/,
  );
});

// Resilience guard: a curated override whose Figma component was renamed/
// removed/recategorized must NOT fail the whole multi-domain sync. deriveIcons
// warns + skips a dangling CURATED-only slug, but still throws for an
// auto-derived (registry-sourced) slug that's invalid — a genuine pipeline bug.
const fakeReg = {
  components: { real: { key: "k", nodeId: "1:1", category: "Icons" } },
};
const fakeGroups = { Common: ["real"] };

test("resilience: warns + skips a dangling CURATED-only slug instead of throwing", () => {
  const src2 = {
    _schema_version: 1,
    icons: {
      real: { viewBox: "0 0 24 24", body: "<path/>" },
      "ghost-renamed-in-figma": { viewBox: "0 0 24 24", body: "<path/>" },
    },
  };
  const warnings = [];
  const dist = deriveIcons(src2, fakeReg, fakeGroups, {
    curatedSlugs: new Set(["ghost-renamed-in-figma"]),
    logger: { warn: (m) => warnings.push(m) },
  });
  assert.deepEqual(
    Object.keys(dist.icons),
    ["real"],
    "dangling curated slug dropped; valid icon retained",
  );
  assert.equal(warnings.length, 1, "exactly one warning emitted");
  assert.match(warnings[0], /ghost-renamed-in-figma/);
});

test("resilience: a category-recategorized CURATED slug is also warned + skipped", () => {
  const reg2 = {
    components: {
      moved: { key: "k", nodeId: "2:2", category: "Brand assets" },
    },
  };
  const src2 = {
    _schema_version: 1,
    icons: { moved: { viewBox: "0 0 24 24", body: "<path/>" } },
  };
  const warnings = [];
  const dist = deriveIcons(
    src2,
    reg2,
    { Common: [] },
    {
      curatedSlugs: new Set(["moved"]),
      logger: { warn: (m) => warnings.push(m) },
    },
  );
  assert.deepEqual(Object.keys(dist.icons), []);
  assert.match(warnings[0], /category/);
});

test("resilience: warns + skips a non-curated (auto-derived) invalid slug too, so a Figma recategorization cannot block the sync", () => {
  const src2 = {
    _schema_version: 1,
    icons: {
      real: { viewBox: "0 0 24 24", body: "<path/>" },
      "auto-recategorized": { viewBox: "0 0 24 24", body: "<path/>" },
    },
  };
  // "auto-recategorized" is in the registry but no longer category Icons, and is
  // NOT in curatedSlugs. The old contract threw; the sync now warn-skips it so one
  // stray recategorized icon cannot fail the whole multi-domain sync.
  const reg2 = {
    components: {
      real: { key: "k", nodeId: "1:1", category: "Icons" },
      "auto-recategorized": {
        key: "k2",
        nodeId: "2:2",
        category: "Brand assets",
      },
    },
  };
  const warnings = [];
  const dist = deriveIcons(
    src2,
    reg2,
    { Common: ["real"] },
    {
      curatedSlugs: new Set(), // resilience mode: the sync always passes this
      logger: { warn: (m) => warnings.push(m) },
    },
  );
  assert.deepEqual(
    Object.keys(dist.icons),
    ["real"],
    "auto-derived invalid slug dropped; valid icon retained",
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /auto-recategorized/);
});

test("strict mode (no curatedSlugs) still throws for any invalid slug; direct callers get loud validation", () => {
  const src2 = {
    _schema_version: 1,
    icons: { "auto-bug-xyz": { viewBox: "0 0 1 1", body: "<path/>" } },
  };
  assert.throws(
    () => deriveIcons(src2, fakeReg, fakeGroups),
    /not found in dskit registry/,
    "the bare 3-arg call has no resilience mode and validates strictly",
  );
});

test("derive is idempotent (twice → deep-equal)", () => {
  const a = deriveIcons(src, registry, iconGroups);
  const b = deriveIcons(src, registry, iconGroups);
  assert.deepEqual(a, b);
});

test("mergeIconSources: auto-only when no curated", () => {
  const auto = {
    _schema_version: 1,
    icons: { foo: { viewBox: "0 0 24 24", body: "<path/>" } },
  };
  const merged = mergeIconSources(auto, null);
  assert.deepEqual(Object.keys(merged.icons), ["foo"]);
});

test("mergeIconSources: curated overrides auto on slug conflict", () => {
  const auto = { icons: { x: { viewBox: "0 0 24 24", body: "AUTO" } } };
  const curated = { icons: { x: { viewBox: "0 0 24 24", body: "CURATED" } } };
  assert.equal(mergeIconSources(auto, curated).icons.x.body, "CURATED");
});

test("mergeIconSources: union of disjoint slugs", () => {
  const auto = { icons: { a: { viewBox: "0 0 24 24", body: "A" } } };
  const curated = { icons: { b: { viewBox: "0 0 24 24", body: "B" } } };
  assert.deepEqual(Object.keys(mergeIconSources(auto, curated).icons).sort(), [
    "a",
    "b",
  ]);
});

test("mergeIconSources: both empty → empty icons", () => {
  assert.deepEqual(mergeIconSources(null, null).icons, {});
});

test("resilience: mass category-loss throws instead of emitting a near-empty icons.json", () => {
  const icons = {};
  const comps = {};
  for (let i = 0; i < 12; i++) {
    icons["icon-" + i] = { viewBox: "0 0 24 24", body: "<path/>" };
    comps["icon-" + i] = {
      key: "k" + i,
      nodeId: i + ":0",
      category: "DS Icons",
    };
  }
  const src2 = { _schema_version: 1, icons };
  assert.throws(
    () =>
      deriveIcons(
        src2,
        { components: comps },
        { Common: [] },
        {
          curatedSlugs: new Set(),
          logger: { warn: () => {} },
        },
      ),
    /mass category-loss/,
    "12 of 12 skipped must fail loud in resilience mode",
  );
});
