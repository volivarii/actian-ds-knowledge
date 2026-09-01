#!/usr/bin/env node
"use strict";
// The shipped graph's component nodes must be exactly the union of component
// slugs across the deriver's registries, in both directions, naming the slug
// that diverged.
//
// 🚨 Deliberately a validate-manifest STEP rather than a test in `npm test`,
// for the reason already documented on the llms guard in that workflow: the
// sibling derive workflows run `npm test` BEFORE their auto-commit, and both are
// triggered by a registry change -- render-derive on components/dist/registries/**,
// guidelines-derive on components/dist/registries/dskit.json specifically.
//
// A sync lands registries in one commit and the regenerated graph in a later one
// (sync-from-figma commits the registries; graph-derive commits the graph), so
// between them HEAD legitimately holds more registry slugs than graph nodes. An
// assertion on that pair inside the suite fails mid-cascade and blocks those
// workflows from committing the dist they exist to produce. Measured on the
// 2026-09-01 sync: this comparison fails at the registries-only commit and passes
// once the graph commit lands.
//
// Note what this placement does NOT fix: on a fork PR the auto-commit is skipped,
// so a registry change never converges here either. That is a property of
// comparing a pair the cascade settles, not of where the comparison lives, and
// the pre-existing drift guard already fails there. Do not read this comment as
// a claim that moving a gate out of the suite makes it fork-safe.
//
// It reads the COMMITTED pair, both sides from HEAD, and runs BEFORE the graph
// drift guard. Both matter. Reading the working tree after a fresh derive would
// be tautological, and the tree copy is rewritten mid-run by any unconfined
// derive() (#624). Running after the drift guard would be worse than
// tautological: that guard exits 1 on a stale graph and aborts the job, so this
// would never run in the one case it exists to explain.
//
// Two different jobs live here, and they are worth telling apart:
//
//   - checkEveryListedRegistryIsCommitted / checkEveryCommittedRegistryIsRead are
//     NEW coverage. A committed kit the deriver never reads, or a listed kit that
//     vanished, produces no drift at all, so nothing else in the repo notices.
//   - the union and the collisions freshness are DIAGNOSTICS. The drift guard that
//     follows re-derives and diffs, and nothing between them touches the
//     registries, so it fails on the same divergence -- but only as "the artifact
//     is stale". These name the slug that moved.
//
// Do not read this file as a substitute for that guard.
var isDeepStrictEqual = require("node:util").isDeepStrictEqual;
var path = require("node:path");
var D = require("../graph/derive-graph.js");
var M = require("../lib/graph/model.js");
// The SAME committed-read leaf the tests use. This script used to carry its own
// copy of these two git calls; the copies had already drifted (one set maxBuffer,
// only one documented ls-tree-over-cat-file), which is the duplication this change
// exists to remove.
var CR = require("../lib/committed-read.js");

// 🚨 Never process.exit() after console.error here. stdout/stderr are async when
// they are pipes, which is what a CI runner provides, so exiting can truncate or
// drop the write still in flight -- and the worst case is precisely the one this
// script exists for: a full divergence prints ~614 missing plus ~614 extra ids,
// tens of KB, and a step whose entire value is that list logs part of it or none.
// Set the code and RETURN; node flushes and exits on its own.
var failed = false;
// Two shapes, one mechanism. `fail(lines)` prints and marks; `markFailed()` marks
// when the message was already printed above it. Both exist so no call site ever
// reaches for process.exit() -- which is the whole point of the note above, and
// why neither of them offers one.
function markFailed() {
  failed = true;
}
function fail(lines) {
  [].concat(lines).forEach(function (l) {
    console.error(l);
  });
  markFailed();
}
var committedExists = CR.committedExists;
var readJSON = CR.readCommittedJSON;
var committedJSONsIn = CR.committedJSONsIn;

