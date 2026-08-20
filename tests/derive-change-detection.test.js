"use strict";

// Guard: no workflow may DECIDE "did anything change" with `git diff`.
//
// WHY
//
// `git diff` reports only files git already TRACKS. A regeneration that ADDS a
// file is invisible to it, so the step logs "No dist changes after
// regeneration", and the bump, the auto-commit and therefore the tag never
// happen. Consumers pull by tag, so that is "no bump, no tag, no consumer",
// reached by a route nobody walks until a per-slug collection gains its first
// new leaf.
//
// Real incident (2026-08-19, knowledge #574): adding one recipe for an
// already-existing pattern regenerated exactly one new file,
// app-context/dist/recipes/right-sliding-drawer.json, and nothing else. The
// required check then stayed red permanently, because the parity test wanted
// the dist leaf the derive had just declined to commit. The two recipes that
// shipped before it only bumped because their PRs also touched a TRACKED file,
// so the diff was non-empty for an unrelated reason.
//
// WHAT THE CORRECT FORM IS, and why all three parts are asserted
//
//   CHANGED="$(git status --porcelain --untracked-files=all -- <paths>)" || {
//     echo "::error::git status failed ..."
//     exit 1
//   }
//   if [ -z "$CHANGED" ]; then ...
//
//  1. `git status --porcelain` rather than `git diff`, for the added file.
//  2. `--untracked-files=all`, because `status.showUntrackedFiles=no` in a
//     runner image or a global config silently restores the exact blindness
//     this exists to remove. Verified in a scratch repo: with that config set,
//     porcelain prints nothing for a brand-new file.
//  3. The `|| { exit 1 }` capture, because `[ -z "$(git ...)" ]` reads only
//     stdout. A git failure (dubious ownership, a stuck index.lock) prints
//     nothing and would take the "no changes" branch: green check, no bump, no
//     tag. `git diff --quiet` at least exited 128 and failed loudly downstream,
//     so asserting 1 without 3 trades one false all-clear for another.
//
// A guard asserting only part 1 lets the other two be silently undone, which is
// what a review found: `validate-manifest.yml` carried a porcelain call WITHOUT
// `-uall`, so that was the in-repo form the next author copies.
//
// DISCOVERY IS BEHAVIOURAL, not by filename or step name
//
// An earlier version discovered steps named "Detect changes" and cross-checked
// them against files matching `*-derive.yml` plus a hardcoded `llms-txt.yml`.
// That is the hand-maintained list this repo's gate doctrine rejects, and it
// was already wrong: it missed `validate-manifest.yml`'s own change detection
// entirely, and a derive named off-convention would have been unguarded while
// the test stayed green. A step that writes `changed=` to `$GITHUB_OUTPUT` IS a
// change-detection step, whatever it or its file is called.
//
// REPORTING may still use `git diff`. Only the DECIDING lines are checked: for
// a single always-tracked file, `git diff -- paths-manifest.json` is a more
// useful log line than a porcelain status, and it decides nothing.

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var YAML = require("yaml");

var WORKFLOW_DIR = path.join(__dirname, "..", ".github", "workflows");

