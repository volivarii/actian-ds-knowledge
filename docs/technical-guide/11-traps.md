# Traps

Failure modes that pass every check while being wrong. Each one has actually
happened here. This chapter is the part of the guide that is hardest to
reconstruct from the code, because a defect that leaves no red mark leaves no
trace either.

Read it once now and once again the first time something is green and you do not
believe it.

## The shape of every trap here

**A check that cannot fail is worse than no check**, because it also spends the
attention that would have found the problem. Most entries below are one instance
of that.

Corollary, and the single most useful habit in this repository: **mutate the thing
a gate guards and watch it go red before you trust it.** A test that has never been
seen to fail has not been shown to work.

## The version chain

### The bump trap

**Symptom.** Everything merges, every check is green, and no consumer ever sees the
change.

**Cause.** Consumers pull by tag. Every bump lives in a derive workflow gated on
"did the dist change". If the branch and `main` are at the same version at merge
time, `tag-on-merge` finds the tag already exists and does nothing. No tag, no
consumer.

The way it usually happens is not a missing bump but a **conflict resolution**:
taking `main`'s version during a merge sets the branch version equal to main's,
which is exactly the no-op condition.

**The check.** `validate-manifest` prints a report-only tag-gap notice in the job
summary when a pull request changes vendorable content without a bump. It never
fails. So read the summary, and after any conflict resolution re-check the version
ladder with `git log --oneline -5 -- package.json`.

**The fix.** Bump with `scripts/lib/bump-version.js`, never by hand.

### A directory that ships as source and never bumps

**Symptom.** Same as above, for a specific directory.

**Cause.** The bump triggers live in derive workflows, which cover `src/` to `dist/`
domains. A directory that ships to consumers as **source** has no derive, so nothing
ever bumps for it.

**The check.** `vendored-source-bump.yml` covers `clients/`, `schemas/` and the
renderer. If you add another such directory, check `vendor-include.json` and add a
trigger, or its changes are invisible downstream forever.

### A tag on a pull request branch

**Symptom.** Consumer vendor integrity fails against a tag that exists.

**Cause.** A derive workflow running `git tag`. Derives run on branches, so the tag
is orphaned the moment the pull request squash-merges to a different main commit.

**The rule.** `tag-on-merge.yml` is the single source of tags, and only on `main`.
Do not re-add `git tag` anywhere else.

## Gates that cannot fail

### A stale list iterated against real data

**Symptom.** Four gates green, and none of them checking anything.

**Cause.** A hand-written list of things that live somewhere else goes stale. It
then resolves to nothing, the loop body never executes, and the final assertion
compares two empty sets. This is worse than a red test, because red gets fixed.

One Figma page rename exposed seven hand-written copies of one slug across three
repositories and disarmed four gates at once.

**The fix.** Read the list from the producer. Assert the join, not the count. And
where a list genuinely must be authored, add a test that every entry still resolves:
`rename-preconditions.js` does exactly that for its `AUTHORED_SURFACES`, because a
surface that moved would make the scan find nothing and wave every rename through.

### A gate that never checks its subject was present

**Symptom.** Green, on nothing.

**Cause.** `[].forEach(...)` runs nothing and reports success. Any check that
iterates, filters, splits or looks something up cannot distinguish an empty result
from a clean one unless it says so.

During the renderer relocation, **seven** gates were green for reasons unrelated to
correctness, and five of the seven were code written specifically to be a gate.

**The fix.** Assert the collection is non-empty and, better, that it is the size you
expect. The sparse-render ratchet's third assertion is the pattern: it fails when a
slug the renderer implements is not covered by the measurement, so the measurement
cannot silently narrow.

### A gate that never checks its own postcondition

**Symptom.** The step ran, and the effect did not happen.

**Cause.** `gh issue create --label sync-breaking` silently drops a label it cannot
apply. The label was the deduplication key, so the next breaking night would have
opened a duplicate: the exact failure the design existed to prevent, one layer down.

**The fix.** After acting, verify the act took effect. The breaking-sync tracker now
keys on a marker in the issue body, and creates the label before using it.

### A drift gate that does not report direction

**Symptom.** A regression goes green, and the failure message told you to make it
so.

**Cause.** A gate shaped "regenerate the derived set and fail if it differs"
reports a set inequality, but the two directions mean opposite things. Something
added is a gain and "regenerate and commit" is correct. Something **removed** is a
capability regression, and the same instruction launders it.

Caught live on the first outside-authored pull request: one trailing space in a
prose edit dropped a file out of a generated safe-path list. Obeying the message
would have gone green while permanently costing that file its editor support.

### A required check with a path filter

