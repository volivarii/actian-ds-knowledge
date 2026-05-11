---
slug: feedback
label: Feedback
authoring_status: engineer-seed
confidence:
  anatomy: medium
  variants: medium
  motion: high
  a11y: high
last_reviewed: 2026-05-11
---

# Feedback — category defaults

Components in this category communicate system status or outcome to the user: alert-banner, confirmation, empty-state, error-state, loader, loader-with-logo, loading-skeleton, maintenance-banner, maintenance-state, notification, spinner. They share severity semantics, live-region behavior, and dismissibility rules. Reference patterns: Polaris (Banner, Toast, EmptyState), Material (Snackbar, Progress indicators), Carbon (Notification, Loading). Skeleton and loader variants share the container shape but invert the role — they signal pending state rather than an outcome.

## Anatomy

- **Container** — bounded surface that scopes the feedback; carries severity styling
- **Severity icon** — leading glyph that conveys info, success, warning, or error
- **Title (optional)** — short summary line; required for full-page error and maintenance states
- **Body text** — the explanation; identifies what happened and the recommended next step
- **Actions (optional)** — link or button that resolves or acknowledges the message
- **Dismiss control (optional)** — close affordance for transient or user-dismissible variants
- **Loader shape (skeleton/loader subset)** — placeholder geometry with optional progress indicator and label

## Variants

- **Severity** (axis): `info | success | warning | error`
- **Persistence** (axis): `transient | persistent`
- **Layout** (axis): `inline | toast | banner | full-page`

## Motion

- **Success Toast** — transient feedback enters with a short slide-and-fade, dwells, and dismisses; timing from motion foundations
- **Skeleton Loading** — shimmer or pulse loop while content is pending; loop pauses when content resolves
- **State Transitions** — severity changes (e.g., warning to error within a persistent banner) cross-fade icon and surface color without remounting the container

## Accessibility

- **Role assignment** (WCAG 4.1.2) — errors and high-severity feedback use `role="alert"`; informational status uses `role="status"`; static empty/error states are headings plus body, not alerts
- **Live region politeness** (WCAG 4.1.3) — errors are `aria-live="assertive"`; success and info are `aria-live="polite"`; never `assertive` for low-severity status
- **Focus management on transient vs persistent** (WCAG 2.4.3) — transient toasts do not steal focus; persistent banners and full-page states move focus to the heading or first action when surfaced
- **Accessible action labels** (WCAG 2.4.6) — action labels describe the resolution ("Retry", "Dismiss"), not the visual ("Click here"); action and dismiss are distinguishable
- **Dismiss keyboard support** (WCAG 2.1.1) — dismiss controls are reachable from keyboard; Escape closes user-dismissible toasts and banners when focus is within them
- **Color independence for severity** (WCAG 1.4.1) — severity is conveyed by icon plus text in addition to color; never color alone
