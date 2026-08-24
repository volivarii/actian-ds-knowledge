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
  // A change-detection step must consult GIT.
  //
  // 🪤 Two weaker rules were tried and both leaked. Scoping the git checks to
  // git-consulting steps (so a hypothetical non-git step would not be forced to
  // add a dummy git call) let `CHANGED=""` fall through as out of scope, which is
  // the "detection deleted" bypass. Adding a "must compute something" floor of
  // `$(` then let `CHANGED=$(true)` through: the something can be nothing.
  //
  // Requiring git is stronger AND simpler, one rule instead of two. The cost is
  // that a genuinely non-git change-detection step would red this and need a
  // documented edit here. No such step exists, and making that a conscious edit
  // is the right price for closing two demonstrated bypasses.
  if (!/\bgit\b/.test(deciding)) return ["no-git"];
  if (/git diff\b/.test(deciding)) out.push("git-diff");
  // 🪤 Both flags must sit on the `git status` CALL, not merely somewhere in the
  // deciding blob. Matching the block let `X="$(git status --porcelain -- d/)"`
  // pass while a neighbouring `Y="--untracked-files=all"` supplied the token.
  var decidingLineList = deciding.split("\n");
  var porcelainCalls = decidingLineList.filter(function (line) {
    return /git status --porcelain/.test(line);
  });
  if (porcelainCalls.length === 0) {
    out.push("no-porcelain");
    out.push("no-uall");
  } else if (
    !porcelainCalls.some(function (line) {
      return /--untracked-files=all/.test(line);
    })
  ) {
    out.push("no-uall");
  }
  // 🪤 The condition itself must not call git INLINE. `[ -z "$(git ...)" ]`
  // reads only stdout, so a git failure prints nothing and the test silently
  // takes the "no changes" branch. Going through a captured variable is what
  // makes the exit status checkable at all, and the companion test below
  // asserts every such capture has a failure handler that EXITS.
  //
  // This replaced a match for `|| {` over the WHOLE block, which an unrelated
  // `npm run derive:thing || { echo; exit 1; }` on a neighbouring line
  // satisfied while the git call stayed uncaptured.
  var conditionLines = withoutComments(run)
    .split("\n")
    .filter(function (line) {
      return /^\s*(if\b|elif\b)/.test(line);
    })
    .join("\n");
  if (/\bgit\b/.test(conditionLines)) out.push("inline-git-in-condition");

  // 🪤 The variable the decision READS must be the one captured from git status.
  // Every check above is satisfied by presence somewhere in the block, so a
  // vestigial correct capture plus a decision on an unrelated variable passed
  // clean. The documented `FILES=$(git diff ...)` bypass was caught only because
  // it happened to contain the token `git diff`; any non-git second source was
  // invisible. A condition that reads no variable at all (`if git diff --quiet`)
  // is out of scope here and already caught by the git-diff / inline-git rules.
  var gitStatusVars = decidingLineList
    .filter(function (line) {
      return /git status --porcelain/.test(line);
    })
    .map(function (line) {
      var m = /^\s*([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
      return m ? m[1] : null;
    })
    .filter(Boolean);
  // 🪤 Per CONDITION, not per block. Asking whether ANY condition variable came
  // from git status is what the bypass exploits: it keeps the correct
  // `if [ -z "$CHANGED" ]` in place and adds a second condition on a variable
  // that never touched git. Every condition that reads a variable has to read
  // one that did.
  var strayCondition = conditionLines.split("\n").some(function (line) {
    var names = [];
    line.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, function (_, name) {
      names.push(name);
      return _;
    });
    if (!names.length) return false;
    return !names.some(function (name) {
      return gitStatusVars.indexOf(name) !== -1;
    });
  });
  if (strayCondition) out.push("decision-not-from-git-status");
  return out;
}

