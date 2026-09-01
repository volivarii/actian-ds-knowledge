# Philosophy

Why the substrate is shaped the way it is, and which changes that shape forbids.

The rules here come from two places. The eight principles are the repository's own
adopted doctrine, stated at length with their research provenance in
[`GOVERNANCE.md`](../../GOVERNANCE.md); this chapter gives their working form and
routes back there for the argument. The rules in "What the machinery taught" are
cross-repository doctrine, held in `product-ds/doctrine.md` in the
`actian-ds-ecosystem` repository, and restated here in the terms of this codebase.

## What the substrate is for

One place where a design-system fact is decided, and any number of surfaces that
read it without being able to bend its shape.

That is the whole idea, and the second half is the hard half. A source of truth
with one consumer is just that consumer's data directory. What makes this a
substrate is that the plugin, the docs site, the Editor, and every surface not yet
built all read the same artifacts, and none of them can ask for a different shape.
When a consumer needs something else, it adapts on its own side.

## The founding idea: agnostic is not structureless

An unstructured source of truth is not agnostic. It is opaque, and it pushes the
cost of interpretation onto every consumer that reads it.

True agnosticism is the absence of *consumer-specific* structure, not the absence
of structure. A structure anchored to the design domain (component, token,
foundation, pattern, anatomy, variant, state) is simultaneously the most stable and
the most agnostic available, because those are the same property: the domain
changes slowly and deliberately, while consumer needs change fast and conflict with
each other.

So "consumers adapt, but benefit from a stable structure" is not a compromise
between two goals. It is what domain-anchored design produces on its own.

## The eight principles, in working form

Each principle is a question to ask of a proposed change. A "no" is not a veto: it
is a flag that the change is either creating coupling debt or is a breaking change
that has to be governed rather than merged.

| # | Principle | The question it makes you ask | What it forecloses |
| --- | --- | --- | --- |
| P1 | Domain-anchored structure | Is every new name a design-system concept rather than a consumer's UI, route, tool, or file format? | Naming anything after the consumer that happens to want it first |
| P2 | Consumers adapt, the source never bends | Could this need be met in the requesting consumer's own adapter instead? | Restructuring the substrate to fit any one editor, renderer, or tool |
| P3 | The contract is explicit and published | Is the change documented in the schema or manifest, with types and meaning, so consumers know what they may rely on? | "It just happens to work that way" as a contract |
| P4 | Typed, presentation-free fields | Is the change free of display hints in field names, types, or values? | A prose-blob substrate, and presentation leaking into source |
| P5 | Additive by default, breaking changes governed | Is this purely additive? If not, does it carry a major bump, an expand-contract migration, a deprecation window, and confirmed consumer awareness? | Silent renames and unilateral removals |
| P6 | Stable identifiers, never derived from editable prose | Are the slugs, keys and anchors explicit in source rather than computed from heading text? | "Rename a heading, break a consumer" |
| P7 | Internal organisation is not the external contract | If this moves files, is it absorbed behind the manifest so the consumer-facing contract is unchanged? | Consumers hardcoding paths, and treating the directory tree as the API |
| P8 | Transversal taxonomies use slug refs, never duplication | Does the cross-domain reference use `{ref: <slug>, note?: <string>}` with a derive-time check that the slug exists? | Duplicated transversal content, and novel ref shapes per domain |

The full statement of each, with the evidence that motivated it and the pass/fail
checklist to run a change through, is in [`GOVERNANCE.md`](../../GOVERNANCE.md).
That file is the doctrine of record. This table is a working summary and does not
overrule it.

## Where the principles actually bite

Three situations account for most of the times a principle decides something.

**A consumer asks for a shape.** The plugin wants cards, the docs site wants pages,
an LLM surface wants prose, a Storybook wants prop tables. P2 and P4 together say
the substrate ships typed domain entities and each consumer projects them. Promote
any one of those projections into the schema and you have served one consumer at
the cost of the rest.

**Something gets renamed.** P6 is the reason identifiers are explicit in source
rather than derived from headings, and P5 is the reason a rename is a governed
change rather than a merge. The concrete mechanism is chapter 10's rename
procedure, and the concrete trap is chapter 11: a rename in this repository stops
at the namespace boundary, because icons and components share a name space and a
rename that follows one silently empties the other.

