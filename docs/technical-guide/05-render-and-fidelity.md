# Render and fidelity

The canonical render tier: hand-authored drawing code that lives in the substrate,
and the two ratchets that stop it from quietly getting worse.

*Numbers read at knowledge v0.34.170 on 2026-09-02, from
`components/render/dist/fidelity-report.json` and `sparse-render.json`.*

## Why drawing code is in the substrate at all

Three layers, and the boundaries are the point:

| Layer | Owns | Where it lives |
| --- | --- | --- |
| **Knowledge** | Facts: tokens, bindings, registries, anatomy, geometry, states, and the canonical drawing code | This repository |
| **Render tier** | Interpretation: turning facts into HTML and CSS, deterministically | This repository, consumed by every surface |
| **Composition** | Which components, what layout, what content | The consumer |

Putting the drawing code here rather than in each consumer means one interpretation
of the facts, not one per surface. It earned its place: when the tag components were
reorganised from eight into three, no consumer needed a drawing change. A consumer
keeping its own copy of the drawing would have had rework.

The line that is easy to cross by accident is the third one. Deciding *which*
component belongs on a screen is composition and belongs to the consumer. The
sparse-render ratchet below exists because the renderer kept drifting across it.

## Which authority it serves

**Design first, and production once engineering's web components are consumable.**
Decided 2026-08-12.

This matters because the render inherits **production** values (a token resolves
through the OKLCH formula in `foundations/src/color-primitives.md`) while the
fidelity gate judges it against **design** values (Figma stores a hand-picked hex).
Until that was settled, every fidelity number was measuring the seam between two
authorities rather than a quality.

The decision extends what `color-primitives.md` already says: defer to Figma for
design decisions and to engineering code for production output. The render tier is
a design-decision surface until there is a shipped implementation to compare
against. So:

- **Today Figma is the oracle**, a divergence from it is a defect rather than a documented difference, and raising the gate's coverage is worth doing.
- **When the web components exist**, the custom elements manifest becomes the source-swap bridge and authority moves to the implementation. The number that matters then is design-versus-development drift, not fidelity against a capture.

One consequence still open: the colours where the computed OKLCH shade disagrees
with Figma's hand-picked hex are now on the wrong side of the authority line rather
than an accepted method difference. They need a correction or a named exception
with an owner. The shade tiers marked "Proposed" in `color-primitives.md` are the
likely explanation and the place to start.

## What is hand-authored

`components/render/renderer/` is source. It is not under a `src/` directory, which
is the layout's one real inconsistency, so it carries `origin: human` in the
manifest instead.

| File | What it is |
| --- | --- |
| `ds-base.css` | The canonical styling |
| `ds-fonts.css`, `fm-base.css` | Font faces, and the Fat Marker wireframe base |
| `html-renderers/ds-html-map.js` | The markup map: slug to HTML |
| `ds-anatomy-map.js` | Slug to anatomy node mapping |
| `anatomy-render.js`, `appearance-render.js`, `appearance-style.js` | The renderers that turn captured facts into styles |
| `matrix.js` | The variant matrix the ratchets probe |
| `default-props.json` | Per-slug default props |

Everything under `components/render/dist/` is generated.

## The pipeline

`npm run derive:render` runs eight scripts in order, and the order is load-bearing:

| Step | Script | Produces |
| --- | --- | --- |
| 1 | `derive-retired-slugs.js` | The retired-slug map the renderer consults |
| 2 | `derive-canonical.js` | `render.css`, `fragments/` (56), `render-manifest.json` |
| 3 | `derive-contract.js` | `render-contract.json`, 56 slugs with their prop surface |
| 4 | `derive-sparse-render.js` | `sparse-render.json`, the no-props baseline |
| 5 | `derive-dtcg.js` | `tokens/dist/tokens.dtcg.json` |
| 6 | `fidelity-check.js` | `fidelity-report.json`, and the gate |
| 7 | `derive-usage-notes.js` | `usage-notes/` (60) |
| 8 | `derive-quality-trend.js` | `quality-trend.json` and `quality-trend.md` |

`custom-elements.json` is the CEM: the contract that becomes the source-swap bridge
when real web components exist.

## The fidelity gate

It is **fact-based, not pixel-based**. It compares the CSS colour declarations the
renderer emits against the colours captured in `components/dist/anatomy/<slug>.json`.
It does not read either WebP in `components/dist/media/`; those are visual
references for humans.

Current state:

| Measure | Value |
| --- | --- |
| Examined declarations | 408 |
| Verified against a captured fact | 75, plus 3 verified by token name |
| Mismatched | 0 |
| Unverifiable | 330 |
| Oracle coverage | 78 of 408 |
| Blind slugs | 32 |

**Report oracle coverage as a pair, never as the ratio alone.** The ratio improves
when declarations leave the denominator, which is not progress. Coverage once fell
from 14.6% to 11.8% with `mismatch` at 0 the whole time and nothing said so.

Why 330 declarations cannot be checked:

