---
slug: data-display
label: Data Display
authoring_status: engineer-seed
confidence:
  anatomy: medium
  variants: medium
  motion: high
  a11y: high
last_reviewed: 2026-05-11
---

# Data Display — category defaults

This is the broadest category in the DS (31 components, e.g., avatar, badge, bar-graph, card, collapse-accordion, data tables, tiles, lists, tags). Members share a render-data-without-mutation role: containers, headers, body content, optional state indicators. Reference patterns: Polaris (Data display), Material (Cards/Lists/Tables), Carbon (Data Table, Tile, Tag). Because the category spans surfaces from tags to data tables, these defaults are intentionally general — component-specific guidelines should override liberally.

## Anatomy

- **Container** — bounded surface that scopes the data presentation (card, tile, table, row, badge)
- **Header (optional)** — title plus optional actions, metadata, or filters; carried by tables, cards, accordions
- **Body content** — the rendered data: text, numbers, charts, rows, list items, avatar imagery
- **Footer (optional)** — supplementary actions, totals, pagination, or metadata
- **State indicator (optional)** — sort caret, selected check, expanded chevron, badge severity, loading shimmer

## Variants

- **Density** (axis): `compact | default | comfortable`
- **State** (axis): `default | hover | selected | expanded`
- **Border / Elevation** (axis): `flat | outlined | elevated`

## Motion

- **State Transitions** — hover, selected, and expanded state changes use the shared interaction-motion timing; transitions affect background, border, and indicator position, not layout
- **Accordion** — expand/collapse uses height transition with easing from motion foundations; content fades in after the container reaches target height
- **Staggered Entrance** — long lists and grids reveal items with a short stagger to convey order; total duration capped to avoid perceived lag

## Accessibility

- **Semantic structure** (WCAG 1.3.1) — use `<table>` for tabular data, `<ul>`/`<ol>` for lists, `<h2>`–`<h4>` for card titles; do not collapse semantics into generic divs
- **Keyboard navigation in interactive cells** (WCAG 2.1.1) — actionable cells (links, buttons, checkboxes) are reachable in DOM order; data-grid patterns follow the WAI-ARIA grid keyboard model when used
- **Sortable column announcements** (WCAG 4.1.2) — sortable headers expose `aria-sort="ascending"`, `"descending"`, or `"none"`; sort change is announced via a live region
- **Expand/collapse announcements** (WCAG 4.1.2) — accordion triggers expose `aria-expanded`; the controlled region is referenced via `aria-controls`
- **Focus management in expandable content** (WCAG 2.4.3) — expanding does not move focus unexpectedly; collapsing returns focus to the trigger if it would otherwise be lost
- **Data table headers** (WCAG 1.3.1) — every data column has a `<th scope="col">`; row headers use `scope="row"`; complex tables use `headers`/`id` association
