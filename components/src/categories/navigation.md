---
slug: navigation
label: Navigation
authoring_status: engineer-seed
confidence:
  anatomy: medium
  variants: medium
  motion: high
  a11y: high
last_reviewed: 2026-05-11
---

# Navigation — category defaults

Components in this category move the user between locations or steps: account-dropdown, app-switcher-dropdown, breadcrumbs, global-header, notification-dropdown, side-nav, stepper, stepper-buttons, tabs, traffic-light, whats-new-dropdown. They share a current-location concept, keyboard traversal expectations, and landmark semantics. Reference patterns: Polaris (Navigation), Material (App Bar, Navigation Drawer, Tabs), Carbon (UI Shell, Tabs, Breadcrumb).

## Anatomy

- **Container** — landmark surface (header, nav, aside) that scopes the navigation region
- **Items list** — ordered set of links, tabs, or steps; each item is the primary interactive target
- **Current-item indicator** — visual treatment that marks the active location or step
- **Item icon (optional)** — leading glyph paired with the item label
- **Badge or count (optional)** — numeric or dot indicator attached to an item
- **Separator (optional)** — divides groups or path segments (e.g., breadcrumb chevrons)

## Variants

- **Orientation** (axis): `horizontal | vertical`
- **Density** (axis): `compact | comfortable`
- **Current-state** (axis): `active | inactive`
- **Icon usage** (axis): `with-icons | without-icons`

## Motion

- **State Transitions** — hover, focus, and active item changes use the shared interaction-motion timing; transitions affect indicator position, background, and color, not layout
- **The Anchor Motion** — applies when navigation surfaces use anchored dropdowns (account, app-switcher, notification, whats-new); the panel anchors to the trigger and animates from it

## Accessibility

- **Landmark roles** (WCAG 1.3.1) — primary navigation uses `<nav>` or `role="navigation"`; multiple navs on a page each carry a distinct `aria-label`
- **Current-page indication** (WCAG 4.1.2) — the active item is exposed via `aria-current="page"`, `aria-current="step"`, or `aria-selected` (tabs); visual treatment alone is not sufficient
- **Keyboard navigation** (WCAG 2.1.1) — items reachable in DOM order; tabs follow the WAI-ARIA tabs pattern (arrow keys move focus, Tab leaves the list); dropdowns expose Enter/Space to open and Escape to close
- **Skip links** (WCAG 2.4.1) — long primary navigation precedes a "skip to main content" link so assistive-tech users can bypass it
- **Focus order** (WCAG 2.4.3) — focus order matches visual order; orientation changes (vertical vs horizontal) preserve a single logical sequence
- **Accessible label clarity** (WCAG 2.4.6) — item labels describe the destination, not the visual treatment; icon-only items carry `aria-label`
