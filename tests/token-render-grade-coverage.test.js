"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const derive = require(
  path.join(REPO_ROOT, "scripts", "components", "derive-guidelines"),
);

const PER = {
  card: {
    component: "Card",
    domains: {
      tokens: {
        status: "approved",
        bindings: [
          { token: "spacing-md", property: "padding", context: "Card padding" },
          { token: "border-selected", context: "Border (selected)" },
        ],
      },
    },
  },
  foundations: { component: "Foundations", domains: {} },
};

test("tokenRenderGradeStats counts graded vs total per component", () => {
  const stats = derive.tokenRenderGradeStats(PER);
  assert.deepEqual(stats.card, { total: 2, graded: 1 });
  assert.equal(stats.foundations, undefined); // no tokens domain -> omitted
});

test("buildCoverage includes a Token render-grade section", () => {
  const md = derive.buildCoverage(PER);
  assert.match(md, /Token render-grade/);
  assert.match(md, /Card \| 1\/2/);
});
