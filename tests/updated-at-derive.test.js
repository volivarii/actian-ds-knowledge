"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var os = require("os");
var cp = require("child_process");
var derive = require("../scripts/components/derive-guidelines.js");

function runGit(cwd, args) {
  cp.execFileSync("git", args, { cwd: cwd, stdio: "pipe" });
}

function makeRepo() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), "kn-repo-"));
  runGit(root, ["init", "-q"]);
  runGit(root, ["config", "user.email", "t@t"]);
  runGit(root, ["config", "user.name", "T"]);
  runGit(root, ["config", "commit.gpgsign", "false"]);
  return root;
}

test("deriveGitMtime returns ISO of last commit touching components/src/<slug>/", function () {
  var root = makeRepo();
  fs.mkdirSync(path.join(root, "components", "src", "button"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, "components", "src", "button", "_meta.yml"),
    "component: Button\ncategory: action\ndomains: {}\n",
  );
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-q", "-m", "init"]);
  var iso = derive.deriveGitMtime(root, "button");
  // Should look like 2026-...T...Z or +offset, not empty.
  assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

test("deriveGitMtime returns null when source dir does not exist (synthesized component)", function () {
  var root = makeRepo();
  // No components/src/foo/ dir → null.
  fs.mkdirSync(path.join(root, "components", "src"), { recursive: true });
  runGit(root, ["commit", "--allow-empty", "-q", "-m", "init"]);
  assert.equal(derive.deriveGitMtime(root, "foo"), null);
});

test("deriveGitMtime returns null when git history is empty (no commits touching the dir)", function () {
  var root = makeRepo();
  // Create dir but don't commit it.
  fs.mkdirSync(path.join(root, "components", "src", "lonely"), {
    recursive: true,
  });
  fs.writeFileSync(path.join(root, "components", "src", "lonely", "x.txt"), "");
  // Initial commit elsewhere so the repo has a HEAD but the dir is untracked.
  fs.writeFileSync(path.join(root, "README.md"), "x");
  runGit(root, ["add", "README.md"]);
  runGit(root, ["commit", "-q", "-m", "init"]);
  // Untracked dir → no log entry → null.
  assert.equal(derive.deriveGitMtime(root, "lonely"), null);
});