// Every registry committed under components/dist/registries/ must be one the
// deriver reads. REGISTRY_FILES is itself a restatement -- the sync owns the real
// list as REGISTRY_KITS in sync-from-figma.js -- so a kit added there reaches disk
// while derive-graph never reads it, and NONE of its components reach the graph.
// The union check below cannot see that: it builds both sides from the same
// REGISTRY_FILES, so a kit neither side knows about is invisible to it.
//
// Here rather than in `npm test` for the same reason as the union check: it fires
// exactly when a sync lands a new kit registry, which is a registry-changing PR,
// and the sibling derive workflows run the suite before their auto-commit.
function checkEveryCommittedRegistryIsRead() {
  // Top-level *.json only, because that is where the producer puts kit
  // registries: sync-from-figma writes path.join(outputDir, "<kit>.json") at the
  // root, and the one nested artifact under this directory
  // (meta-kit/styles.json) is not a registry. Matching the producer beats
  // recursing and then hand-keeping a skip-list.
  // Directory DERIVED from the list, not restated. Relocating the registries and
  // updating registry-files.js correctly would otherwise leave this pointed at
  // the old path: it would find nothing and red the required check with "no
  // registries committed under components/dist/registries/" against a perfectly
  // consistent repo.
  var dirs = new Set(D.REGISTRY_FILES.map(path.dirname));
  if (dirs.size === 0) {
    throw new Error(
      "scripts/lib/registry-files.js is empty; there are no kit registries to check",
    );
  }
  if (dirs.size !== 1) {
    throw new Error(
      "registries span more than one directory (" +
        [...dirs].join(", ") +
        "); this check assumes a single one",
    );
  }
  var registriesDir = [...dirs][0] + "/";
  var committed = committedJSONsIn(registriesDir);
  if (committed.length === 0) {
    throw new Error("no registries committed under " + registriesDir);
  }
  var unread = committed.filter(function (rel) {
    return D.REGISTRY_FILES.indexOf(rel) === -1;
  });
  if (unread.length) {
    console.error(
      "Registry files the graph deriver never reads: " +
        unread.join(", ") +
        "\nAdd them to scripts/lib/registry-files.js — and note that is not the " +
        "only kit list in the repo: scripts/render/derive-canonical.js keeps its " +
        "own (deliberately ordered) one, tracked in #626 — plus " +
        "the trigger paths in .github/workflows/graph-derive.yml, or the graph " +
        "silently omits a whole kit.",
    );
    markFailed();
    return;
  }
}

