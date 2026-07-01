const test = require("node:test");
const assert = require("node:assert/strict");
const norm = require("../scripts/sync/normalize-anatomy");

test("normalizeNode carries the Figma node id", () => {
  const node = { id: "14783:7564", name: "Root", type: "FRAME", layoutMode: "HORIZONTAL", children: [] };
  const out = norm.normalizeNode(node, { varNameById: {} }); // use the module's node normalizer
  assert.equal(out.id, "14783:7564");
});
