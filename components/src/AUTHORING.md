# Authoring per-component guidelines

Each component's guidelines live in a directory under `components/src/<slug>/`,
with **one file per domain**. Every domain is optional — author what exists,
leave the rest.

```
components/src/<slug>/
  _meta.yml      (required)  metadata + the per-domain status matrix
  content.md     (optional)  Content guidelines — UX writing
  usage.md       (optional)  Usage guidelines — when to use, variant selection
  design.md      (optional)  Design guidelines — anatomy, layout, visual rules
  behavior.md    (optional)  Behavior / accessibility / implementation
  tokens.yml     (optional)  Component-specific token bindings
```

The deriver (`scripts/components/derive-guidelines.js`, `npm run derive:guidelines`)
merges every directory into `components/dist/guidelines/<slug>.json`, plus a
`guidelines.bundle.json` roll-up and a `coverage.md` matrix.

## `_meta.yml`

Required. Declares the component name and the status of every domain. The
deriver uses `domains` as the source of truth — it decides which domain files
to expect.

```yaml
component: Button            # human-readable name (required)
category: action             # category slug — joins to category-defaults
section: COMPONENTS          # optional — Figma section
related: [link, icon]        # optional — related component slugs
domains:
  content:  { status: approved, owner: content-team, updatedAt: 2026-05-10 }
  usage:    { status: draft, owner: design, updatedAt: 2026-05-12 }
  design:   { status: inherited }
  behavior: { status: inherited }
  tokens:   { status: not-started }
```

### Domain status

| status        | meaning                                                        | source file |
|---------------|----------------------------------------------------------------|-------------|
| `approved`    | team-signed-off                                                | must exist  |
| `draft`       | authored, not yet reviewed                                     | must exist  |
| `inherited`   | intentionally not component-specific — consumers resolve the body from this component's category-defaults | must NOT exist |
| `not-started` | declared but empty — a visible documentation-debt marker       | must NOT exist |

A domain omitted from `domains` is omitted from the derived object entirely.
`inherited` is the right answer for most Behavior / Tokens domains — it means
"the category default is correct here," not "this is missing."

## Domain markdown files (`content.md`, `usage.md`, `design.md`, `behavior.md`)

Plain markdown. Frontmatter is optional. The deriver keeps the verbatim body
(for LLM consumers) and also parses it into a structured `sections[]`
projection (for the docs renderer + the plugin):

- `## Heading` opens a section.
- `### Subheading` opens one reserved level of nesting. Deeper headings
  (`####` and below) are flattened into the nearest section's content as
  `{ note }` items — there is only one reserved nesting level.
- Bullet lists become string items.
- A `| Do | Don't |` table becomes `{ do, dont }` items.
- A terminology table (`| Term | Usage |`) becomes `{ term, rule }` items.
- Any other table is preserved as a generic `{ table }` item.
- Paragraphs and blockquotes become `{ note }` items.
- Fenced code blocks become `{ example }` items.

You do not need to think about the projection — write normal markdown. The
verbatim body is always retained, so the structured view is a convenience,
not a constraint.

## `tokens.yml`

Component-specific token bindings — references into `tokens/tokens.json`, never
embedded values:

```yaml
bindings:
  - { token: button-height-md, context: Minimum height }
  - { token: corner-radius-full, context: Corner rounding }
```

## Schemas

- `schemas/guideline-meta.json` — `_meta.yml`
- `schemas/guideline-tokens.json` — `tokens.yml`
- `schemas/guideline-component.json` — the derived per-component object

Add a `# yaml-language-server: $schema=...` comment at the top of your YAML
files for editor validation.