// EVERY occurrence of `git status --porcelain` in any workflow, classified.
//
// 🪤 An earlier version keyed on the capture's SYNTAX (`VAR="$(git status ` ...
// ending `)" || {`). Review defeated it three ways on real workflows, all green:
//   - a handler that does not exit: `|| {` / `echo "continuing"` / `}`
//   - an UNQUOTED capture: `CHANGED=$(git status ...)` with the handler deleted
//   - a revert to the inline `if [ -n "$(git status ...)" ]`, which is a capture
//     of no kind at all and so was invisible to a capture-shaped walker
// It also RED-flagged correct code, `... )" || exit 1`, because that has no brace.
// Checking a formatting shape rejects correct code and accepts incorrect code at
// the same time. What matters is the POSTCONDITION: git's failure must stop the
// step. So every occurrence is classified, and an occurrence whose shape this
// walker does not recognise is itself a failure rather than a silent skip.
// `exit` counts only at a COMMAND position: the start of a segment, or directly
// after `{`, `;`, `&&` or `||`. Matching it anywhere accepted a handler that
// merely talks about exiting, e.g. `|| { echo "git status exit code ignored"; }`,
// which is the precise bypass the no-exit case exists to catch.
var EXITS_HERE = /(^|[;{]|&&|\|\|)\s*exit\b/;

// A new YAML key ends the shell block. Without this the `|| {` lookahead ran to
// end-of-file and could borrow an `exit` from an unrelated later step.
var ENDS_BLOCK = /^\s*(-\s|(run|name|if|with|uses|env|shell|id|working-directory):)/;

function classifyLine(lines, i) {
  // A one-line `run: <cmd>` step is the same command with a YAML key in front.
  // Classifying the raw line called correct reporting code "unknown", which this
  // guard treats as a failure — rejecting correct code, the very trade its own
  // comment above criticises the previous version for.
  var line = lines[i].replace(/^(\s*)run:\s+/, "$1");
  if (/^\s*(if|elif)\b/.test(line)) return "condition";
  if (/^\s*git\b/.test(line)) return "reporting";
  if (!/^\s*[A-Za-z_][A-Za-z0-9_]*=/.test(line)) return "unknown";
  // A capture. Its failure handler must exit, whether written inline
  // (`|| exit 1`, `|| { ...; exit 1; }`) or as a block opened with `|| {`.
  if (!/\|\|/.test(line)) return "capture-unchecked";
  var tail = line.slice(line.indexOf("||"));
  if (EXITS_HERE.test(tail)) return "capture-checked";
  if (/\{\s*$/.test(tail)) {
    for (var j = i + 1; j < lines.length; j++) {
      if (/^\s*\}/.test(lines[j])) break;
      if (ENDS_BLOCK.test(lines[j])) break;
      if (EXITS_HERE.test(lines[j])) return "capture-checked";
    }
  }
  return "capture-unchecked";
}

function gitStatusSites() {
  var sites = [];
  fs.readdirSync(WORKFLOW_DIR)
    .filter(function (f) {
      return /\.ya?ml$/.test(f);
    })
    .sort()
    .forEach(function (file) {
      var lines = withoutComments(
        fs.readFileSync(path.join(WORKFLOW_DIR, file), "utf8"),
      ).split("\n");
      lines.forEach(function (line, i) {
        if (!/git status --porcelain/.test(line)) return;
        sites.push({
          file: file,
          line: i + 1,
          kind: classifyLine(lines, i),
        });
      });
    });
  return sites;
}

// A change-detection step is one that writes `changed=` to $GITHUB_OUTPUT.
//
// 🪤 `changed=` and GITHUB_OUTPUT anywhere in the block, NOT the literal
// `changed=true` on the same line as the redirect: the strict form missed
// `echo "changed=$DIRTY" >> "$GITHUB_OUTPUT"` and grouped redirects, so such a
// step dropped silently out of the guarded set while the test stayed green.
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

test("every `git status` decision is a capture whose failure exits", function () {
  var sites = gitStatusSites();

  // Non-vacuity WITHOUT a magic floor: every occurrence must be classified, and
  // an unrecognised shape counts as a failure. A count-based floor was worse than
  // useless here: `>= 8` sat against 20 real occurrences, so all eight guards
  // could have been reverted to the inline form and it would still have held.
  assert.ok(
    sites.length > 0,
    "no `git status --porcelain` found at all; the walker is broken",
  );

  var bad = sites
    .filter(function (s) {
      return s.kind !== "capture-checked" && s.kind !== "reporting";
    })
    .map(function (s) {
      return s.file + ":" + s.line + " (" + s.kind + ")";
    })
    .sort();

  assert.deepEqual(
    bad,
    [],
    "condition = git called inline, so its failure prints nothing and reads as no-change; " +
      "capture-unchecked = the failure is swallowed; unknown = a shape this guard cannot vouch for",
  );

  assert.ok(
    sites.some(function (s) {
      return s.kind === "capture-checked";
    }),
    "found no checked capture at all; the walker is only seeing reporting lines",
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

  var cases = [
    [[], COMMENT + GOOD, "the corrected form"],
    [
      ["git-diff", "no-porcelain", "no-uall", "inline-git-in-condition"],
      COMMENT + "          if git diff --quiet -- d/; then\n",
      "the original blind form",
    ],
    [
      ["git-diff", "no-porcelain", "no-uall"],
      COMMENT + '          CHANGED="$(git diff --name-only -- d/)"\n',
      "equally blind but never says --quiet; slipped the first guard entirely",
    ],
    [
      ["no-git"],
      COMMENT + '          CHANGED=""\n',
      "detection deleted, explanatory comment retained",
    ],
    [
      ["no-git"],
      '          CHANGED=""   # replaced git status --porcelain --untracked-files=all\n',
      "trailing inline comment; stripping only full-line comments let this pass",
    ],
    [
      ["no-uall", "inline-git-in-condition"],
      COMMENT + '          if [ -z "$(git status --porcelain -- d/)" ]; then\n',
      "porcelain inline without -uall, the form validate-manifest carried",
    ],
    [
      ["git-diff", "decision-not-from-git-status"],
      COMMENT +
        GOOD +
        "          FILES=$(git diff --name-only -- d/)\n" +
        '          if [ -z "$FILES" ]; then\n',
      "decision routed through a second variable while a vestigial CHANGED= satisfies the rest; " +
        "previously caught only because it happened to say `git diff`",
    ],
    [
      [],
      GOOD + "            git diff -- paths-manifest.json\n",
      "git diff in a REPORTING line decides nothing and must be allowed",
    ],
    [
      ["no-git"],
      COMMENT + "          A=$(cat marker)\n" + '          if [ "$A" != "$B" ]; then\n',
      "a change-detection step that never consults git is not detecting a change",
    ],
    [
      ["no-git"],
      COMMENT + "          CHANGED=$(true)\n" + '          if [ -z "$CHANGED" ]; then\n',
      "the `$(` floor let this through: a substitution that asks nothing",
    ],
    [
      ["no-uall"],
      COMMENT +
        '          X="$(git status --porcelain -- d/)" || exit 1\n' +
        '          Y="--untracked-files=all"\n' +
        '          if [ -z "$X" ]; then\n',
      "the flag must be on the git status call, not merely somewhere in the block",
    ],
    [
      ["decision-not-from-git-status"],
      GOOD +
        "          FILES=$(cat marker)\n" +
        '          if [ -z "$FILES" ]; then\n',
      "decision routed through a non-git variable while a vestigial CHANGED= satisfies the rest",
    ],
  ];

  cases.forEach(function (c) {
    assert.deepEqual(problemsFor(c[1]), c[0], c[2]);
  });
});

test("positive control: classifyLine vouches for no capture whose failure escapes", function () {
  // classifyLine had NO positive control, which is how it shipped accepting a
  // handler that merely says the word "exit". Every case here is a shape that
  // must NOT come back "capture-checked".
  var CAP = '          CHANGED="$(git status --porcelain --untracked-files=all -- d/)"';

  function kind(text) {
    var lines = text.split("\n");
    for (var i = 0; i < lines.length; i++) {
      if (/git status --porcelain/.test(lines[i])) return classifyLine(lines, i);
    }
    throw new Error("fixture has no git status line");
  }

  var cases = [
    [
      "capture-checked",
      CAP + " || exit 1",
      "the inline exiting handler, which an earlier version red-flagged",
    ],
    ["capture-checked", CAP + " || { exit 1; }", "inline block that exits"],
    [
      "capture-checked",
      CAP + " || {\n            exit 1\n          }\n",
      "opened block that exits",
    ],
    [
      "capture-unchecked",
      CAP + ' || { echo "::warning::git status exit code ignored"; }',
      "a handler that only MENTIONS exiting must not count as exiting",
    ],
    [
      "capture-unchecked",
      CAP + ' || {\n            echo "git status exited non-zero, continuing"\n          }\n',
      "same bypass spelled across an opened block",
    ],
    [
      "capture-unchecked",
      CAP + ' || {\n            echo "continuing"\n          }\n',
      "a handler that does not exit; the case the old guard had and lost",
    ],
    [
      "capture-unchecked",
      "          CHANGED=$(git status --porcelain --untracked-files=all -- d/)",
      "an unquoted capture with the handler deleted",
    ],
    [
      "capture-unchecked",
      CAP + " || {\n            echo hello\n          run: something-else\n          exit 1\n",
      "an unterminated block must not borrow an exit from a later step",
    ],
    [
      "condition",
      '          if [ -n "$(git status --porcelain -- d/)" ]; then',
      "the inline condition, a capture of no kind at all",
    ],
    [
      "reporting",
      "          git status --porcelain --untracked-files=all -- d/",
      "a bare reporting line decides nothing",
    ],
    [
      "reporting",
      "          run: git status --porcelain -- src/generated",
      "a one-line reporting step is correct code and must not be red-flagged",
    ],
  ];

  cases.forEach(function (c) {
    assert.equal(kind(c[1]), c[0], c[2]);
  });
});
