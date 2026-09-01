# Technical guide

The complete working knowledge of `actian-ds-knowledge`: what it is for, how it is
built, how to change it, and what breaks quietly if you get it wrong.

**Who this is for:** anyone who has to run, extend, or inherit the substrate. It
assumes you can read JavaScript and a GitHub Actions workflow. It assumes nothing
about design systems, Figma, or this repository.

**What it is not:** it is not the consumer on-ramp (that is
[`CONSUMING.md`](../../CONSUMING.md), which ships inside every consumer's vendored
snapshot), and it is not the doctrine of record (that is
[`GOVERNANCE.md`](../../GOVERNANCE.md)). This guide routes to both and never
restates either as authority.

This guide is a contributor document. It is structurally absent from every
consumer's vendor bundle: `scripts/derive-vendor-include.js` builds the
distributable surface from manifest path prefixes plus a fixed contract set, and
`docs/` is in neither.

## Read routes

| You are | Read |
| --- | --- |
| **Inheriting the whole thing** | All of it, in order. Chapter 11 last and twice |
| **Contributing a change** | 02, then 09, then the chapter for the domain you are touching |
| **Building a consumer** | [`CONSUMING.md`](../../CONSUMING.md) first, then 03 for the producer side of the same contract |
| **Debugging a red check** | 08 for what the gate asserts, 11 for what it does not |
| **Deciding whether a change is allowed** | 01, then the checklist in [`GOVERNANCE.md`](../../GOVERNANCE.md) |

## Chapters

| # | Chapter | Answers |
| --- | --- | --- |
| 01 | [Philosophy](01-philosophy.md) | Why the substrate is shaped this way, and which changes the shape forbids |
| 02 | [Architecture](02-architecture.md) | The four zones, the `src`/`dist` rule, and where every kind of thing lives |
| 03 | [The contract](03-contract.md) | `paths-manifest.json`, schemas, `llms.txt`, semver, and what consumers may depend on |
| 04 | [The domains](04-domains.md) | Each domain end to end: inputs, deriver, outputs, schema, owner |
| 05 | [Render and fidelity](05-render-and-fidelity.md) | The canonical render, the authority it serves, and its two ratchets |
| 06 | [The graph](06-graph.md) | What projects into it, the closed vocabulary, and why it is read-only |
| 07 | [Editor and auth](07-editor-and-auth.md) | The authoring surface, its engines, and the Cloudflare auth worker |
| 08 | [Pipelines](08-pipelines.md) | All 19 workflows, and the version chain from a dist change to a consumer |
| 09 | [How to author](09-how-to-author.md) | Add content, add a domain, add a manifest entry, land a breaking change |
| 10 | [How to operate](10-how-to-operate.md) | Run it locally, recover a failed sync, carry a rename through, onboard a consumer |
| 11 | [Traps](11-traps.md) | The failure modes that pass every check while being wrong |

## Related documents in this repository

| File | Job | Vendored to consumers |
| --- | --- | --- |
| [`GOVERNANCE.md`](../../GOVERNANCE.md) | The adopted doctrine and its pass/fail checklist | No |
| [`CONSUMING.md`](../../CONSUMING.md) | The consumer on-ramp | Yes |
| [`ARCHITECTURE.md`](../../ARCHITECTURE.md) | The zone map, short form, for a reader inside a vendor bundle | Yes |
| [`CHANGELOG.md`](../../CHANGELOG.md) | What changed, and the only record of why a deliberate coverage loss was accepted | No |
| [`SMOKE_LOG.md`](../../SMOKE_LOG.md) | Manual verification runs | No |
| [`CLAUDE.md`](../../CLAUDE.md) / [`AGENTS.md`](../../AGENTS.md) | Rules for an AI agent working here | No |

## Keeping this guide true

Every number in these chapters carries the version and date it was read. Counts
move; the shapes do not. When a chapter's number and the repository disagree,
the repository is right and the chapter is stale, so fix it in the same pull
request that moved the number.

The failure this guide is most likely to have is the one it documents in chapter
11: a list written by hand next to data that has moved on. Where a chapter states
a count, it also names the command that produces it, so the claim can be checked
rather than trusted.
