"use strict";

// The baseline a ratchet compares against is the artifact at the MERGE BASE, not
// the one in the working tree. render-derive.yml regenerates the committed dist
// before the suite runs, so a working-tree comparison is new-against-new and
// always passes. fidelity-check.js carries the same warning about its own
// baseline, for the same reason.
//
// Resolving the literal ref name `origin/main` does NOT work everywhere.
// validate-manifest.yml runs `npm test` on fork PRs with
// `repository: head.repo.full_name`, so `origin` is the FORK, and under
// actions/checkout's narrow refspec a `git fetch origin main` populates
// FETCH_HEAD without ever creating `refs/remotes/origin/main`. An outside
// contributor's PR then hit a hard failure with nothing wrong.
// `.github/workflows/vendored-source-bump.yml` solved this by fetching the base
// ref and merge-basing against FETCH_HEAD; that is the mechanism used here.
//
// The remote-tracking ref is tried FIRST, and the fetch is a genuine FALLBACK
// reached only when that yields nothing: a `git fetch` on every `npm test` run
// is slow and non-hermetic, and a developer's clone has fetched at least once.
// Building both candidates up front and looping over them ran the fetch
// unconditionally, which is the same defect in a shape that reads like a fast
// path, so the ordering is expressed as control flow rather than as list order.
//
// This module exists because two ratchets need the same resolution and the
// second copy of a subtlety like the fork-PR fetch is how a repo ends up with
// one of them fixed and the other quietly broken.

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

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

function baseRef() {
  return process.env.GITHUB_BASE_REF || "main";
}

function showAt(mergeBase, rel) {
  return tryGit(["show", mergeBase + ":" + rel], {
    maxBuffer: 32 * 1024 * 1024,
  });
}

// Read one repo-relative JSON file as it stood at the merge base with the base
// branch.
//
// The two ways this can come back empty are reported separately, because they
// call for opposite responses. `mergeBase: null` means git could not tell us
// what this branch forked from, which is an environment failure and must never
// read as a pass. `mergeBase` set with `json: null` means the merge base simply
// does not carry that file yet, which is the ordinary state of the commit that
// INTRODUCES an artifact, and only that commit.
function jsonAtMergeBase(rel) {
  const ref = baseRef();

  // Fast path, and it stays offline: no network call is made at all unless this
  // fails to produce a usable baseline.
  if (tryGit(["rev-parse", "--verify", "--quiet", "origin/" + ref])) {
    const mergeBase = tryGit(["merge-base", "origin/" + ref, "HEAD"]);
    if (mergeBase) return read(mergeBase, "origin/" + ref, rel);
  }
  // Fallback only. On a fork PR `origin/<ref>` does not exist and cannot be made
  // to exist under actions/checkout's narrow refspec, but the fetch still
  // populates FETCH_HEAD, which is enough to merge-base against.
  if (tryGit(["fetch", "--no-tags", "--quiet", "origin", ref]) !== null) {
    const mergeBase = tryGit(["merge-base", "FETCH_HEAD", "HEAD"]);
    if (mergeBase) return read(mergeBase, "FETCH_HEAD", rel);
  }
  return { mergeBase: null, ref: null, baseRef: ref, json: null, path: rel };
}

function read(mergeBase, ref, rel) {
  const raw = showAt(mergeBase, rel);
  let json = null;
  if (raw !== null) {
    try {
      json = JSON.parse(raw);
    } catch (e) {
      // A corrupt baseline is not a pass and it is not an absence either: report
      // it by name so the caller can fail on it rather than treating it as the
      // first-landing case.
      return {
        mergeBase: mergeBase,
        ref: ref,
        baseRef: baseRef(),
        json: null,
        corrupt: true,
        path: rel,
      };
    }
  }
  return {
    mergeBase: mergeBase,
    ref: ref,
    baseRef: baseRef(),
    json: json,
    corrupt: false,
    path: rel,
  };
}

// The message every caller needs when `mergeBase` came back null: the same
// diagnosis, stated once.
function unresolvedMessage(who, rel) {
  return (
    who +
    ": could not resolve the merge-base copy of " +
    rel +
    " (neither origin/" +
    baseRef() +
    " nor the fallback `git fetch` produced a merge base), so there is " +
    "nothing to compare against. Fix connectivity/git history rather than " +
    "treating this as a pass."
  );
}

module.exports = {
  jsonAtMergeBase: jsonAtMergeBase,
  unresolvedMessage: unresolvedMessage,
};