// 🪤 Strips full-line AND trailing comments. Stripping only full-line ones left
// the guard satisfiable by a comment one character of syntax away: a step
// reduced to `CHANGED=""   # replaced git status --porcelain` passed both the
// offender check and the presence check.
function withoutComments(run) {
  return String(run || "")
    .split("\n")
    .map(function (line) {
      return line.replace(/(^|\s)#.*$/, "$1");
    })
    .join("\n");
}

// The lines that DECIDE, as opposed to the lines that report.
function decidingLines(run) {
  return withoutComments(run)
    .split("\n")
    .filter(function (line) {
      // 🪤 Any variable assignment, not just `CHANGED=`. Scanning only
      // `CHANGED=` let a decision be routed through another name while a
      // vestigial `CHANGED=` line still satisfied every presence check:
      //   CHANGED="$(git status --porcelain --untracked-files=all -- d/)" || { exit 1; }
      //   FILES=$(git diff --name-only -- d/)
      //   if [ -z "$FILES" ]; then
      // passed with zero problems while deciding entirely with git diff.
      return /^\s*(if\b|elif\b|[A-Za-z_][A-Za-z0-9_]*=)/.test(line);
    })
    .join("\n");
}

function problemsFor(run) {
  var deciding = decidingLines(run);
  var out = [];
  if (!deciding.trim()) return ["no-deciding-line"];
  if (/git diff\b/.test(deciding)) out.push("git-diff");
  if (!/git status --porcelain/.test(deciding)) out.push("no-porcelain");
  if (!/--untracked-files=all/.test(deciding)) out.push("no-uall");
  // 🪤 The `|| { ... }` must actually EXIT. Matching only the tokens `|| {`
  // passed `|| { echo "status failed, continuing"; }`, which swallows the git
  // failure and takes the "no changes" branch: exactly the false all-clear this
  // part exists to prevent. The `exit` lives outside the deciding lines, so this
  // one is matched over the whole comment-stripped block.
  if (!/\|\|\s*\{[^}]*\bexit\b/.test(withoutComments(run))) out.push("no-rc-check");
  return out;
}

// A change-detection step is one that writes `changed=` to $GITHUB_OUTPUT.
function changeDetectionSteps() {
  var found = [];
  fs.readdirSync(WORKFLOW_DIR)
    .filter(function (f) {
      return /\.ya?ml$/.test(f);
    })
    .sort()
    .forEach(function (file) {
      var doc;
      try {
        doc = YAML.parse(fs.readFileSync(path.join(WORKFLOW_DIR, file), "utf8"));
      } catch (e) {
        // Unparseable means unknown, and unknown must not read as absent.
        throw new Error(file + ": workflow did not parse: " + e.message);
      }
      var jobs = (doc && doc.jobs) || {};
      Object.keys(jobs).forEach(function (jobName) {
        ((jobs[jobName] && jobs[jobName].steps) || []).forEach(function (step) {
          var run = String((step && step.run) || "");
          // 🪤 `changed=` and GITHUB_OUTPUT anywhere in the block, NOT the
          // literal `changed=true` on the same line as the redirect. The strict
          // form missed `echo "changed=$DIRTY" >> "$GITHUB_OUTPUT"` and grouped
          // redirects, so such a step dropped silently out of the guarded set
          // while the test stayed green: discovery that misses is worse than
          // discovery that over-reaches, because an over-reached step simply has
          // to be in the corrected form too.
          if (/changed=/.test(run) && /GITHUB_OUTPUT/.test(run)) {
            found.push({
              label: file + " [" + ((step && step.name) || "(unnamed)") + "]",
              run: run,
            });
          }
        });
      });
    });
  return found;
}

test("every change-detection step decides with git status, never git diff", function () {
  var steps = changeDetectionSteps();

  // Non-vacuity, STRUCTURAL rather than a hardcoded count. A floor of 12 against
  // exactly 12 steps sits on its own boundary: any legitimate consolidation reds
  // the test, and the natural fix is to lower the constant, which is the
  // hand-maintained-number erosion this repo's gate doctrine warns about.
  // Instead: every workflow that CONSUMES a `changed` output must be one the
  // walker found. That ties discovery to consumption and cannot rot.
  var consumers = fs
    .readdirSync(WORKFLOW_DIR)
    .filter(function (f) {
      return /\.ya?ml$/.test(f);
    })
    .filter(function (f) {
      return /outputs\.changed/.test(
        fs.readFileSync(path.join(WORKFLOW_DIR, f), "utf8"),
      );
    })
    .sort();
  assert.ok(
    consumers.length > 0,
    "no workflow consumes a `changed` output; discovery is broken",
  );
  var discovered = steps
    .map(function (s) {
      return s.label.replace(/ \[.*$/, "");
    })
    .filter(function (v, i, a) {
      return a.indexOf(v) === i;
    })
    .sort();
  assert.deepEqual(
    consumers.filter(function (f) {
      return discovered.indexOf(f) === -1;
    }),
    [],
    "these gate a step on `outputs.changed` but no change-detection step was discovered in them",
  );

  var problems = [];
  steps.forEach(function (s) {
    problemsFor(s.run).forEach(function (p) {
      problems.push(s.label + ": " + p);
    });
  });

  assert.deepEqual(
    problems.sort(),
    [],
    "change-detection steps are not in the corrected form (#575)",
  );
});

test("positive control: every bypass a review actually found is caught", function () {
  // None of these are invented. Each defeated an earlier version of this guard.
  var COMMENT =
    "          # git status --porcelain --untracked-files=all reports untracked.\n";
  var GOOD =
    '          CHANGED="$(git status --porcelain --untracked-files=all -- d/)" || {\n' +
    "            exit 1\n" +
    "          }\n" +
    '          if [ -z "$CHANGED" ]; then\n';

  assert.deepEqual(problemsFor(COMMENT + GOOD), [], "the corrected form must pass");

  assert.deepEqual(
    problemsFor(COMMENT + "          if git diff --quiet -- d/; then\n"),
    ["git-diff", "no-porcelain", "no-uall", "no-rc-check"],
    "the original blind form",
  );

  assert.deepEqual(
    problemsFor(COMMENT + '          CHANGED="$(git diff --name-only -- d/)"\n'),
    ["git-diff", "no-porcelain", "no-uall", "no-rc-check"],
    "equally blind but never says --quiet; this slipped the first guard entirely",
  );

  assert.deepEqual(
    problemsFor(COMMENT + '          CHANGED=""\n'),
    ["no-porcelain", "no-uall", "no-rc-check"],
    "detection deleted, explanatory comment retained",
  );

  assert.deepEqual(
    problemsFor(
      '          CHANGED=""   # replaced git status --porcelain --untracked-files=all\n',
    ),
    ["no-porcelain", "no-uall", "no-rc-check"],
    "trailing inline comment; stripping only full-line comments let this pass",
  );

  assert.deepEqual(
    problemsFor(COMMENT + '          if [ -z "$(git status --porcelain -- d/)" ]; then\n'),
    ["no-uall", "no-rc-check"],
    "porcelain without -uall and without the capture, the form validate-manifest carried",
  );

  assert.deepEqual(
    problemsFor(
      COMMENT +
        '          CHANGED="$(git status --porcelain --untracked-files=all -- d/)" || {\n' +
        "            exit 1\n          }\n" +
        '          FILES=$(git diff --name-only -- d/)\n' +
        '          if [ -z "$FILES" ]; then\n',
    ),
    ["git-diff"],
    "decision routed through another variable while a vestigial CHANGED= satisfies the presence checks",
  );

  assert.deepEqual(
    problemsFor(
      COMMENT +
        '          CHANGED="$(git status --porcelain --untracked-files=all -- d/)" || { echo "continuing"; }\n' +
        '          if [ -z "$CHANGED" ]; then\n',
    ),
    ["no-rc-check"],
    "`|| {` present but it does not exit, so the git failure is swallowed anyway",
  );

  // Reporting with git diff is legitimate and must not be flagged.
  assert.deepEqual(
    problemsFor(GOOD + "            git diff -- paths-manifest.json\n"),
    [],
    "git diff in a REPORTING line decides nothing and must be allowed",
  );
});