// The committed collisions sidecar must equal a fresh detection over the committed
// registries. Same coupling as the union check and moved here for the same reason:
// a sync that adds an icon shadowing a name in another kit changes the collision
// set, so at the registries-only commit this pair is transiently unequal, and in
// `npm test` that would block the sibling derive workflows from committing the
// dist they exist to produce. (17 -> 24 -> 25 have all happened.)
//
// This is the assertion the graph drift guard cannot make on its own: if derive()
// stopped WRITING collisions.json, the committed copy would go stale against the
// registries with nothing to notice.
function checkCollisionsSidecarIsFresh(registries) {
  // Registries passed in, not re-read: readCommittedJSON spawns two git processes
  // per call (ls-tree, then show) over multi-hundred-KB JSON, and main() has
  // already read all three.
  //
  // Not filtered for absence: a registry listed but not committed is failed by
  // checkEveryListedRegistryIsCommitted, for the reason documented there.
  var kits = D.REGISTRY_FILES.map(function (rel, i) {
    return { kit: path.basename(rel, ".json"), reg: registries[i] };
  });
  var fresh = D.detectSlugCollisions(kits).slug_collisions;
  if (!committedExists("graph/dist/collisions.json")) {
    console.error(
      "graph/dist/collisions.json is not committed at HEAD; this check reads " +
        "the committed sidecar. Regenerate and commit it, or correct the path.",
    );
    markFailed();
    return;
  }
  var sidecar = readJSON("graph/dist/collisions.json");
  var committed = sidecar.slug_collisions;
  // Shape first. Without this, a renamed or dropped top-level key makes
  // `committed` undefined, the stringify comparison below still differs, and the
  // diagnostic then throws a TypeError on `.length` -- a raw stack trace in
  // exactly the case this function exists to report.
  if (!Array.isArray(committed)) {
    console.error(
      "graph/dist/collisions.json has no `slug_collisions` array (found: " +
        Object.keys(sidecar).join(", ") +
        "). The deriver's output shape changed, or the sidecar is not what this " +
        "check expects. Run `npm run derive:graph` and commit the result.",
    );
    markFailed();
    return;
  }
  // `fresh` is round-tripped through JSON first, so both sides have been through
  // the same serializer. detectSlugCollisions emits candidates as
  // {kit, key, nodeId} with key/nodeId possibly undefined -- keyless registry
  // entries are a documented degradation in derive-graph.js -- and writing the
  // sidecar DROPS an undefined property while the in-memory object keeps it.
  // isDeepStrictEqual counts {kit,nodeId} and {kit,key:undefined,nodeId} as
  // different, so without this a keyless entry whose slug collides across kits
  // would fail here forever, and `npm run derive:graph` could not clear it: the
  // re-derive writes the same key-dropped JSON.
  var freshNormalized = JSON.parse(JSON.stringify(fresh));
  // Structural, not stringified. `committed` carries the file's key order and
  // `fresh` the deriver's insertion order; they agree today only because
  // stableStringify (scripts/lib/dist-io.js) is plain JSON.stringify. The day it
  // sorts keys -- which its name invites -- a stringified compare would fail on
  // every run against a perfectly fresh sidecar, with no way to clear it.
  if (!isDeepStrictEqual(committed, freshNormalized)) {
    console.error(
      "graph/dist/collisions.json does not match a fresh detection over the " +
        "committed registries: committed " +
        committed.length +
        " entries, fresh " +
        fresh.length +
        ". Run `npm run derive:graph` and commit the result.",
    );
    // diffCollisions, not a second copy of it: the unit tests exercise that
    // function, and an inline duplicate here would leave the branches that
    // actually print in CI untested.
    var d = diffCollisions(committed, freshNormalized);
    if (d.onlyFresh.length) {
      console.error("  detected but not recorded: " + d.onlyFresh.join(", "));
    }
    if (d.onlyCommitted.length) {
      console.error(
        "  recorded but not detected: " + d.onlyCommitted.join(", "),
      );
    }
    if (d.changed.length) {
      console.error(
        "  same slug, different candidates (re-keyed upstream): " +
          d.changed.join(", "),
      );
    }
    if (d.reresolved.length) {
      console.error(
        "  same candidates, different resolved_to (kit order changed in " +
          "scripts/lib/registry-files.js): " +
          d.reresolved.join(", "),
      );
    }
    if (
      !d.onlyFresh.length &&
      !d.onlyCommitted.length &&
      !d.changed.length &&
      !d.reresolved.length
    ) {
      console.error(
        "  same slugs, same candidates, same resolved_to — so an entry gained " +
          "or lost a TOP-LEVEL field. detectSlugCollisions emits slug-sorted " +
          "output and the sidecar is written from it, so ordering alone cannot " +
          "reach here; a candidate-array reorder would have been reported above.",
      );
    }
    markFailed();
    return;
  }
}

// Every registry the deriver lists must be committed.
//
// Absence FAILS here, deliberately, even though derive() tolerates it. Tolerating
// it made a whole kit vanish silently: derive() skips the missing registry, the
// graph loses its slugs, the union builds `expected` without them, the freshness
// check re-detects over the same reduced set, and the magnitude bound still passes
// (dskit u fmkit = 586, inside 400..1000). Every gate green with a kit gone --
// which the old `=== 614` did catch.
//
// Safe to be strict HERE and not in `npm test`: this step does not gate the derive
// workflows' auto-commit, and retiring a kit is a deliberate edit that should
// update REGISTRY_FILES in the same change.
//
// Runs FIRST, before anything reads a registry, or the read dies with a raw
// `git show ... does not exist in HEAD` instead of this diagnostic.
function checkEveryListedRegistryIsCommitted() {
  var missing = D.REGISTRY_FILES.filter(function (rel) {
    return !committedExists(rel);
  });
  if (missing.length) {
    console.error(
      "listed in REGISTRY_FILES but not committed at HEAD: " +
        missing.join(", ") +
        "\nderive() skips a missing registry silently, so the graph would simply " +
        "lose that kit's components. Retire it from REGISTRY_FILES in the same " +
        "change, or restore the file.",
    );
    markFailed();
    return;
  }
}