**Symptom.** Unrelated pull requests are permanently pending and cannot merge.

**Cause.** A required status check that has a `paths:` filter never reports at all
on a pull request it does not match, and GitHub waits forever.

**The rule.** `validate-manifest.yml` runs on every pull request with no filter, on
purpose. Its runtime is about ten seconds.

### A filter that does not cover what changes the answer

**Symptom.** A check exists, is correct, and never fires on the pull requests that
can break it.

**Cause.** Filtering on the directory the check lives in rather than on everything
that feeds it. The Editor's WYSIWYG safe set is derived from the **content** of four
source trees plus `domains.json` and the registry, so a pull request that edits one
of those can invalidate the set while touching no `editor/` file.

**The rule.** `editor-ci.yml` lists those trees in its filter. Copy that shape.

### A report that rewrites its own baseline

**Symptom.** A coverage regression lands with no reason recorded.

**Cause.** The fidelity gate's first version wrote `fidelity-report.json` before
evaluating the regression. Anyone who re-ran to confirm, or who just committed the
regenerated dist, landed the loss silently.

**The fix.** On a blocking loss the run now leaves the committed report untouched,
so the failure reproduces until it is dealt with. Accepting a loss requires
`--accept-coverage-loss="<why>"` locally plus a CHANGELOG entry, and CI cannot pass
the flag.

## Shell and git

### `git diff` is blind to a file git does not track

**Symptom.** A drift guard reports clean while a newly derived leaf is missing from
the merge.

**Cause.** `git diff` reports only tracked files. On a fork pull request the
derive's commit step is skipped, so a new leaf stays untracked and is invisible.

**The rule.** Every drift guard here uses
`git status --porcelain --untracked-files=all`. Change detection built on `git diff`
cannot see an added file, and that is also why a new per-slug leaf once took no
bump, no tag and no consumer.

### `[ -n "$(git ...)" ]` swallows git's exit status

**Symptom.** A required check goes green because git itself failed.

**Cause.** The inline form sees only stdout. If git fails (dubious ownership, a
stuck `index.lock`), it prints nothing, the test is false, the guard body is
**skipped**, and the step exits 0.

**The rule.** Capture into a variable with `|| { echo "::error::..."; exit 1; }`,
then test the value. Note the asymmetry that made this easy to introduce: the
`if ! git diff --quiet` form it replaced exited 128, which `!` inverted into a loud
failure. Converting to the inline form traded one false all-clear for another.

### `grep` returns 0 matches on files that contain the character

**Symptom.** "Zero em-dashes" reported, repeatedly, falsely. Five reached a merged
changelog.

**Cause.** Passing those codepoints to `grep` in this environment matches nothing.

**The rule.** `perl -CSD -ne 'print if /[\x{2014}\x{2013}]/' <file>`, and give it a
positive control before reporting a pass. This generalises: **any ad-hoc
verification command gets a positive control before its pass is reported as fact.**

### `git stash` does not stash untracked files

**Symptom.** You compare a thing to itself and conclude a restore was ineffective.

**The rule.** `git stash -u`, or check `git status --untracked-files=all` first.

### A `GITHUB_TOKEN` push cannot re-trigger checks

**Symptom.** Required checks stuck with no status on the auto-commit's SHA, and the
pull request unmergeable without an empty commit.

**Cause.** A commit pushed with the default `GITHUB_TOKEN` fires no further workflow
runs.

**The rule.** Every auto-commit here pushes with the `actian-ds-bot` App token. The
gotcha remains on fork pull requests, where the App secret is not exposed and the
push step is skipped.

### A poll loop that passes on absence

**Symptom.** A wait loop reports green while the pull request is blocked.

**Cause.** `gh pr checks` prints "no checks reported" before workflows register, so
a loop that only greps for pending sees nothing pending.

**The rule.** Require a minimum count of checks and zero running. Also re-check the
head SHA: a green list can belong to the previous commit, because derive bots push
to your branch.

### The orphan guard walks the filesystem, not git

**Symptom.** `npm run validate:manifest` fails locally with 16 orphan-file errors,
on a clean checkout, while CI is green on the same commit.

**Cause.** The guard walks the directory tree. `tokens/src/figma-export/` is a
local-only parity oracle for the token deriver: gitignored on purpose, read by no
script, covered by no manifest entry. CI clones fresh and never sees it. Your
machine has it.

**What to do.** Confirm every error is under that path before you go looking for a
real defect:

```
npm run validate:manifest 2>&1 | grep "orphan file" | grep -v "tokens/src/figma-export"
```

