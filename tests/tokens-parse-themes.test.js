"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { parseGlobalRoles, parseThemes } = require("../scripts/tokens/lib/parse-themes.js");

const md = fs.readFileSync(path.join(__dirname, "..", "foundations/src/tokens.md"), "utf8");

test("parseGlobalRoles reads §2.1 role→palette base", () => {
  const r = parseGlobalRoles(md);
  assert.equal(r.primary, "royal-blue");
  assert.equal(r.neutral, "cool-grey");
  assert.equal(r.success, "green");
  assert.equal(r.warning, "orange");
  assert.equal(r.error, "red");
});

test("parseThemes reads the 3×2 theme table", () => {
  const t = parseThemes(md);
  assert.deepEqual(t.actian, { primary: "royal-blue", neutral: "cool-grey" });
  assert.deepEqual(t.studio, { primary: "blue", neutral: "grey" });
  assert.deepEqual(t.explorer, { primary: "turquoise", neutral: "grey" });
});
