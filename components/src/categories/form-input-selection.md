---
slug: form-input-selection
label: Form (input & selection)
authoring_status: engineer-seed
confidence:
  anatomy: medium
  variants: medium
  motion: high
  a11y: high
last_reviewed: 2026-05-11
---

# Form (input & selection) — category defaults

Components in this category share input/selection patterns: labeled controls, validation feedback, focus management, error association. Members (Phase 0 Figma sync): calendar, checkbox-with-label, dropdown-select-default, input, input-date, radio-button, rich-text, search, search-dropdown-menu, search-filters, toggle. Reference patterns: Polaris (TextField/Select), Material (Text Field/Selection Controls), Carbon (Form/Input).

## Anatomy

- **Label** — caller-supplied text, programmatically bound to the control via `for`/`aria-labelledby`
- **Required indicator** — visible asterisk or text, decorative; semantics carried by `aria-required` on the control
- **Control** — the actual input/select/checkbox/radio element
- **Helper text** — optional persistent guidance below the control
- **Validation message** — error / warning / success, replaces helper text when active; `aria-live="polite"`
- **Leading icon (optional)** — decorative or semantic hint (e.g., search magnifier)
- **Trailing icon (optional)** — often interactive (clear, reveal, dropdown caret)

## Variants

- **State** (axis): `default | focus | error | disabled | read-only`
- **Size** (axis): `small | medium | large`
- **Label position** (axis): `top | inline`

## Motion

- **State Transitions** — focus-ring fade-in on focus, opacity transition on disabled, instant copy swap on validation reveal (no animated text)

## Accessibility

- **Label association** (WCAG 1.3.1, 3.3.2) — every form control has a visible label programmatically bound via `for` or `aria-labelledby`; placeholder text is never a label
- **Error announcement** (WCAG 3.3.1, 3.3.3, 4.1.3) — validation messages use `aria-live="polite"` or are referenced by `aria-describedby` on the control; messages identify the field and the fix
- **Required indication** (WCAG 3.3.2) — not signaled by color alone; uses `aria-required="true"` or the `required` attribute; visible asterisk supplements but does not replace
- **Keyboard operability** (WCAG 2.1.1, 2.1.2) — all controls operable from keyboard with standard tab order; no keyboard trap; custom controls implement expected key behaviors
- **Focus visible** (WCAG 2.4.7) — visible focus ring meets 3:1 contrast against background; never `outline: none` without a replacement indicator
- **Color independence** (WCAG 1.4.1) — error / success / disabled state never signaled by color alone; pair color with icon, text, or pattern