Empty output means the gate is clean for CI's purposes. **Do not resolve this by
adding the directory to the manifest or by committing it.** A stray `git add
tokens/` once swept it into a pull request, and the same guard then reds for the
opposite reason.

### A test that drives a producer, unconfined

**Symptom.** 179 committed anatomy files pruned by a test run.

**Cause.** The sync takes several path flags, and omitting `--plugin-dir` let it
write outside the fixture. `git status` caught it; no assertion did.

**The rule.** Pass every path flag. **Passing `--output-dir` alone is not
confinement**, because some phases resolve paths from the repository root
independently.

Related: exercising `--phase registries` is not a test of a change, because it is
the phase most likely to pass regardless.

## Renames and absence

### A rename stops at the namespace boundary

**The worst one.** It broke three times in a single task.

**Symptom.** The whole suite green, and a glyph rendered empty in the browser.

**Cause.** Icons and components share a name space. `dskit.json` keys 324 entries
under `components` and 149 under `icons`, and **all 149 icon names also appear in
the 324**: `calendar`, `collapse`, `search` and `table` are each both. A rename that
follows the component silently empties the icon of the same name.
`renderIcon("calendar")` returned nothing while every check passed.

```
python3 -c "import json;d=json.load(open('components/dist/registries/dskit.json'));print(len(set(d['icons']) & set(d['components'])))"
```

**Two details that make it hard to catch:**

- BEM `--` and `__` suffixes follow the rename; a bare `-<alnum>` suffix does not. So a matcher written for one is wrong for the other.
- **A verification that uses the same lookahead as the edit reports clean.** If the pattern that made the change is the pattern that checks it, it agrees with itself by construction. Verify with a different mechanism: render it and look.

**The gate.** `rename-preconditions.js` asserts the general precondition (nothing
authored still names the retired slug) rather than teaching each downstream gate
about the ledger.

### The ledger absorbs resolution, not authorship

**Symptom.** An "additive" rename opens an auto-merging pull request whose checks
can never go green.

**Cause.** `identity.json` makes a consumer's old slug resolve. It does not fix
authored references. `ds-html-map.js` has literal `case "<slug>":` arms, and
app-context patterns list slugs in `components[]`, where `derive-graph.js` **throws**
on a reference matching no registry key.

**The consequence.** That is strictly worse than the breaking path, which at least
produces a tracker a human acts on. Hence the precondition gate.

### Absence does not state its cause

**Symptom.** A decision taken on a wrong premise.

**Cause.** A slug missing from a registry can be a rename, an unpublish, or a
retirement, and the correct response to each is different. A component that is
unpublished and expected back is not a deletion.

**The rule.** Read the producer's commit, `git log -S<slug>`, rather than inferring
from a consumer's red or from a note somebody wrote. Guidance surviving beside an
absent registry entry means quarantine, not delete.

### A breaking sync commits nothing

**Symptom.** A dispatched run finishes green with an empty branch.

**Cause.** The only committing step used to be gated on the additive verdict.

**Fixed**, but the shape recurs: check what a run's verdict step decided, not
whether the job was green.

## Numbers

### A warning inside a green run is not a signal

Two nightly syncs ran frozen for three days reporting success, with a `::warning::`
in the log nobody read. Four separate instances of quietly widening a tolerance
cost a week between them.

**The rule.** When a check goes red, fix the cause or record the decision by name.
Never silently widen.

### A ratio that improves by attrition

Oracle coverage rose from 17.8% to 19.1% while the numerator stayed at 75. The
denominator shrank.

**The rule.** State oracle coverage as a pair, 78 of 408. Read the numerator before
quoting any ratio. `quality-trend.md` does this deliberately.

### Counts that mean something other than they look like

| Number | Reads as | Actually is |
| --- | --- | --- |
| 614 graph `component` nodes | Components | Every registry entry across three kits, icons included |
| 268 orphan nodes | Authoring debt | Mostly registry entries never meant to carry guidance |
| `inherited` in coverage | A gap | The correct answer, resolving to category defaults |
| A green check list | This commit passed | Possibly the previous commit. Confirm against the head SHA |

### Measurement is not looking

Fixing a fidelity mismatch once rendered `segmented-control` white on white while
every number improved.

**The rule.** Render it and look. Looking has found defects that a passing validator
did not, more than once.

### A stale index ships inside the tag

`llms.txt` regenerated on push to `main`, after `tag-on-merge` had already cut the
tag, so every released tag carried an index describing somebody else's content. It
is the first thing an AI consumer reads.

**Fixed** by moving the regeneration to a pull request event with a bump, plus a
freshness guard in the required check. The general shape: **anything a consumer
reads must be settled before the tag is cut, not after.**
