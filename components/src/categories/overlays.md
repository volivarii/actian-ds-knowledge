---
slug: overlays
label: Overlays
authoring_status: engineer-seed
confidence:
  anatomy: medium
  variants: medium
  motion: high
  a11y: high
last_reviewed: 2026-05-11
---

# Overlays — category defaults

Components in this category render above the page on a transient layer: chat-with-ai-steward, drawer-side-panel, modal, popover, tooltip. They share trigger-anchored or modal-layered behavior, focus-management rules, and dismissal patterns. Reference patterns: Polaris (Modal, Popover), Material (Dialog, Tooltip, Bottom Sheet), Carbon (Modal, Tooltip). The trigger is owned by the calling surface (button, link, control) and is not part of the overlay itself.

## Anatomy

- **Backdrop or scrim** — modal-only dim layer that blocks the page beneath; drawers may use a partial scrim
- **Container** — the overlay surface itself; carries elevation, radius, and motion origin
- **Header** — title plus close affordance; required for modals and drawers, optional for popovers
- **Body content** — the overlay payload; rich content for modals/drawers, short content for popovers/tooltips
- **Footer (optional)** — primary and secondary actions for modals and drawers
- **Arrow or pointer (popover/tooltip only)** — connects the overlay to its anchor

## Variants

- **Size** (axis): `small | medium | large | full`
- **Position** (axis): `center | edge | anchored`
- **Backdrop** (axis): `visible | transparent | none`
- **Dismissibility** (axis): `dismissible | required-action`

## Motion

- **Layered Overlays — Modals** — modals enter with a scrim fade plus container scale-up from center; exit reverses; timing from motion foundations
- **Drawer** — drawers slide in from the anchored edge with easing; the scrim fades in parallel
- **The Anchor Motion** — popovers and tooltips animate from their trigger anchor; the arrow stays attached to the anchor through entry and exit

## Accessibility

- **Focus trap** (WCAG 2.4.3) — modals and drawers trap focus inside the container while open; Tab and Shift+Tab cycle within the overlay
- **Focus restore on close** (WCAG 2.4.3) — on dismiss, focus returns to the trigger that opened the overlay; if the trigger is gone, focus moves to a sensible fallback
- **Escape to dismiss** (WCAG 2.1.1) — Escape closes dismissible overlays; required-action modals (e.g., confirm destructive) opt out and announce why
- **Accessible name** (WCAG 4.1.2) — the overlay container references its title via `aria-labelledby`; descriptive body content uses `aria-describedby` when needed
- **Backdrop click behavior consistency** (WCAG 3.2.4) — backdrop-click dismissal is consistent across overlays of the same dismissibility variant; never dismiss required-action overlays via backdrop click
- **Role assignment** (WCAG 4.1.2) — modals and drawers use `role="dialog"` with `aria-modal="true"`; tooltips use `role="tooltip"`; popovers use the appropriate ARIA pattern for their content
