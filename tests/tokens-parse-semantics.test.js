"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSemantics } = require("../scripts/tokens/lib/parse-semantics.js");

const MD = [
  "#### Text Color Tokens",
  "| Token | Resolves To | Usage | Status |",
  "| --- | --- | --- | --- |",
  "| `--zen-color-text-secondary` | `--zen-color-neutral-800` | x | 🟢 Shipped |",
  "| `--zen-color-text-link-default` | `--zen-color-primary-500` | x | 🟢 Shipped |",
  "| `--zen-color-text-default` | `--zen-color-black` | x | 🟡 Proposed (rename) |",
  "",
  "### 2.8 Backgrounds",
  "| Token | Suggested Value | Usage | Status |",
  "| --- | --- | --- | --- |",
  "| `--zen-color-bg-overlay` | `--zen-color-black` at 40% opacity | x | 🟡 Proposed |",
  "| `--zen-color-bg-selected` | `--zen-color-primary-25` | x | 🟡 Proposed |",
].join("\n");

test("splits group + dotted leaf name, captures resolvesTo + status", () => {
  const out = parseSemantics(MD);
  const sec = out.find((t) => t.group === "text" && t.name === "secondary");
  assert.deepEqual(
    { resolvesTo: sec.resolvesTo, status: sec.status, opacity: sec.opacity },
    { resolvesTo: "neutral-800", status: "Shipped", opacity: null },
  );
});

test("nested leaf: text-link-default → group text, name link.default", () => {
  const out = parseSemantics(MD);
  assert.ok(
    out.find(
      (t) =>
        t.group === "text" &&
        t.name === "link.default" &&
        t.resolvesTo === "primary-500",
    ),
  );
});

test("captures opacity from 'black at 40% opacity'", () => {
  const out = parseSemantics(MD);
  const ov = out.find((t) => t.group === "bg" && t.name === "overlay");
  assert.equal(ov.resolvesTo, "black");
  assert.equal(ov.opacity, 0.4);
});

test("In Review / Proposed / Shipped normalized from emoji", () => {
  const out = parseSemantics(MD);
  assert.equal(out.find((t) => t.name === "default").status, "Proposed");
});

test("placeholder-subtle stays a flat key; link-default nests", () => {
  const MD2 = [
    "#### Text Color Tokens",
    "| Token | Resolves To | Usage | Status |",
    "| --- | --- | --- | --- |",
    "| `--zen-color-text-placeholder-subtle` | `--zen-color-neutral-400` | x | 🟢 Shipped |",
    "| `--zen-color-text-link-default` | `--zen-color-primary-500` | x | 🟢 Shipped |",
  ].join("\n");
  const out = parseSemantics(MD2);
  assert.ok(
    out.find((t) => t.group === "text" && t.name === "placeholder-subtle"),
  );
  assert.ok(out.find((t) => t.group === "text" && t.name === "link.default"));
});