**The layout wants to change.** P7 says this is free, as long as it is absorbed
behind `paths-manifest.json`. That indirection is not a nicety. It is what makes
internal reorganisation a non-event for four consumers, and it is checked: the
`validate-manifest` gate fails on a path that does not resolve and on a file that
no manifest entry claims.

## The consumer's half of the bargain

The doctrine binds consumers too. Every consumer must be a Tolerant Reader:

- read only the fields it needs, and ignore unknown fields rather than failing on them
- use defaults for absent optional fields
- never depend on field ordering or exhaustive key enumeration
- pin a schema major version and own a version floor guard

A producer that honours P5 and a consumer that reads tolerantly together make a
substrate that can evolve in both directions without breaking. Either half alone is
not enough, and the asymmetry is real: the docs site has a `MIN_SUPPORTED_KNOWLEDGE`
floor, and that is the pattern a new consumer should copy.

## Presentation divergence is allowed, silent drift is not

A consumer that renames sections, reorders pages, omits things, or adds its own
prose is doing its job. The substrate stays domain-anchored and renderer-agnostic;
what a consumer does with it is that consumer's opinion.

Two obligations come with that freedom. Make the divergence observable: a consumer
presenting substrate data should show readers where it came from. And ship a drift
guard: a check that surfaces sections it expects to find in the substrate but does
not, and the reverse. The aim is divergence that is intentional and visible, not
divergence nobody noticed.

## What the machinery taught

These are consequences rather than judgments. Each was learned by shipping the
failure it describes, and each is a fact about how this machinery fails rather than
an opinion to disagree with.

**Measure at the surface, not at the source.** Nine components had usage guidance
that was authored, reviewed and published, but was not connected to where the
plugin looked for it. Finding nothing, the plugin generated replacement text and
presented it as design-system guidance. The authored count was correct the whole
time and told you nothing. Prefer the metric that ends at a human reading the
thing.

**A change is not proven until a consumer has eaten it.** The substrate going green
is a statement about the substrate. Chapter 08's version chain is the mechanism by
which a merged change becomes a tag and then reaches a consumer, and every link in
it has failed at least once while the checks above it stayed green.

**Replace the list with the read.** A hand-written list of things that live
somewhere else goes stale, and a stale list iterated against real data does not go
red. It resolves to nothing, the loop body never runs, and the final assertion
compares two empty sets. One Figma page rename once exposed seven hand-written
copies of a slug across three repositories, and disarmed four gates that then
checked nothing while staying green. Read the list from the producer, and assert
the join rather than the count.

**A gate must assert its subject was present.** If a check iterates, filters,
splits or looks something up, an empty result is indistinguishable from a clean
result unless the check says otherwise. `[].forEach(...)` runs nothing and reports
success.

**A gate must assert its own postcondition, and report direction.** Proving the
step ran is not proving it took effect. And any gate shaped "regenerate the derived
set and fail if it differs" reports a set inequality whose two directions mean
opposite things: something added is a gain, something removed is a capability
regression, and a failure message that says "regenerate and commit" launders the
second into a green build.

**A gate can be tautological, so prove it can fail.** Mutate the specific thing the
gate guards and watch it go red. A test never seen to fail has not been shown to
work.

**Never silence a signal.** When a check goes red, fix the cause or record the
decision by name. The rule is not "never ship red", it is never *quietly* widen the
tolerance. A warning printed inside a job that finishes green is not a signal:
two nightly syncs ran frozen for three days that way, reporting success.

**Absence does not state its cause.** A slug missing from a registry is a rename,
an unpublish, or a retirement, and the correct response to each is different. Read
the producer's commit rather than inferring from the consumer's red.

## What this shape costs

Being honest about the price is part of the doctrine, so:

- **Two hops to change anything visual.** A token value or a component's anatomy
  cannot be edited here. It is decided in Figma and arrives through the sync. That
  is deliberate under P2 and P4, and it means a designer's fix waits for a sync.
- **Additive-by-default accretes.** P5 makes adding free and removing expensive, so
  the substrate accumulates fields that nothing reads. Retirement is real work and
  it is nobody's default.
- **The indirection has a learning cost.** Nothing can be found by guessing a path.
  A new contributor has to learn that `paths-manifest.json` is the index before
  anything else makes sense.
- **Derived data must be committed.** `dist/` is in the repository so consumers can
  vendor a snapshot without a build step. The price is large generated diffs and a
  set of drift guards that exist only to keep committed derived data honest.
