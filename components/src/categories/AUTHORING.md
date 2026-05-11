# Category defaults — Authoring guide

> Audience: Actian Design system lead + Content lead. This guide covers
> the per-category default files in `components/src/categories/`. For
> the broader components-page convention (category headers, status
> emojis) see `components/AUTHORING.md`.

## Purpose

Category default files describe what every component in a category
shares: anatomy parts, variant axes, motion patterns, and accessibility
requirements. They feed the plugin's `/component-brief` skill, which
merges these defaults into per-component briefs when a specific
component guideline does not yet exist or only partially covers a card.

Engineer-seeded drafts establish a baseline; the Design system lead +
Content lead refine them async. Component-specific guidelines always
override category defaults.

## One file per category

Exactly six files, one per Figma category label:

| File | Figma category label |
| --- | --- |
| `action.md` | `Action` |
| `form-input-selection.md` | `Form (input & selection)` |
| `navigation.md` | `Navigation` |
| `data-display.md` | `Data Display` |
| `feedback.md` | `Feedback` |
| `overlays.md` | `Overlays` |

Each MD source compiles to `components/dist/categories/<slug>-defaults.json`.

## Required frontmatter schema

Every file starts with a YAML frontmatter block. The parser supports a
tiny YAML subset — top-level `key: value` plus a single nested block
under `confidence:`. No arrays, no quoting.

```yaml
---
slug: form-input-selection           # kebab-case; matches filename
label: Form (input & selection)      # Figma category label, verbatim
authoring_status: engineer-seed      # see state machine below
confidence:
  anatomy: medium                    # low | medium | high
  variants: medium
  motion: high
  a11y: high
last_reviewed: 2026-05-11            # ISO date of the latest team review
---
```

## `authoring_status` state machine

- `engineer-seed` — initial draft authored by engineering using
  cross-DS patterns (Polaris, Material, Carbon) and existing repo
  sources. Treat as a strawman.
- `team-reviewed` — Design system lead + Content lead have read it and
  agree it is directionally correct. Minor wording fixes have landed.
- `team-authored` — Content fully ownership; lead has rewritten or
  validated each card. Confidence levels should reflect this stage.

Flip the value when promoting; bump `last_reviewed` on every promotion
and on substantive edits.

## `confidence` levels

Set per card. Used by the brief skill to decide how loudly to surface
the defaults when no component-specific guideline exists.

- `low` — placeholder; expect the brief skill to omit or hedge
- `medium` — engineer-seed baseline; usable but not yet validated by
  the team
- `high` — content-lead-authored or directly distilled from an
  authoritative source already in this repo (motion foundations,
  accessibility.md)

A common pattern at `engineer-seed` is `anatomy: medium, variants:
medium, motion: high, a11y: high` — because motion and a11y are
distilled from existing authored sources.

## MD structure rules

Every category MD must contain these four H2 sections in this exact
order:

```markdown
## Anatomy
## Variants
## Motion
## Accessibility
```

The parser (`scripts/categories/categories-parser.js`) is the ground
truth for grammar. Quick reference:

- **Anatomy** — bullets of the shape `- **Part Name** — description`.
  Em-dash or hyphen separator; at least one bullet required. No
  asterisks or backticks inside the part name.
- **Variants** — bullets of the shape
  `` - **Axis Name** (axis): `value-a | value-b | value-c` ``. Pipe-
  separated values inside backticks. Values are lowercase to match
  code-side variant strings.
- **Motion** — same shape as Anatomy: `- **Pattern Name** — note`.
  Reference patterns from `foundations/dist/interaction-motion.json`
  where applicable.
- **Accessibility** — bullets of the shape
  `- **Title** (WCAG x.x.x, y.y.y) — body text`. **Exactly 6 entries
  required** (the parser enforces this). Use specific WCAG success
  criterion numbers.

If a bullet is silently dropped by the parser, the most common cause is
a stray inline asterisk or backtick inside the `**Name**` portion.

## Worked example

`form-input-selection.md` is the worked example. Copy its shape when
editing or seeding another category.

## Adding a new category

1. Add the category header to the DS Kit Figma file using the page-
   section convention (see `components/AUTHORING.md`).
2. Add the slug to the `KNOWN_CATEGORIES` allowlist in the plugin's
   `transform-categories.js` (see `volivarii/Actian-DS-Claude-plugin`).
3. Create `components/src/categories/<slug>.md` matching the structure
   above.
4. Run `node scripts/categories/__cli.js` to generate the dist file.
5. Open a PR — CI regenerates dist and posts a semantic diff.

## CI behavior

`.github/workflows/derive-categories.yml` regenerates every dist file
on every PR that touches `components/src/categories/**` and fails the
build if any source MD does not parse. Always commit the regenerated
dist JSON alongside the MD source.
