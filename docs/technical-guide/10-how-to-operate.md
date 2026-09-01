# How to operate

Running the machinery, and recovering it when a night goes wrong.

## Running locally

Most authoring needs no local toolchain at all: edit through the Editor or the
GitHub web UI and CI does the rest. You need a checkout when you are changing a
generator, the renderer, or a gate.

```
npm install
npm test                      # the full suite
npm run validate:manifest     # schema, resolution, orphans, zones
npm run derive:graph && npm run validate:graph
```

Every derive is a script in `package.json`, and they are safe to run: they write
only their own dist.

| Task | Needs a Figma token |
| --- | --- |
| Any `derive:*` | No |
| `validate:*`, `npm test` | No |
| `npm run sync` | **Yes** |

The sync needs two things the repository deliberately does not contain: a Figma
personal access token in `FIGMA_PAT`, and a file-keys file. Both have committed
example files at the repository root showing the shape, and the real keys file is
gitignored because Figma file keys are sensitive. In CI they arrive as the
`FIGMA_PAT` and `FIGMA_KEYS_JSON` secrets.

### Running a sync by hand

```
node scripts/sync/sync-from-figma.js --phase registries
```

Phases: `registries`, `styles`, `anatomy`, `media-preview`, `media-default`,
`icons`, or `all`. `media-default` resolves components from the anatomy dist, so
it must run after `anatomy`; `all` handles that ordering.

**Confine any run that drives the sync.** It takes `--output-dir`, `--plugin-dir`,
`--manifest-path` and several other path flags, and omitting one lets it write
outside where you expect. A test that omitted `pluginDir` once pruned 179 committed
anatomy files. `git status` caught it; no assertion did. Passing `--output-dir`
alone is not confinement, because some phases resolve other paths from the
repository root.

## Recovering a failed nightly

**First, look at what the run actually decided**, not at whether it was green. The
sync classifies its own diff and the two verdicts behave completely differently.

| Symptom | Likely cause | Do this |
| --- | --- | --- |
| No sync pull request, but a tracking issue was updated | The verdict was **breaking** | Read the rolling issue, then carry it through below |
| The run is green and nothing changed | Figma published nothing, or a phase warned inside a green job | Read the log for `::warning::`. A warning inside a green run is not a signal, and two nightly syncs once ran frozen for three days that way |
| The pull request merged but no tag appeared | The bump never happened, or `tag-on-merge` did not fire | Chapter 08's version chain, and the bump trap in chapter 11 |
| One component is mid-rework in Figma and freezes every night | Any-breaking-is-breaking aggregation | Use a deferred removal, below |

### Carrying a breaking sync through

A breaking sync opens no pull request. It commits the regenerated dist to a branch
and updates one rolling tracking issue, so anyone can carry it through from CI:

1. Dispatch `sync-from-figma.yml` manually on the branch the tracker names.
2. It regenerates and commits, then stops.
3. Fix whatever made it breaking, which is usually authored references to a retired slug.
4. Open the pull request yourself.

The run leaves the tracker updated every night it stays breaking, so the issue is
the state, not the notification.

### Deferring one component's removal

One component being decomposed in Figma freezes the whole pipeline, because the
aggregate verdict is any-breaking-is-breaking. That cost five nights and 241 icon
updates once.

`scripts/sync/deferred-removals.js` is the release valve. A deferral carries the
registry entry **forward** into the new state rather than suppressing the verdict,
so there is no removal left to classify and the classifier needs to know nothing
about it. The carried entry is marked, so the registry keeps meaning "what the
library publishes, and what is on borrowed time" rather than quietly claiming Figma
still publishes something it does not.

A deferral naming no known kit is treated as a typo and reported, because otherwise
it would vanish with no error, no log line and no changelog entry, leaving a broken
night with nothing explaining why the deferral did nothing.

## Carrying a rename through

This is the operation most likely to go wrong, and it goes wrong in a specific way.

**What the identity ledger does:** `components/dist/identity.json` makes
*resolution* survive a rename. A consumer holding the old slug still resolves.

