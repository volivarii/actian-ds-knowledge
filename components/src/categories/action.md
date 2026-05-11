---
slug: action
label: Action
authoring_status: engineer-seed
confidence:
  anatomy: medium
  variants: medium
  motion: high
  a11y: high
last_reviewed: 2026-05-11
---

# Action — category defaults

Components in this category invoke a user-initiated action: button, link, sticky-footer. They share an interactive surface with a clear label and well-defined state feedback (hover, focus, active, disabled, loading). Reference patterns: Polaris (Button, Link), Material (Buttons), Carbon (Button). Buttons trigger actions; links navigate — keep semantics aligned with intent rather than visual style.

## Anatomy

- **Container** — interactive surface that carries intent styling, padding, and the focus ring
- **Label** — caller-supplied text describing the action; the accessible name
- **Leading icon (optional)** — decorative or semantic hint anchored before the label
- **Trailing icon (optional)** — affordance hint after the label (caret, external-link, arrow)
- **Loading spinner (optional)** — replaces or augments the label during async work; pairs with disabled-like styling

## Variants

- **Intent** (axis): `primary | secondary | tertiary | destructive`
- **Size** (axis): `small | medium | large`
- **State** (axis): `default | hover | active | focus | disabled | loading`
- **Icon position** (axis): `none | leading | trailing | icon-only`

## Motion

- **State Transitions** — hover, focus, and active feedback use the shared interaction-motion timing (see `foundations/dist/interaction-motion.json`); transitions affect background, border, and elevation, not layout

## Accessibility

- **Keyboard operability** (WCAG 2.1.1) — every action is reachable and activatable from keyboard; buttons fire on Enter and Space, links on Enter
- **Focus visible** (WCAG 2.4.7) — focus ring meets 3:1 contrast against the surrounding surface; never remove the outline without an equivalent indicator
- **Accessible name** (WCAG 4.1.2) — icon-only actions require `aria-label` or visually hidden text; the name describes the action, not the icon
- **Color independence** (WCAG 1.4.1) — destructive, disabled, and active states are not signaled by color alone; pair with icon, text, or border treatment
- **Loading-state announcement** (WCAG 4.1.3) — async actions expose progress via `aria-busy` or a live-region status; the visible spinner alone is not sufficient for assistive tech
- **Link-vs-button semantics** (WCAG 4.1.2) — use `<button>` for actions and `<a href>` for navigation; do not style one as the other without correcting the underlying role
