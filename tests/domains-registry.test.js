"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { collectViolations } = require("../scripts/validate/validate-domains");

const REAL = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "domains.json"), "utf8"),
);
function clone() {
  return JSON.parse(JSON.stringify(REAL));
}

test("real registry has zero violations", () => {
  assert.deepEqual(collectViolations(), []);
});

test("catches a schema-invalid registry (missing unit fields)", () => {
  const v = collectViolations({
    registry: { _schema_version: 1, domains: { foo: { summary: "x" } } },
  });
  assert.ok(v.some((m) => m.startsWith("schema:")), v.join("; "));
});

test("catches a missing generator (referential)", () => {
  const reg = clone();
  reg.domains.categories.generator = "scripts/nope.js";
  const v = collectViolations({ registry: reg });
  assert.ok(v.some((m) => m.includes("generator not found")), v.join("; "));
});

test("catches a missing src path (referential)", () => {
  const reg = clone();
  reg.domains.categories.src = "components/src/does-not-exist/*.md";
  const v = collectViolations({ registry: reg });
  assert.ok(v.some((m) => m.includes("src path not found")), v.join("; "));
});

test("catches an uncovered derive (coverage)", () => {
  const reg = clone();
  delete reg.domains.foundations;
  const v = collectViolations({ registry: reg });
  assert.ok(
    v.some((m) => m.includes("derive:foundations has no domains.json unit")),
    v.join("; "),
  );
});

test("globPrefix strips at first glob char", () => {
  const { globPrefix } = require("../scripts/validate/validate-domains");
  assert.equal(
    globPrefix("components/src/categories/*.md"),
    "components/src/categories",
  );
  assert.equal(globPrefix("components/src/*/{a,b}.md"), "components/src");
  assert.equal(globPrefix("tokens/tokens.json"), "tokens/tokens.json");
});
