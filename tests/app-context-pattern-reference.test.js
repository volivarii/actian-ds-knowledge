"use strict";
// Every pattern says whether the shipped product shows it or only a design
// does, and names the product screenshots that show it. The tenant walk of
// 2026-10-01 sorted them: three are not in the product (ask-ai,
// ai-analyst-panel, discussion-threads), the rest ship.
//
// A screenshot named here must exist, a design pattern names none, and every
// capture a pattern's body cites is in its `screenshots`: the body and the
// field are two statements of one fact, so they cannot be allowed to drift.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { splitFrontmatter } = require("../scripts/app-context/lib-pure.js");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "app-context/src/patterns");
const RECIPES = path.join(ROOT, "app-context/src/recipes");
const patterns = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".md"))
  .map((f) => {
    const { data, body } = splitFrontmatter(fs.readFileSync(path.join(DIR, f), "utf8"));
    return [f, data, body];
  });

test("the patterns are read", () => {
  assert.ok(patterns.length > 20, String(patterns.length));
});

for (const [f, p, body] of patterns) {
  test(f + ": says whether its reference is the product or a design", () => {
    assert.ok(["product", "design"].includes(p.reference), String(p.reference));
  });
  test(f + ": every screenshot it names exists, and a design pattern names none", () => {
    const shots = p.screenshots || [];
    if (p.reference === "design") assert.deepEqual(shots, []);
    for (const s of shots) assert.ok(fs.existsSync(path.join(RECIPES, s)), s);
  });
  test(f + ": every capture its body cites is in its screenshots", () => {
    const cited = [...new Set((body.match(/recipes\/captures\/[a-z0-9-]+\.png/g) || []).map((c) => c.replace(/^recipes\//, "")))];
    const named = new Set(p.screenshots || []);
    assert.deepEqual(cited.filter((c) => !named.has(c)), []);
  });
}