// Order-of-magnitude bounds on cross-kit slug collisions.
//
// HERE rather than in `npm test`, for the reason that governs this whole file: a
// bound over registry-derived data reds the suite, and the sibling derive
// workflows run the suite before their auto-commit, so it would block them from
// committing the dist they exist to produce.
//
// FLOOR: a collision is only recorded when candidates disagree on `key`, so a
// regression in how keys are carried does not make collisions WRONG, it makes
// them vanish. Zero is also legitimate though -- every collision today is a
// dskit<->fmkit name overlap, so retiring a kit or finishing the cross-kit
// de-duplication empties the set -- which is why the floor only applies while
// more than one kit is present, and is far below today's 25.
//
// CEILING: a share of registry entries, not an absolute, so a fourth kit does not
// trip it by arriving. Measured trip point: (25+N)/(639+N) < 0.25 gives N = 180
// wholly-shadowing new slugs, against the ~145-icon import that counts as an
// ordinary nightly -- 1.24x of headroom. Narrow; see #625.
function checkCollisionMagnitude(registries) {
  var kits = D.REGISTRY_FILES.map(function (rel, i) {
    return { kit: path.basename(rel, ".json"), reg: registries[i] };
  });
  if (kits.length < 2) return; // collisions need two kits to exist at all
  var found = D.detectSlugCollisions(kits).slug_collisions.length;
  var entries = kits.reduce(function (n, k) {
    return n + Object.keys(k.reg.components || {}).length;
  }, 0);
  if (found <= 3 || found >= entries * 0.25) {
    fail([
      "cross-registry slug collisions outside the expected order of magnitude: " +
        found +
        " of " +
        entries +
        " registry entries.",
      found <= 3
        ? "  Near zero usually means a key-carrying regression: a collision is only " +
          "recorded when candidates disagree on `key`, so keys arriving empty or " +
          "identical makes them vanish rather than go wrong. If instead a kit was " +
          "retired or the cross-kit de-duplication landed, this bound is what needs " +
          "updating."
        : "  A share this high means a kit is shadowing another's vocabulary " +
          "wholesale, which is the identity ambiguity the sidecar exists to surface.",
    ]);
  }
}

