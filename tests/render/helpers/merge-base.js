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
  // The best empty answer seen so far, kept so the caller learns WHICH merge
  // base lacked the file rather than being told none resolved.
  let empty = null;

  // Fast path, and it stays offline: no network call is made at all unless this
  // fails to produce a usable baseline.
  if (tryGit(["rev-parse", "--verify", "--quiet", "origin/" + ref])) {
    const mergeBase = tryGit(["merge-base", "origin/" + ref, "HEAD"]);
    if (mergeBase) {
      const local = read(mergeBase, "origin/" + ref, rel);
      if (endsTheSearch(local)) return local;
      // Resolved, but the file is not in it. That is exactly what a stale local
      // `origin/<ref>` produces, and the fetch below is the recovery: an earlier
      // version returned here, so a developer who had not fetched since the
      // artifact landed got a hard `npm test` failure that a fetch would have
      // healed. A corrupt parse does NOT come here; it is a real fault and it
      // ends the search above.
      empty = local;
    }
  }
  // Fallback, and the recovery path. On a fork PR `origin/<ref>` does not exist
  // and cannot be made to exist under actions/checkout's narrow refspec, but the
  // fetch still populates FETCH_HEAD, which is enough to merge-base against.
  if (tryGit(["fetch", "--no-tags", "--quiet", "origin", ref]) !== null) {
    const mergeBase = tryGit(["merge-base", "FETCH_HEAD", "HEAD"]);
    if (mergeBase) {
      const fetched = read(mergeBase, "FETCH_HEAD", rel);
      if (endsTheSearch(fetched)) return fetched;
      // The fetched merge base is at least as new as the local one, so it is the
      // more accurate subject for the failure message.
      empty = fetched;
    }
  }
  return (
    empty || { mergeBase: null, ref: null, baseRef: ref, json: null, path: rel }
  );
}

// A usable baseline ends the search, and so does a corrupt one: corruption is a
// fault to report, never a reason to go looking for a baseline somewhere else. A
// merge base that simply does not carry the file ends nothing.
function endsTheSearch(result) {
  return Boolean(result.json) || Boolean(result.corrupt);
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

// Does this branch's own history ADD the file, i.e. is the file missing from the
// merge base because this branch introduces it?
//
// The distinction matters because it is the only honest reason to accept a
// baseline that is not at the merge base. A branch that does not add the file
// and does not find it at the merge base is looking at a merge base older than
// the artifact, which happens for real: render-derive.yml checks out
// `head.repo.full_name`, so on a fork PR `origin` is the FORK, and a
// contributor whose fork's default branch is behind gets exactly that. Treating
// the two the same would let a stale fork compare a fresh derive against its own
// output forever.
function addedSince(mergeBase, rel) {
  const log = tryGit([
    "log",
    "--diff-filter=A",
    "--format=%H",
    mergeBase + "..HEAD",
    "--",
    rel,
  ]);
  return Boolean(log);
}

// Why there is no baseline, in the caller's words. Three different conditions
// reach one message shape, and saying "could not resolve the merge base" about a
// merge base that resolved fine sends the reader to look at connectivity when
// the real answer is that the commit simply does not carry the file.
function describeMissing(who, at) {
  if (!at.mergeBase) {
    return (
      who +
      ": could not resolve a merge base with " +
      at.baseRef +
      " (neither origin/" +
      at.baseRef +
      " nor the fallback `git fetch` produced one), so there is nothing to " +
      "compare " +
      at.path +
      " against. Fix connectivity/git history rather than treating this as a " +
      "pass."
    );
  }
  if (at.corrupt) {
    return (
      who +
      ": the copy of " +
      at.path +
      " at merge base " +
      at.mergeBase +
      " is not parseable JSON, so there is no baseline. A corrupt baseline is " +
      "not a pass."
    );
  }
  return (
    who +
    ": merge base " +
    at.mergeBase +
    " does not carry " +
    at.path +
    ", so there is no baseline to compare against. The usual cause is a merge " +
    "base older than the file, which a stale fork produces: merge " +
    at.baseRef +
    " into this branch. Comparing against the working tree instead would " +
    "measure this branch against its own output."
  );
}

// Kept as the narrow alias for the first of those three, so a caller that only
// ever fails on an unresolvable merge base reads as such.
function unresolvedMessage(who, rel) {
  return describeMissing(who, {
    mergeBase: null,
    baseRef: baseRef(),
    path: rel,
  });
}

module.exports = {
  jsonAtMergeBase: jsonAtMergeBase,
  addedSince: addedSince,
  describeMissing: describeMissing,
  unresolvedMessage: unresolvedMessage,
  // Exported so the fall-through rule is testable on its own: which of the two
  // empty answers keeps looking is the whole of the recovery path.
  endsTheSearch: endsTheSearch,
};
