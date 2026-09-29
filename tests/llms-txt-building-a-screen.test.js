"use strict";
// The route in (knowledge-first simplification, C4): llms.txt's "Building a
// screen" names every source a screen is built from, in order, and the three
// honesty rules for anything made from this repository. The same lines are
// the Claude Design bundle's product README (scripts/render/build-bundle.js),
// so they are exported once and read by both.
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildingAScreenLines, generateLlmsTxt } = require("../scripts/llms-txt-generate.js");

test("Building a screen names every source and the three honesty rules", () => {
  const s = buildingAScreenLines().join("\n");
  for (const must of [
    "app-context/src/apps/",
    "recipes",
    "captures",
    "fragments",
    "render.css",
    "terminology.yml",
    "content/dist/",
    "handover/intent.md",
    "handover/specs.md",
    "decides structure",
    "Mark what is new on the page",
    "open questions",
    "not checked",
  ]) {
    assert.ok(s.includes(must), must);
  }
});

test("llms.txt carries the section as written", () => {
  assert.ok(generateLlmsTxt().includes(buildingAScreenLines().join("\n")));
});

// Only some recipes ship a capture, so the route may not promise one for every
// page, and must say what carries the page when there is none.
test("the route qualifies the screenshot and names the fallback", () => {
  const s = buildingAScreenLines().join("\n");
  assert.ok(s.includes("its screenshot, when it has one"));
  assert.ok(s.includes("Without one, the `slots` prose carries the page"));
});
