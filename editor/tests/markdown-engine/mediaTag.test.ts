import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseMediaTag,
  resolveMediaSrc,
} from "../../src/markdown-engine/media/mediaTag";

test("parses role + layout from a self-closing Media tag", () => {
  assert.deepEqual(parseMediaTag('<Media role="parts" layout="grid" />'), {
    role: "parts",
    layout: "grid",
  });
});

test("parses role-only Media tag", () => {
  assert.deepEqual(parseMediaTag('<Media role="spacing" />'), {
    role: "spacing",
  });
});

test("returns null for non-Media text", () => {
  assert.equal(parseMediaTag("just a paragraph"), null);
  assert.equal(parseMediaTag("<br />"), null);
});

test("resolves the dist media path from slug + role", () => {
  assert.equal(
    resolveMediaSrc("button", "parts"),
    "components/dist/media/button/parts.webp",
  );
});
