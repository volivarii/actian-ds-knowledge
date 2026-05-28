"use strict";

// Tests for the _order.json substrate-ordering mechanism in
// derive-foundations.js + derive-a11y-index.js. Replaces the NN-prefix
// filename convention (PR 1 of the editor file lifecycle spec).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const foundationsDerive = require(
  path.join(REPO_ROOT, "scripts", "foundations", "derive-foundations.js"),
);

function makeTmpSrcDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "order-manifest-"));
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body, "utf8");
  }
  return dir;
}

test("foundations: concatFoundationsSources reads from _order.json", () => {
  const dir = makeTmpSrcDir({
    "_order.json": JSON.stringify(["intro", "tokens"]),
    "intro.md": "# Intro\n\nFirst.\n",
    "tokens.md": "# Tokens\n\nSecond.\n",
    "AUTHORING.md": "ignored",
  });
  const out = foundationsDerive.concatFoundationsSources(dir);
  assert.match(out, /First\.\s*\n\s*\n\s*---\s*\n\s*\n\s*# Tokens/);
});

test("foundations: _order.json determines order even when filenames are not alphabetical", () => {
  const dir = makeTmpSrcDir({
    "_order.json": JSON.stringify(["zeta", "alpha"]),
    "alpha.md": "# Alpha\n",
    "zeta.md": "# Zeta\n",
  });
  const out = foundationsDerive.concatFoundationsSources(dir);
  assert.ok(out.indexOf("# Zeta") < out.indexOf("# Alpha"));
});

test("foundations: drift — slug in _order.json without matching file errors", () => {
  const dir = makeTmpSrcDir({
    "_order.json": JSON.stringify(["intro", "missing-section"]),
    "intro.md": "# Intro\n",
  });
  assert.throws(
    () => foundationsDerive.concatFoundationsSources(dir),
    /missing-section/,
  );
});

test("foundations: drift — file on disk not in _order.json errors", () => {
  const dir = makeTmpSrcDir({
    "_order.json": JSON.stringify(["intro"]),
    "intro.md": "# Intro\n",
    "stray.md": "# Stray\n",
  });
  assert.throws(
    () => foundationsDerive.concatFoundationsSources(dir),
    /stray/,
  );
});

test("foundations: AUTHORING.md is always excluded (never in _order.json, never an error)", () => {
  const dir = makeTmpSrcDir({
    "_order.json": JSON.stringify(["intro"]),
    "intro.md": "# Intro\n",
    "AUTHORING.md": "# Authoring guide\n",
  });
  assert.doesNotThrow(() => foundationsDerive.concatFoundationsSources(dir));
});
