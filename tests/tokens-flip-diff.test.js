// tests/tokens-flip-diff.test.js
//
// P4b POST-FLIP invariant guard — replaces the pre-flip live-vs-candidate diff gate.
//
// The candidate and live tokens are now the same (the flip is done).  This file
// asserts the STRUCTURAL + VALUE invariants that must remain true on the live
// tokens/tokens.json and tokens/tokens.css FOREVER after the flip.  Any re-derive
// that corrupts a ratified value will cause these tests to fail.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const LIVE_CSS = path.join(ROOT, "tokens", "tokens.css");
const LIVE_JSON = path.join(ROOT, "tokens", "tokens.json");

// ─── Load files ───────────────────────────────────────────────────────────────

let liveJson, liveCss, liveBlocks;

try {
  liveJson = JSON.parse(fs.readFileSync(LIVE_JSON, "utf8"));
  liveCss = fs.readFileSync(LIVE_CSS, "utf8");
} catch (err) {
  throw new Error(`Failed to load live token files: ${err.message}`);
}

// ─── CSS parser ───────────────────────────────────────────────────────────────

/** Extract a map of { '--zen-varname': 'value' } from a CSS block body string. */
function parseVarMap(blockContent) {
  const vars = {};
  const re = /--zen-([^:]+):\s*((?:[^;]|\n)*?);/g;
  let m;
  while ((m = re.exec(blockContent)) !== null) {
    const name = `--zen-${m[1].trim()}`;
    const value = m[2].trim().replace(/\s+/g, " ");
    vars[name] = value;
  }
  return vars;
}

/**
 * Parse a CSS file into per-block var-maps:
 *   { actian: {...}, studio: {...}, explorer: {...} }
 */
function parseCssBlocks(cssText) {
  const selectors = [
    { name: "actian", marker: ":root," },
    { name: "studio", marker: '[data-theme="studio"]' },
    { name: "explorer", marker: '[data-theme="explorer"]' },
  ];
  const blocks = {};
  for (const { name, marker } of selectors) {
    const idx = cssText.indexOf(marker);
    if (idx === -1) throw new Error(`CSS block not found: ${name}`);
    const open = cssText.indexOf("{", idx);
    const close = cssText.indexOf("}", open);
    blocks[name] = parseVarMap(cssText.slice(open + 1, close));
  }
  return blocks;
}

try {
  liveBlocks = parseCssBlocks(liveCss);
} catch (err) {
  throw new Error(`Failed to parse live CSS: ${err.message}`);
}

// ─── (a) _frozen:false invariant ────────────────────────────────────────────

test("post-flip: tokens.json _frozen is false (generator owns the file)", () => {
  assert.equal(
    liveJson.$metadata._frozen,
    false,
    `Expected $metadata._frozen === false; got: ${liveJson.$metadata._frozen}`,
  );
});

test("post-flip: tokens.json has generatedBy pointing to derive-tokens script", () => {
  const gen = liveJson.$metadata.generatedBy;
  assert.ok(
    gen && gen.includes("scripts/tokens"),
    `Expected generatedBy to include 'scripts/tokens'; got: ${gen}`,
  );
});

test("post-flip: tokens.json has no _frozen_reason (carry-forward from frozen era)", () => {
  assert.equal(
    liveJson.$metadata._frozen_reason,
    undefined,
    "_frozen_reason must be absent post-flip",
  );
});

// ─── (b) Representative color tokens are DTCG alias refs ────────────────────

test("post-flip: color.primary.500.$value is a DTCG alias ref (starts with '{')", () => {
  const val = liveJson.color.primary["500"].$value;
  assert.ok(
    typeof val === "string" && val.startsWith("{"),
    `Expected color.primary.500.$value to be a DTCG alias ref; got: ${val}`,
  );
});

test("post-flip: color.text.secondary.$value is a DTCG alias ref (starts with '{')", () => {
  const val = liveJson.color.text.secondary.$value;
  assert.ok(
    typeof val === "string" && val.startsWith("{"),
    `Expected color.text.secondary.$value to be a DTCG alias ref; got: ${val}`,
  );
});

// ─── (c) Alias refs have resolved hex in com.actian.themes.actian ─────────

test("post-flip: color.primary.500 com.actian.themes.actian is valid hex", () => {
  const themes = liveJson.color.primary["500"].$extensions["com.actian.themes"];
  assert.ok(
    themes && themes.actian && /^#[0-9A-Fa-f]{6}$/.test(themes.actian),
    `Expected valid hex; got: ${themes && themes.actian}`,
  );
});

