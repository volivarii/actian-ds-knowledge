"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildResolver,
  applyAlpha,
} = require("../scripts/tokens/lib/resolve.js");

const primitiveTree = {
  color: {
    primitive: {
      "royal-blue": { 500: { $value: "#0F5FDC" } },
      blue: { 500: { $value: "#0283BE" } },
      turquoise: { 500: { $value: "#049B98" } },
      "cool-grey": { 800: { $value: "#2A2A30" } },
      grey: { 800: { $value: "#636363" } },
      green: { 600: { $value: "#299315" } },
      black: { $value: "#000000" },
      white: { $value: "#FFFFFF" },
    },
  },
};
const globalRoles = {
  primary: "royal-blue",
  neutral: "cool-grey",
  success: "green",
  warning: "orange",
  error: "red",
};
const themes = {
  actian: { primary: "royal-blue", neutral: "cool-grey" },
  studio: { primary: "blue", neutral: "grey" },
  explorer: { primary: "turquoise", neutral: "grey" },
};
const R = buildResolver({ primitiveTree, globalRoles, themes });

test("role-shade resolves through the theme palette", () => {
  assert.equal(R.resolveHex("primary-500", "actian"), "#0F5FDC");
  assert.equal(R.resolveHex("primary-500", "studio"), "#0283BE");
  assert.equal(R.resolveHex("primary-500", "explorer"), "#049B98");
});

test("neutral varies by theme; cool-grey(actian) vs grey(studio)", () => {
  assert.equal(R.resolveHex("neutral-800", "actian"), "#2A2A30");
  assert.equal(R.resolveHex("neutral-800", "studio"), "#636363");
});

test("theme-invariant role (success) ignores theme", () => {
  assert.equal(R.resolveHex("success-600", "studio"), "#299315");
});

test("singletons", () => {
  assert.equal(R.resolveHex("black", "explorer"), "#000000");
  assert.equal(R.resolveHex("white", "actian"), "#FFFFFF");
});

test("applyAlpha appends the alpha byte (40% → 66)", () => {
  assert.equal(applyAlpha("#000000", 0.4), "#00000066");
});

test("applyAlpha returns hex unchanged when opacity is null", () => {
  assert.equal(applyAlpha("#0F5FDC", null), "#0F5FDC");
});
