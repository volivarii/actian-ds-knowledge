// `quality-trend.*` is exempt from the render dist byte-drift guard because it
// is not a function of the tree: measure directions read `merge-base HEAD
// origin/main`, and series points record commit SHAs that squash merge
// deletes. The numbers it reports ARE a function of the tree, and nothing else
// asserts them: the #571 probe found quality-trend.json stays GREEN under
// mutation of the whole render suite. This is the guard that keeps them
// covered, so it has to separate the two halves exactly.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  treePureDiff,
} = require("../../scripts/render/check-quality-trend-values.js");

function trend(over) {
  const base = {
    meta: { sourcesLastChangedAt: "2026-09-08" },
    measures: {
      oracleVerified: { value: 97, direction: "better", previous: 87 },
      geometryVerified: { value: 150, direction: "better", previous: 99 },
    },
    detail: {
      inlineHexBySlug: { badge: 3 },
      structuralCollapseKeys: ["a", "b"],
    },
    oracleSeries: [{ date: "2026-09-08", version: "0.34.201", sha: "e1fe7c34", verified: 97 }],
  };
  return { ...base, ...over };
}

test("treePureDiff: a file that regenerates identically reports nothing", () => {
  assert.deepEqual(treePureDiff(trend(), trend()), []);
});

test("treePureDiff: a measure whose VALUE moved is reported", () => {
  const fresh = trend({
    measures: {
      oracleVerified: { value: 112, direction: "better", previous: 87 },
      geometryVerified: { value: 150, direction: "better", previous: 99 },
    },
  });
  const found = treePureDiff(trend(), fresh);
  assert.equal(found.length, 1);
  assert.match(found[0], /oracleVerified/);
  assert.match(found[0], /97/);
  assert.match(found[0], /112/);
});

test("treePureDiff: direction and previous are the EXEMPT half, so they are not reported", () => {
  // This is the exact shape regeneration produces on main once the PR that
  // wrote the file has merged. If this were reported the guard would be red on
  // every PR, which is the defect it exists to avoid.
  const fresh = trend({
    measures: {
      oracleVerified: { value: 97, direction: "unchanged", previous: 97 },
      geometryVerified: { value: 150, direction: "unchanged", previous: 150 },
    },
  });
  assert.deepEqual(treePureDiff(trend(), fresh), []);
});

test("treePureDiff: a series point naming a squashed-away SHA is not reported", () => {
  const fresh = trend({
    oracleSeries: [
      { date: "2026-09-08", version: "0.34.202", sha: "8b53446f", verified: 97 },
    ],
  });
  assert.deepEqual(treePureDiff(trend(), fresh), []);
});

test("treePureDiff: a changed detail census is reported", () => {
  const fresh = trend({
    detail: { inlineHexBySlug: { badge: 9 }, structuralCollapseKeys: ["a", "b"] },
  });
  const found = treePureDiff(trend(), fresh);
  assert.equal(found.length, 1);
  assert.match(found[0], /detail/);
});

test("treePureDiff: a measure that DISAPPEARS is reported, not silently skipped", () => {
  // Iterating the committed side alone would let a renamed measure vanish with
  // no complaint, which is absence not stating its cause.
  const fresh = trend({
    measures: { geometryVerified: { value: 150, direction: "better", previous: 99 } },
  });
  const found = treePureDiff(trend(), fresh);
  assert.equal(found.length, 1);
  assert.match(found[0], /oracleVerified/);
});

test("treePureDiff: a measure that APPEARS is reported too", () => {
  const fresh = trend({
    measures: {
      oracleVerified: { value: 97, direction: "better", previous: 87 },
      geometryVerified: { value: 150, direction: "better", previous: 99 },
      brandNew: { value: 5, direction: "unknown", previous: null },
    },
  });
  const found = treePureDiff(trend(), fresh);
  assert.equal(found.length, 1);
  assert.match(found[0], /brandNew/);
});

test("treePureDiff: sourcesLastChangedAt is commit-date derived, so it is exempt", () => {
  const fresh = trend({ meta: { sourcesLastChangedAt: "2026-09-09" } });
  assert.deepEqual(treePureDiff(trend(), fresh), []);
});