test("post-flip: color.text.secondary com.actian.themes.actian is valid hex", () => {
  const themes =
    liveJson.color.text.secondary.$extensions["com.actian.themes"];
  assert.ok(
    themes && themes.actian && /^#[0-9A-Fa-f]{6}$/.test(themes.actian),
    `Expected valid hex; got: ${themes && themes.actian}`,
  );
});

// ─── (d) Ratified CSS value pins (key changed values from the flip) ─────────

test("post-flip: tokens.css contains --zen-color-text-primary: #0f5fdc (ratified)", () => {
  const val = liveBlocks.actian["--zen-color-text-primary"];
  assert.equal(
    val,
    "#0f5fdc",
    `Expected --zen-color-text-primary=#0f5fdc; got: ${val}`,
  );
});

test("post-flip: tokens.css contains --zen-color-primary-500: #0f5fdc (ratified)", () => {
  const val = liveBlocks.actian["--zen-color-primary-500"];
  assert.equal(
    val,
    "#0f5fdc",
    `Expected --zen-color-primary-500=#0f5fdc; got: ${val}`,
  );
});

test("post-flip: tokens.css border-error uses error-600 (#dc3514)", () => {
  const val = liveBlocks.actian["--zen-border-error"];
  assert.equal(val, "#dc3514", `Expected #dc3514; got: ${val}`);
});

test("post-flip: tokens.css focus-ring-error uses error-600 (#dc3514)", () => {
  const val = liveBlocks.actian["--zen-focus-ring-error"];
  assert.equal(val, "#dc3514", `Expected #dc3514; got: ${val}`);
});

test("post-flip: tokens.css font-size-xs is 11px (not old 10px)", () => {
  const val = liveBlocks.actian["--zen-font-size-xs"];
  assert.equal(val, "11px", `Expected 11px; got: ${val}`);
});

// ─── (e) Structure: live CSS has the expected three theme blocks ────────────

test("post-flip: live tokens.css has all 3 theme blocks (actian/studio/explorer)", () => {
  assert.ok(
    Object.keys(liveBlocks.actian).length > 50,
    "actian block must have > 50 vars",
  );
  assert.ok(
    Object.keys(liveBlocks.studio).length > 10,
    "studio block must have > 10 vars",
  );
  assert.ok(
    Object.keys(liveBlocks.explorer).length > 10,
    "explorer block must have > 10 vars",
  );
});

// ─── (f) Motion guard: no motion vars in CSS (JSON-only) ────────────────────

test("post-flip: no --zen-motion-* vars emitted to tokens.css", () => {
  const motionVars = Object.keys(liveBlocks.actian).filter((v) =>
    v.startsWith("--zen-motion-"),
  );
  assert.deepStrictEqual(
    motionVars,
    [],
    `Unexpected motion vars in CSS: ${JSON.stringify(motionVars)}`,
  );
});

// ─── (g) Shadows unchanged / present ────────────────────────────────────────

test("post-flip: shadow vars present in live tokens.css (xs/sm/md/lg/xl)", () => {
  const shadowVars = [
    "--zen-shadow-xs",
    "--zen-shadow-sm",
    "--zen-shadow-md",
    "--zen-shadow-lg",
    "--zen-shadow-xl",
  ];
  for (const v of shadowVars) {
    assert.ok(
      liveBlocks.actian[v],
      `Expected ${v} to be present in live tokens.css`,
    );
  }
});

// ─── (h) Rename confirmed: stardard gone, standard present ──────────────────

test("post-flip: stardard typo vars absent from live tokens.css", () => {
  assert.ok(
    !("--zen-font-body-stardard-family" in liveBlocks.actian),
    "--zen-font-body-stardard-family must NOT be in live CSS post-flip",
  );
});

test("post-flip: standard (correct spelling) vars present in live tokens.css", () => {
  assert.ok(
    "--zen-font-body-standard-family" in liveBlocks.actian,
    "--zen-font-body-standard-family must be present in live CSS post-flip",
  );
});

// ─── (i) JSON structure: motion + shadow present, color.primitive present ───

test("post-flip: tokens.json has color.primitive namespace", () => {
  assert.ok(
    liveJson.color && "primitive" in liveJson.color,
    "color.primitive must be present",
  );
});

test("post-flip: tokens.json has motion namespace", () => {
  assert.ok(
    liveJson.motion && typeof liveJson.motion === "object",
    "motion must be present",
  );
});

test("post-flip: tokens.json has shadow namespace with 5 leaves", () => {
  const shadowKeys = liveJson.shadow && Object.keys(liveJson.shadow).sort();
  assert.deepStrictEqual(shadowKeys, ["lg", "md", "sm", "xl", "xs"]);
});
