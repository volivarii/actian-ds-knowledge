"use strict";
// Read a file as COMMITTED at HEAD, rather than as it currently sits in the tree.
//
// Why anything needs this: derive() takes no output path and writes graph/dist/
// under the repo root. Several test files call it unconfined, and `npm test` runs
// files in parallel, so an assertion reading one of those artifacts from the
// working tree races a rewrite -- a real divergence can be HEALED before the
// assertion sees it. In CI it is worse: validate-manifest runs `derive:graph`
// long before `npm test`, so the tree copy there is never the shipped artifact.
// Confining derive() is the better fix and is tracked in #624.
//
// A dependency-free leaf on purpose: gates that must not load heavy modules
// (validate-registries runs under continue-on-error, where a require-time throw
// reads as "all schemas valid") can require this safely.
var execFileSync = require("node:child_process").execFileSync;
var path = require("node:path");
var ROOT = path.resolve(__dirname, "..", "..");

// ls-tree, NOT `cat-file -e HEAD:<path>`. cat-file exits 128 for a path absent at
// HEAD -- the same class it uses for "git failed" -- so absence could not be told
// apart from a broken environment, and the branch reporting it was dead: the
// function threw a raw stack in precisely the case it exists to name. ls-tree
// exits 0 either way and answers with stdout, so a genuine git failure still
// throws rather than being reported as a missing file.
function committedExists(rel) {
  // Asks whether a BLOB is there, not merely an entry. With --name-only a
  // committed DIRECTORY also prints, so a directory path returned true, walked
  // past readCommittedJSON's named error, and died in JSON.parse on git's tree
  // listing -- the raw stack that error exists to prevent.
  var out = execFileSync("git", ["ls-tree", "HEAD", "--", rel], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return /^\d+ blob /.test(out.trim());
}

function readCommittedJSON(rel) {
  // Named up front rather than letting git fail: a relocated or not-yet-committed
  // artifact would otherwise surface as a raw child_process stack trace.
  if (!committedExists(rel)) {
    throw new Error(
      "not committed at HEAD: " +
        rel +
        " (a gate reads the committed artifact; regenerate and commit it, or " +
        "correct the path)",
    );
  }
  // execFileSync, not execSync: no shell, so a path with a space or a glob
  // character cannot truncate the command or expand against the CWD.
  return JSON.parse(
    execFileSync("git", ["show", "HEAD:" + rel], {
      cwd: ROOT,
      maxBuffer: 64 * 1024 * 1024,
      encoding: "utf8",
    }),
  );
}

// Top-level *.json committed under a directory.
function committedJSONsIn(dirRel) {
  // ls-tree without a trailing slash names the DIRECTORY ENTRY rather than
  // listing it, and a .json filter then drops it and returns [] -- silently
  // vacuous for any caller lacking a non-emptiness guard.
  var dir = dirRel.replace(/\/?$/, "/");
  // -z with core.quotePath=false: by default git C-quotes any path outside plain
  // ASCII ("…/\303\251kit.json"), which would fail the .json test and be dropped
  // SILENTLY -- so a committed kit the deriver never reads would pass this gate
  // vacuously, which is the one thing it exists to catch. NUL-delimited output
  // also removes the newline-in-filename case.
  // Full records, not --name-only: a committed DIRECTORY also prints, so a tree
  // named "<something>.json" would come back as a file and red the caller's gate
  // against a consistent repo -- the same blob-vs-tree gap committedExists above
  // was hardened for.
  var out = execFileSync(
    "git",
    ["-c", "core.quotePath=false", "ls-tree", "-z", "HEAD", "--", dir],
    { cwd: ROOT, encoding: "utf8" },
  );
  return out
    .split("\0")
    .filter(function (rec) {
      return rec !== "";
    })
    .map(function (rec) {
      // "<mode> SP <type> SP <sha> TAB <path>"
      var tab = rec.indexOf("\t");
      return {
        type: rec.slice(0, tab).split(" ")[1],
        path: rec.slice(tab + 1),
      };
    })
    .filter(function (e) {
      return e.type === "blob" && e.path.endsWith(".json");
    })
    .map(function (e) {
      return e.path;
    })
    .sort();
}

module.exports = {
  committedExists: committedExists,
  readCommittedJSON: readCommittedJSON,
  committedJSONsIn: committedJSONsIn,
};