**What it does not do:** it does not make *authored* references correct. Several
files are keyed by slug and must be edited by hand:

- `ds-html-map.js` has a `case "<slug>":`. Left stale, the renderer cannot draw the new slug.
- App-context patterns list slugs in `components[]`, and `derive-graph.js` **throws** on a reference matching no registry key rather than dropping the edge.

So an additive verdict on such a rename would open an auto-merging pull request
whose required checks can never go green, which is strictly worse than the breaking
path: a breaking verdict at least produces a tracker a human acts on.

`scripts/sync/rename-preconditions.js` is the gate. Rather than teaching gate N+1
about the ledger, it asserts the precondition that makes all of them pass:
**nothing authored still names the retired slug.** Four gates were found one at a
time (anatomy, guideline reachability, render invariants, the graph) and there was
no reason to think the list ended.

Its own `AUTHORED_SURFACES` list is hand-written and therefore rots, so a test
asserts every path in it still exists. A surface that moved would make the scan
find nothing and wave every rename through: the false all-clear it exists to
prevent.

### The procedure

1. Rename in Figma and republish.
2. Let the sync classify. Expect breaking.
3. Update every authored reference to the old slug. Search the whole repository, not just the obvious file.
4. **Search the other repositories too.** One page rename once exposed seven hand-written copies of a slug across three repositories.
5. Confirm the ledger picked it up: `npm run derive:identity` and check `components/dist/identity.json`.
6. Carry the breaking sync through.
7. Verify a consumer has actually read it. The substrate going green proves nothing about the consumer.

**The trap that bites every time:** a rename stops at the namespace boundary.
Icons and components share a name space, so a rename that follows one can silently
empty the other. Chapter 11 has the full account, including why a verification that
uses the same matcher as the edit reports clean.

## Onboarding a new consumer

1. Read [`CONSUMING.md`](../../CONSUMING.md). It ships in the vendor bundle.
2. Import `clients/resolve-paths.js` from the vendored copy rather than reimplementing it. Single source, refreshed on every vendor pull, zero drift.
3. Copy `clients/vendor-snapshot.js` rather than importing it. A build tool must not depend on the bundle it produces, and it has to bootstrap an empty `vendor/`. Keep a drift-guard test comparing your copy to the vendored canonical.
4. Pin a semver range in your `vendored.json`.
5. **Own a version floor guard.** Read `knowledge_version` and refuse anything below your tested floor. The docs site's `MIN_SUPPORTED_KNOWLEDGE` is the pattern.
6. Be a Tolerant Reader: only the fields you need, ignore unknown ones, defaults for absent optionals, no dependence on field ordering.
7. Ship a drift guard that surfaces what you expect to find in the substrate and do not, and the reverse. Divergence is allowed; silent divergence is not.

## Deploying the Editor

`editor-deploy.yml` runs on push to `main` touching `editor/**`, and can be
dispatched. It builds and publishes to GitHub Pages under `/editor/`.

Locally:

```
cd editor
npm install
npm run dev      # http://localhost:5173/
npm test
npm run build
```

The auth worker is deployed separately with wrangler, and its runbooks live in
`auth-worker/README.md`. Two are worth calendaring:

- **Rotate the OAuth client secret** annually or on suspected compromise.
- **Transfer the OAuth App and the Worker** to Actian-owned accounts. Until that happens the Editor's availability depends on one person's personal GitHub and Cloudflare accounts. Chapter 07.

## Before you claim something works

- **Give any ad-hoc verification command a positive control.** Run it against input you know should trip it, and confirm it does, before reporting a pass. `grep` returns 0 matches on files that do contain an em-dash, so every clean result it reported about dashes was meaningless.
- **Check the head SHA.** A green check list can belong to the previous commit, and derive bots push to your branch.
- **Do not let a poll loop pass on absence.** `gh pr checks` prints "no checks reported" before workflows register, so a loop that only greps for pending calls that green while the pull request is blocked. Require a minimum count and zero running.
- **Test against the dist CI will see.** `guidelines-derive` derives and then tests; `validate-manifest` tests the committed dist and never derives guidelines. Run both states and say which one you ran.
