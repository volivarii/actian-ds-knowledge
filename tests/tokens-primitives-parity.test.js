"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { derivePrimitiveTree } = require("../scripts/tokens/derive-tokens.js");

const ROOT = path.resolve(__dirname, "..");
const md = fs.readFileSync(
  path.join(ROOT, "foundations/src/color-primitives.md"),
  "utf8",
);
const raw = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "tokens/src/figma-bindings-raw.json"),
    "utf8",
  ),
);
const frozen = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tokens/tokens.json"), "utf8"),
);
const tree = derivePrimitiveTree({ primitivesMd: md, rawBindings: raw });

const BACKS = {
  primary: "royal-blue",
  neutral: "cool-grey",
  success: "green",
  warning: "orange",
  error: "red",
};

// Prefer the already-resolved hex from com.actian.themes.actian; falls back to
// $value for non-color tokens (numerics, spacing) that have no themes extension.
// This makes parity checks alias-tolerant: correct both pre-flip ($value == hex)
// and post-flip ($value == {alias}).
const resolvedHex = (leaf) =>
  leaf?.$extensions?.["com.actian.themes"]?.actian ?? leaf.$value;

// P4b flip (2026-06-26): the live tokens.json is now generator-owned.
// All previously ratified ALLOWLIST entries have been cleared — the live file
// and the in-memory primitive tree are now in lockstep and match exactly.
// See docs/superpowers/notes/2026-06-25-tokens-p3-parity-diffs.md for history.
const ALLOWLIST = new Set();

const norm = (v) =>
  typeof v === "string" ? v.replace(/^#/, "").toUpperCase() : v;

for (const [role, palette] of Object.entries(BACKS)) {
  test(`Actian ${role}.* hex == primitive ${palette}.* hex (allowlisted diffs excepted)`, () => {
    const sem = (frozen.color && frozen.color[role]) || {};
    const prim = tree.color.primitive[palette] || {};
    const unexplained = [];
    for (const shade of Object.keys(sem)) {
      const semHex = sem[shade] && resolvedHex(sem[shade]);
      const primHex = prim[shade] && prim[shade].$value;
      if (
        semHex &&
        primHex &&
        norm(semHex) !== norm(primHex) &&
        !ALLOWLIST.has(`${role}.${shade}`)
      ) {
        unexplained.push(`${role}.${shade}: frozen ${semHex} vs md ${primHex}`);
      }
    }
    assert.equal(
      unexplained.length,
      0,
      "UNEXPLAINED PARITY DRIFT (not in allowlist):\n" + unexplained.join("\n"),
    );
  });
}

test("allowlisted diffs are all still real divergences (no stale allowlist entries)", () => {
  const stale = [];
  for (const key of ALLOWLIST) {
    const [role, shade] = key.split(".");
    const palette = BACKS[role];
    const semHex =
      frozen.color &&
      frozen.color[role] &&
      frozen.color[role][shade] &&
      resolvedHex(frozen.color[role][shade]);
    const primHex =
      tree.color.primitive[palette] &&
      tree.color.primitive[palette][shade] &&
      tree.color.primitive[palette][shade].$value;
    if (semHex && primHex && norm(semHex) === norm(primHex)) stale.push(key);
  }
  assert.equal(
    stale.length,
    0,
    "stale allowlist entries (now matching — remove them):\n" +
      stale.join("\n"),
  );
});