function main() {
  // Each check reports and sets `failed`; main stops between them so a later
  // check cannot bury an earlier one's diagnostic.
  checkEveryListedRegistryIsCommitted();
  if (failed) return;
  checkEveryCommittedRegistryIsRead();
  if (failed) return;
  // Union BEFORE collisions freshness: on the common failure -- a sync landed
  // registries and the graph is not yet regenerated, and the added icons also
  // shadow existing names -- both fail, and the union's "which component slug
  // moved" is the headline this step was added to give. Exiting on the collisions
  // diff first would hide it.
  var expected = new Set();
  var registries = D.REGISTRY_FILES.map(readJSON);
  D.REGISTRY_FILES.forEach(function (rel, i) {
    var slugs = Object.keys(registries[i].components || {});
    if (slugs.length === 0) {
      throw new Error("registry contributes no components: " + rel);
    }
    slugs.forEach(function (slug) {
      expected.add(M.nodeId("component", slug));
    });
  });

  if (!committedExists("graph/dist/graph.json")) {
    console.error(
      "graph/dist/graph.json is not committed at HEAD; this check reads the " +
        "committed pair. Regenerate and commit the graph, or correct the path.",
    );
    markFailed();
    return;
  }
  var g = readJSON("graph/dist/graph.json");
  var actual = new Set(
    g.nodes
      .filter(function (n) {
        return n.type === "component";
      })
      .map(function (n) {
        return n.id;
      }),
  );

  // diffSets, not a second copy: same reason as diffCollisions above.
  var u = diffSets(expected, actual);
  var missing = u.missing;
  var extra = u.extra;

  if (missing.length || extra.length) {
    if (missing.length) {
      console.error(
        "Registry components missing from the graph (" +
          missing.length +
          "): " +
          missing.join(", "),
      );
    }
    if (extra.length) {
      console.error(
        "Graph component nodes with no registry entry (" +
          extra.length +
          "): " +
          extra.join(", "),
      );
    }
    console.error(
      "The graph is derived from the registries, so this means the committed " +
        "graph was not regenerated after a registry change. Run `npm run " +
        "derive:graph` and commit the result.",
    );
    markFailed();
    return;
  }
  if (failed) return;
  checkCollisionsSidecarIsFresh(registries);
  if (failed) return;
  checkCollisionMagnitude(registries);
  if (failed) return;
  // Logged last, after every check. Printing "OK" before the final check meant a
  // stale sidecar produced a green line at the top of a failing step -- the log
  // shape this repo treats as a false all-clear.
  console.log(
    "graph/registry union OK: " +
      expected.size +
      " component nodes; collisions sidecar fresh.",
  );
}

// Pure, and exported for tests. The three assertions this script absorbed all ran
// in `npm test` on every PR; the script itself cannot (it compares a pair the
// derive cascade settles). Without these, the diagnostic branches below would run
// for the first time on the day they are needed, and a typo there would surface
// as a TypeError instead of the message it exists to print.
function diffSets(expected, actual) {
  return {
    missing: [...expected]
      .filter(function (id) {
        return !actual.has(id);
      })
      .sort(),
    extra: [...actual]
      .filter(function (id) {
        return !expected.has(id);
      })
      .sort(),
  };
}

function diffCollisions(committed, fresh) {
  var bySlug = function (list) {
    var m = new Map();
    list.forEach(function (x) {
      m.set(x.slug, x);
    });
    return m;
  };
  var f = bySlug(fresh);
  var c = bySlug(committed);
  return {
    onlyFresh: [...f.keys()]
      .filter(function (x) {
        return !c.has(x);
      })
      .sort(),
    onlyCommitted: [...c.keys()]
      .filter(function (x) {
        return !f.has(x);
      })
      .sort(),
    // Split by WHICH field moved. These were one bucket labelled "different
    // candidates", which misdirected the author whenever only resolved_to moved
    // -- and that happens on its own whenever the kit ORDER in registry-files.js
    // changes, since resolved_to is candidates[0].kit.
    changed: [...f.keys()]
      .filter(function (x) {
        return (
          c.has(x) &&
          !isDeepStrictEqual(c.get(x).candidates, f.get(x).candidates)
        );
      })
      .sort(),
    reresolved: [...f.keys()]
      .filter(function (x) {
        return (
          c.has(x) &&
          isDeepStrictEqual(c.get(x).candidates, f.get(x).candidates) &&
          c.get(x).resolved_to !== f.get(x).resolved_to
        );
      })
      .sort(),
  };
}

// Every failure path INSIDE main() reports through console.error + exit 1; a bare
// throw would print a raw Node stack, which is the diagnostic quality this script
// exists to replace, so the few invariant throws are funnelled here too.
//
// Not module load, though: the requires above run before this, so a missing
// dependency still prints a raw MODULE_NOT_FOUND. That is fine in CI, where deps
// are installed, and wrapping the requires would cost more legibility than it buys.
if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(
      "validate-graph-registry-union failed: " +
        (err && err.message ? err.message : err),
    );
    failed = true;
  }
  // exitCode, not exit(): see the note beside `fail` above.
  if (failed) process.exitCode = 1;
}

module.exports = { diffSets: diffSets, diffCollisions: diffCollisions };
