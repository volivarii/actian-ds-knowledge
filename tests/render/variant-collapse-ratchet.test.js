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

// Escape hatch, the same shape the coverage gate uses for
// --accept-coverage-loss="<why>" and the emptiness gate uses for its EXEMPT map:
// a rise is allowed only by naming the slug with a reason, so the decision to
// ship duplicate cells reads like a decision in the diff. A rise can be
// legitimate, since a redesign can genuinely make two values render alike and
// the renderer must not invent a difference the design system does not have.
// It may not be silent.
//
// Each key must still name a real slug in the contract, asserted below, so a
// key left behind by a rename cannot quietly cover a different regression later.
const ACCEPTED_RISE = {
  // "some-slug": "why this component's values legitimately render alike now",
};

function hasOwn(o, k) {
  return Object.prototype.hasOwnProperty.call(o, k);
}

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

function tryGit(args, extra) {
  try {
    return execFileSync(
      "git",
      args,
      Object.assign(
        {
          cwd: REPO_ROOT,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
        extra || {},
      ),
    ).trim();
  } catch (e) {
    return null;
  }
}

// The baseline is the contract at the merge base, not at HEAD. render-derive.yml
// regenerates the committed contract before the suite runs, so comparing against
// the working tree would be new-against-new and would always pass.
// fidelity-check.js:1257 carries the same warning about its own baseline.
//
// Resolving the literal ref name `origin/main` does NOT work everywhere.
// validate-manifest.yml runs `npm test` on fork PRs with
// `repository: head.repo.full_name`, so `origin` is the FORK, and under
// actions/checkout's narrow refspec a `git fetch origin main` populates
// FETCH_HEAD without ever creating `refs/remotes/origin/main`. An outside
// contributor's PR then hit the hard failure below with nothing wrong.
// `.github/workflows/vendored-source-bump.yml` solved this by fetching the base
// ref and merge-basing against FETCH_HEAD; that is the mechanism used here.
//
// The remote-tracking ref is tried FIRST, and the fetch is a genuine FALLBACK
// reached only when that yields nothing: a `git fetch` on every `npm test` run
// is slow and non-hermetic, and a developer's clone has fetched at least once.
// Building both candidates up front and looping over them ran the fetch
// unconditionally, which is the same defect in a shape that reads like a fast
// path, so the ordering is expressed as control flow rather than as list order.
function contractAtMergeBaseWith(ref) {
  const mergeBase = tryGit(["merge-base", ref, "HEAD"]);
  if (!mergeBase) return null;
  const raw = tryGit(["show", mergeBase + ":" + CONTRACT_REL], {
    maxBuffer: 32 * 1024 * 1024,
  });
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    // A corrupt baseline is not a pass: report nothing so the caller falls
    // through to its next candidate, and to the loud failure if there is none.
    return null;
  }
}

function baselineContract() {
  const baseRef = process.env.GITHUB_BASE_REF || "main";
  // Fast path, and it stays offline: no network call is made at all unless this
  // fails to produce a usable baseline.
  if (tryGit(["rev-parse", "--verify", "--quiet", "origin/" + baseRef])) {
    const local = contractAtMergeBaseWith("origin/" + baseRef);
    if (local) return local;
  }
  // Fallback only. On a fork PR `origin/<baseRef>` does not exist and cannot be
  // made to exist under actions/checkout's narrow refspec, but the fetch still
  // populates FETCH_HEAD, which is enough to merge-base against.
  if (tryGit(["fetch", "--no-tags", "--quiet", "origin", baseRef]) !== null) {
    const fetched = contractAtMergeBaseWith("FETCH_HEAD");
    if (fetched) return fetched;
  }
  return null;
}

// Baseline at the merge base when this ratchet landed: 57 of 236 identity-axis
// values collapse (24.2%), across 19 fully flat axes. State axes, excluded here,
// collapse at 51.6%. Both re-derived rather than restated.

test("variant collapse does not increase, per slug or in total", function () {
  const base = baselineContract();
  if (!base) {
    // A missing baseline is a real condition (neither the remote-tracking ref
    // nor the fallback fetch produced a merge base carrying the contract) but it
    // must fail loudly rather than pass silently: a silent return here would
    // mean the ratchet asserted nothing while still going green.
    assert.fail(
      "variant-collapse-ratchet: could not resolve the merge-base contract " +
        "(neither origin/" +
        (process.env.GITHUB_BASE_REF || "main") +
        " nor the fallback `git fetch` produced a merge base carrying " +
        CONTRACT_REL +
        "), so there is nothing to compare against. Fix connectivity/git " +
        "history rather than treating this as a pass.",
    );
  }
  const before = collapseBySlug(base);
  const after = collapseBySlug(fresh);

  const worse = Object.keys(after)
    .filter(function (slug) {
      return (
        hasOwn(before, slug) &&
        after[slug] > before[slug] &&
        !hasOwn(ACCEPTED_RISE, slug)
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

  // Headroom, so the total never reds for something the per-slug check has
  // already allowed. Two sources:
  //
  //   1. Slugs the baseline did not have. A newly added component's collapse is
  //      a NEW FACT, not a regression, and the per-slug check above deliberately
  //      skips it. 19 of the current identity axes are fully flat, so a Figma
  //      sync adding a component with a flat axis is the common case, and with
  //      zero headroom it would red a required check with no documented remedy.
  //   2. Rises named in ACCEPTED_RISE, which were allowed with a reason.
  //
  // Slugs that DISAPPEAR need no headroom: they only lower the total.
  const headroom = Object.keys(after).reduce(function (a, slug) {
    if (!hasOwn(before, slug)) return a + after[slug];
    if (hasOwn(ACCEPTED_RISE, slug) && after[slug] > before[slug]) {
      return a + (after[slug] - before[slug]);
    }
    return a;
  }, 0);

  assert.deepEqual(
    worse,
    [],
    "these components now render more variant values identically than they did at " +
      "the merge base, so the gallery shows duplicate cells for values the design " +
      "system distinguishes: " +
      JSON.stringify(worse) +
      ". Give the value its own rendering in ds-html-map.js, or, if the values " +
      "really do render alike now, add the slug to ACCEPTED_RISE with a reason.",
  );
  assert.ok(
    totalAfter - headroom <= totalBefore,
    "identity-axis variant collapse rose from " +
      totalBefore +
      " to " +
      totalAfter +
      " values rendering identically to a sibling (" +
      headroom +
      " of the rise is already allowed: slugs absent from the baseline, plus " +
      "any named in ACCEPTED_RISE). Give the collapsed values their own " +
      "rendering, or name the slug in ACCEPTED_RISE with a reason.",
  );
  assert.ok(
    Object.keys(after).length > 0,
    "this ratchet compared no slugs, so it would pass vacuously",
  );
});

function unknownSlugs(map, contract) {
  return Object.keys(map).filter(function (slug) {
    return !hasOwn(contract.slugs || {}, slug);
  });
}

test("every accepted rise still names a real slug", function () {
  assert.deepEqual(
    unknownSlugs(ACCEPTED_RISE, fresh),
    [],
    "accepted rises the contract no longer has: " +
      JSON.stringify(unknownSlugs(ACCEPTED_RISE, fresh)),
  );
  // ACCEPTED_RISE is empty at landing, so the assertion above cannot fail on its
  // own contents and would read as an all-clear from a broken predicate just as
  // easily as from an empty map. Run the same predicate over a fabricated key to
  // prove it CAN fail.
  assert.deepEqual(
    unknownSlugs({ "no-such-component": "fabricated" }, fresh),
    ["no-such-component"],
    "the staleness predicate must report a slug the contract does not have",
  );
});
