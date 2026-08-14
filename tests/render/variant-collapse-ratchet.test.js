"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CONTRACT_REL = "components/render/dist/render-contract.json";
// The committed dist is stale by construction on a branch that has not yet run
// its own derive: derive in process instead of requiring the file on disk, so
// this measures what the renderer produces NOW against what was committed at
// the merge base, regardless of whether the dist has been regenerated yet.
const { deriveContract } = require(
  path.join(REPO_ROOT, "scripts", "render", "derive-contract.js"),
);
const fresh = deriveContract();

// State axes are excluded and only reported. Roughly half of their values collapse,
// but a static fragment cannot show hover or focus without forced-state classes,
// so gating them would fail on a limitation of the medium rather than a defect.
const STATE_AXIS = /^(state|states)$/i;

function collapseBySlug(contract) {
  const out = {};
  Object.keys(contract.slugs || {}).forEach(function (slug) {
    let n = 0;
    const variants = contract.slugs[slug].variants || {};
    Object.keys(variants).forEach(function (axis) {
      if (STATE_AXIS.test(axis.replace(/[^a-z]/gi, ""))) return;
      n += Object.keys(variants[axis].rendersAs || {}).length;
    });
    out[slug] = n;
  });
  return out;
}

// The baseline is the contract at the merge base, not at HEAD. render-derive.yml
// regenerates the committed contract before the suite runs, so comparing against
// the working tree would be new-against-new and would always pass.
// fidelity-check.js:1257 carries the same warning about its own baseline.
//
// Resolve origin/main locally first and only fetch as a fallback: a `git fetch`
// on every `npm test` run is slow and non-hermetic, and the ref is already
// present in the ordinary case (this repo's CI checks out with history, and a
// developer's clone has fetched at least once).
function baselineContract() {
  let mergeBase;
  try {
    try {
      execFileSync("git", ["rev-parse", "--verify", "--quiet", "origin/main"], {
        cwd: REPO_ROOT,
        stdio: ["ignore", "ignore", "ignore"],
      });
    } catch (e) {
      execFileSync("git", ["fetch", "--quiet", "origin", "main"], {
        cwd: REPO_ROOT,
      });
    }
    mergeBase = execFileSync("git", ["merge-base", "origin/main", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
  } catch (e) {
    return null;
  }
  try {
    return JSON.parse(
      execFileSync("git", ["show", mergeBase + ":" + CONTRACT_REL], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      }),
    );
  } catch (e) {
    return null;
  }
}

// Baseline at the merge base when this ratchet landed: 57 of 236 identity-axis
// values collapse (24.2%), across 19 fully flat axes. State axes, excluded here,
// collapse at 51.6%. Both re-derived rather than restated.

test("variant collapse does not increase, per slug or in total", function () {
  const base = baselineContract();
  if (!base) {
    // A missing baseline is a real condition (no origin/main ref locally and the
    // fallback fetch also failed) but it must fail loudly rather than pass
    // silently: a silent return here would mean the ratchet asserted nothing
    // while still going green.
    assert.fail(
      "variant-collapse-ratchet: could not resolve the merge-base contract " +
        "(origin/main did not resolve locally and the fallback `git fetch` " +
        "also failed), so there is nothing to compare against. Fix " +
        "connectivity/git history rather than treating this as a pass.",
    );
    return;
  }
  const before = collapseBySlug(base);
  const after = collapseBySlug(fresh);

  const worse = Object.keys(after)
    .filter(function (slug) {
      return (
        Object.prototype.hasOwnProperty.call(before, slug) &&
        after[slug] > before[slug]
      );
    })
    .map(function (slug) {
      return slug + ": " + before[slug] + " -> " + after[slug];
    });

  const sum = function (o) {
    return Object.keys(o).reduce(function (a, k) {
      return a + o[k];
    }, 0);
  };
  const totalBefore = sum(before);
  const totalAfter = sum(after);

  assert.deepEqual(
    worse,
    [],
    "these components now render more variant values identically than they did at " +
      "the merge base, so the gallery shows duplicate cells for values the design " +
      "system distinguishes: " +
      JSON.stringify(worse),
  );
  assert.ok(
    totalAfter <= totalBefore,
    "identity-axis variant collapse rose from " +
      totalBefore +
      " to " +
      totalAfter +
      " values rendering identically to a sibling",
  );
  assert.ok(
    Object.keys(after).length > 0,
    "this ratchet compared no slugs, so it would pass vacuously",
  );
});