| Reason | Count | Means |
| --- | --- | --- |
| `element-no-node-mapping` | 229 | The rendered element has no corresponding node in the capture |
| `state-unreachable` | 37 | The state the declaration styles is not in the capture |
| `no-fact-of-kind` | 23 | The capture holds no fact of that property kind |
| `root-is-variant-instance` | 21 | The captured root is an instance of a variant, not the variant |
| `no-matching-variant` | 14 | No captured variant matches |
| `root-is-non-default-state` | 4 | The capture's root is not the default state |
| `selector-not-attributable` | 2 | The selector cannot be attributed to one node |

`element-no-node-mapping` at 229 is 69% of the unverifiable total, so it is the
single lever on coverage. The token-name verification path is the other: asserting
that the renderer bound the token Figma bound is sound for the roughly 90% of
declarations where hex equality is not, and lifts the ceiling substantially.

### What blocks

Two conditions, and the second is the one people do not expect.

1. **A colour mismatch.** The renderer paints a colour the capture contradicts.
2. **A coverage regression, per slug or in total.** If this run can confirm fewer declarations than the committed report could, the gate names the slugs that lost and blocks.

Per-slug matters independently of the total: a single slug can go completely blind
while a gain elsewhere holds the headline level. The gate blocks on the slug
anyway.

### Why you cannot re-run your way out

**On a blocking loss the run leaves `fidelity-report.json` untouched.** The first
version of the gate wrote the report before evaluating the regression, so anyone
who re-ran to confirm, or who simply committed the regenerated dist, landed the
regression with no reason recorded. That is the laundering path, and leaving the
baseline untouched closes it: the failure reproduces until it is dealt with.

### Landing a deliberate loss

A loss that is the intended consequence of a design change is landed **locally**:

```
npm run derive:render -- --accept-coverage-loss="<why>"
```

then commit the regenerated report. CI invokes the gate with no arguments and
cannot pass the flag, which is deliberate: accepting a loss is a human act with a
name on it. Passing the flag without a reason accepts nothing and says so.

**The reason belongs in the CHANGELOG entry**, because that commit is the only
place it is ever recorded.

## The sparse-render ratchet

The second ratchet, in `tests/render/sparse-render-ratchet.test.js`. It renders
every slug with **no props at all** and fails when a component produces more
visible parts than the committed `sparse-render.json` recorded at the merge base.

The defect it catches is subtle and was shipped before it existed. A literal
fallback in the renderer, put there to make the component gallery look complete,
takes away a caller's ability to render that component *without* that part. One
renderer serves both the gallery and real product screens, so filling 13 slots for
the gallery removed a capability from every real screen.

Current baseline: 56 slugs, 42 of them bearing text, 164 text-bearing elements, 93
invented slots, 124 of 166 contract pairs probed, 56 of 196 matrix cells rendered.

It fails on three things:

| Failure | Means |
| --- | --- |
| A rise in parts, per slug or in total | The renderer invented content a caller did not ask for |
| A `(slug, prop)` pair that starts **replacing** rather than adding | The same defect in a shape a count cannot see: a literal appended inside an element that already carries text, or carried on an attribute |
| A slug the renderer implements that the measurement does not cover | The gate has stopped watching part of its own subject |

That third assertion is the one to copy. A measurement that silently narrows is
worse than no measurement, and asserting per-slug coverage of the measurement
itself is how you find out.

Content gained by design is waived by naming the slug in `ACCEPTED_RISE` with the
exact rise and a reason, or the pair in `ACCEPTED_INVENTED` with a reason. A waiver
applies only when it carries a reason **and** describes the rise in front of it, so
a stale waiver stops applying rather than silently widening.

## The quality trend

`derive-quality-trend.js` produces the one report in this repository that carries
direction rather than a bare number, which is what a report usually wants.

It states oracle coverage as a pair, dates every row, and marks a measure with no
baseline as having none rather than implying stability. At the last source change
it read: 54 unexplained variant collapses (flat), the FM tier's collapsed groups and
unstyled modifier classes (no baseline yet; the current figures are in the report),
31 inline-style hex values that cannot be re-themed (no baseline yet), 78 verified of
408 examined (flat).

The FM figures come from `scripts/render/lib/fm-collapse.js`, which drives the FM
renderer with the FM registry's own axes and values, reads which modifier classes
`fm-base.css` styles with a declaration, and emits the same contract shape the DS
tier's derive does, so `variant-collapse.js` judges both tiers with one classifier,
one State-axis rule and one ledger shape (`fm-collapse-by-design.js`). They joined as
measures rather than gates because the tier was sized at dozens of groups on the day
the DS tier's css-owner rule was found to have no FM twin (#554).

## Known gaps

- **Oracle coverage is 78 of 408.** Most of what the renderer paints cannot be checked against Figma at all, and `element-no-node-mapping` is 229 of the 330.
- **31 inline hex values cannot be re-themed.** They bypass tokens entirely.
- **54 variant collapses are unexplained.** A component asked for by one variant can render as another, which is a correctness defect rather than a cosmetic one.
- **The FM tier's axis values render alike by the dozen.** The fat-marker renderer emits a class for nearly every registry value and the stylesheet styles few of them, so Size, Shape and most State axes draw the same thing. The two buttons a reader could not see at all (#554) are fixed; the rest is the measure's burndown.
- **Measurement is not looking.** Fixing a mismatch once made `segmented-control` white on white while every number improved. Render the thing and look at it.
