# Pipelines

All 19 workflows, and the chain that turns a merged edit into something a consumer
can actually read.

*Read at knowledge v0.34.166 on 2026-09-01. The workflow files in
`.github/workflows/` are the source of truth; this chapter is orientation and goes
stale the moment one of them changes.*

## Four kinds of workflow

| Kind | When | What it does |
| --- | --- | --- |
| **Sync** | Nightly and on demand | Pulls Figma into `dist/` |
| **Derive** | On a pull request touching its inputs | Regenerates `dist/` from `src/`, bumps, commits back to the branch |
| **Validate** | On a pull request | Asserts, and blocks |
| **Release** | On merge to `main` | Tags, so a consumer can resolve it |

## The register

| Workflow | Trigger | Bumps | Required |
| --- | --- | --- | --- |
| `sync-from-figma.yml` | 07:00 UTC daily, plus manual with a phase choice | Yes, patch | n/a |
| `foundations-derive.yml` | PR: `foundations/src/**`, its parser, `tokens/src/**` | Yes | No |
| `categories-derive.yml` | PR: `components/src/categories/**` | Yes | No |
| `guidelines-derive.yml` | PR: `components/src/*/{_meta.yml,content,usage,design,behavior}.md`, `tokens.yml` | Yes | No |
| `content-derive.yml` | PR: `content/src/**/*.md` | Yes | No |
| `accessibility-derive.yml` | PR: `accessibility/src/**` | Yes | No |
| `app-context-derive.yml` | PR: `app-context/src/**` | Yes | No |
| `icons-derive.yml` | PR: `components/src/icons-svg.json`, `icon-groups.json`, the DS registry | Yes | No |
| `graphics-derive.yml` | PR: `components/src/graphics-svg.json`, the DS registry | Yes | No |
| `render-derive.yml` | PR: `components/render/renderer/**`, `scripts/render/**`, anatomy, registries, tokens | Yes | No |
| `graph-derive.yml` | PR: the **dist** of the other domains | Yes | No |
| `llms-txt.yml` | PR: `foundations/src/**`, `accessibility/src/**`, `content/dist/**` | Yes | No |
| `validate-manifest.yml` | Every PR, no path filter | Stamps only | **Yes** |
| `validate-schemas.yml` | PR: sources, dist JSON, `schemas/**` | No | No |
| `retired-layer-guard.yml` | Every PR and push to `main` | No | No |
| `vendored-source-bump.yml` | PR: `clients/**`, `schemas/**`, `components/render/renderer/**` | Yes, patch | No |
| `tag-on-merge.yml` | Push to `main` touching `package.json`, and PR closed | No | n/a |
| `editor-ci.yml` | PR: `editor/**` and the trees feeding the safe set | No | No |
| `editor-deploy.yml` | Push to `main` touching `editor/**`, or manual | No | n/a |

**Only one check is required**: `validate-manifest.yml`, named *Validate manifest
schema + coverage*. It runs on every pull request with no `paths:` filter, on
purpose. A required check that has a path filter leaves every unrelated pull
request permanently pending, because the check never reports at all.

## The sync

`sync-from-figma.yml` runs at 07:00 UTC daily and can be dispatched manually with a
phase:

| Phase | Produces |
| --- | --- |
| `registries` | `components/dist/registries/*.json`, `categories.json`, and the identity ledger |
| `styles` | `text-styles.md`, `effect-styles.md`, the token reference |
| `anatomy` | `components/dist/anatomy/<slug>.json` |
| `media-preview` | `components/dist/media/<slug>/preview.webp` from the Preview frame |
| `media-default` | `components/dist/media/<slug>/default.webp`, the default variant in isolation |
| `icons` | `components/dist/icons/` |
| `all` | Every phase, in dependency order |

`media-default` resolves each component from the anatomy dist, so it must run after
`anatomy`. That ordering is why `all` exists rather than a free-form list.

### Additive against breaking

Every run classifies its own diff, once, in a step whose output the push, the pull
request and the auto-merge all read. Computing it once is deliberate: three steps
deciding independently is three chances to disagree about what mode the run is in.

| Verdict | What happens |
| --- | --- |
| **Additive** | Opens a pull request labelled `sync,auto-merge`, and enables auto-merge. It lands the same day |
| **Breaking** | Opens no pull request. It commits the regenerated dist to a branch and upserts **one rolling tracking issue**, edited every night it stays breaking |

Two properties of the breaking path are there because their absence cost real time:

- **A dispatched breaking sync used to produce nothing at all.** The only step that committed was gated on the additive verdict, so a human dispatching a run to carry a breaking change through got a green job and an empty branch. It now commits to a branch, so anyone can carry a breaking sync from CI.
- **One rolling issue, not one per night.** The earlier version created a new issue nightly. The deduplication keys on a marker in the issue body rather than on a label, because `gh issue create --label` silently drops a label it cannot apply, which left the key unset and produced five duplicates.

