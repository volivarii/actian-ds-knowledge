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
    assert.ok(
      !/\bwidth=/.test(icon.body),
      `${slug}: body carries a width= attr`,
    );
    assert.ok(
      !/\bheight=/.test(icon.body),
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
