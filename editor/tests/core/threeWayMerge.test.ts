import { test } from "node:test";
import assert from "node:assert/strict";
import { threeWayMerge } from "../../src/core/threeWayMerge";

test("identical edits merge clean to that content", () => {
  assert.deepEqual(threeWayMerge("base", "same", "same"), { clean: true, text: "same" });
});

test("only I changed → take mine", () => {
  assert.deepEqual(threeWayMerge("base", "mine", "base"), { clean: true, text: "mine" });
});

test("only remote changed → take theirs", () => {
  assert.deepEqual(threeWayMerge("base", "base", "theirs"), { clean: true, text: "theirs" });
});

test("both changed differently → conflict block, not clean", () => {
  const r = threeWayMerge("base", "mine", "theirs");
  assert.equal(r.clean, false);
  assert.match(r.text, /<<<<<<< yours/);
  assert.match(r.text, /=======/);
  assert.match(r.text, />>>>>>> main/);
  assert.match(r.text, /mine/);
  assert.match(r.text, /theirs/);
});