The identity ledger is written by the `registries` phase itself rather than by a
later step, because a breaking verdict opens no pull request and a ledger written
only at the end would never land on a breaking night.

## The derive cascade

A derive workflow regenerates its `dist/`, bumps the version, and **commits back to
the pull request branch**. This is what lets an author with no local toolchain edit
through the Editor and still produce a complete, validated change.

The cascade matters: `graph-derive.yml` triggers on the **dist** of other domains,
so it fires on their auto-commits rather than only on its own inputs. An edit to
`accessibility/src/` therefore produces two rounds of automation, and the graph
regenerates in the second.

Every auto-commit is pushed with the `actian-ds-bot` App token, not the default
`GITHUB_TOKEN`. A commit pushed with `GITHUB_TOKEN` **cannot trigger further
workflow runs**, so the required check would have no status on the auto-commit's
SHA and the pull request would be unmergeable until somebody pushed an empty
commit. The App token re-triggers checks on the new head.

On fork pull requests the App secret is not exposed, the push step is skipped, and
the validate steps run against the unstamped tree. That is the one path where the
auto-commit safety net is absent, and it is why the drift guards use
`git status --untracked-files=all` rather than `git diff`.

Derive workflows serialize per branch with `concurrency`, queueing rather than
cancelling: two auto-commits racing to the same head means a lost push and a red
required check, and cancelling mid-push could strand a half-committed dist.

## The version chain

This is the part to understand before anything else, because every link has failed
at least once while the checks above it stayed green.

```
a change to vendorable content
  -> a derive workflow notices "the dist changed"
  -> bumpLockstep raises package.json#version
  -> validate-manifest stamps paths-manifest.json#knowledge_version to match
  -> merge to main
  -> tag-on-merge creates v<version>
  -> the consumer's vendored.json range resolves against that tag
  -> vendor-snapshot copies the vendor-include.json surface
  -> the consumer reads it
```

`scripts/lib/bump-version.js` owns the bump and also stamps `package-lock.json`, so
the committed lockfile does not go stale and leave a dirty tree at push time.

Tags are emitted **only** by `tag-on-merge.yml`, and only on `main`. Do not re-add
`git tag` to a derive workflow: derives run on pull request branches, so a branch
tag is orphaned the moment the pull request squash-merges to a different main
commit. That orphaning broke consumer vendor integrity twice.

`tag-on-merge.yml` needs both of its triggers:

- **push to `main`** fires for human and direct merges.
- **`pull_request` closed** fires for the App-authored sync and vendor pull requests that auto-merge. GitHub suppresses `push`-triggered workflows for App-installation pushes, so without this trigger a sync bumps the version, never gets tagged, and the consumer lags a release behind.

Both fire on a human merge. The tag-exists check makes the duplicate a no-op.

### Where the chain breaks

| Break | Symptom | Why |
| --- | --- | --- |
| No dist change | Nothing reaches consumers | Every bump is gated on "did the dist change". A source-only edit that produces identical dist bumps nothing |
| A new directory shipping as source | Same | Source directories have no derive, so nothing bumps. This is why `vendored-source-bump.yml` exists for `clients/`, `schemas/` and the renderer |
| Branch and `main` at the same version | Same | No bump means no tag means no consumer. Chapter 11 |
| A tag pointing off `main` | Consumer vendor integrity fails | A derive tagged a branch |
| Consumer range too narrow | Consumer never sees the version | The consumer bumps its own range explicitly on a minor or major |

`validate-manifest.yml` carries a **report-only** tag-gap notice for the first row:
if a pull request changes vendorable content without a version bump, it says so in
the job summary. It never fails the check, and it can warn transiently mid-cascade
before a derive bumps.

## What each gate actually asserts

| Gate | Asserts | Does not assert |
| --- | --- | --- |
| `validate-manifest` | Entry schema, paths resolve, no orphans, patterns resolvable, zones classified, 7 drift guards, full test suite | That the content is correct, or that a consumer can read it |
| `validate-schemas` | Dist JSON conforms to `schemas/*.json`, annotated inline on Files Changed | Anything unschematized: the bundles, `foundations-index.json` |
| `retired-layer-guard` | Retired transitional layers stay gone | Anything about live layers |
| `render-derive` fidelity gate | No colour mismatch, no per-slug or total coverage regression | That the render looks right. It is fact-based, not visual |
| sparse-render ratchet | No component invents parts, no prop starts replacing content, the measurement still covers every slug | Anything about components outside the 56 in the contract |
| `editor-ci` | Editor tests, typecheck, build, safe-set freshness | Not required, so it blocks nothing on a pull request it does not run on |

## Consumers

The plugin vendors a pinned snapshot nightly at 09:00 UTC, a two-hour offset from
the upstream Figma sync so it reads a settled state. It reads exclusively from its
own `vendor/` tree at runtime and never fetches this repository live. The docs site
follows the same pattern with its own build.

Typical propagation: under a day on the nightly schedule, roughly ten minutes if
someone triggers the vendor snapshot by hand.
