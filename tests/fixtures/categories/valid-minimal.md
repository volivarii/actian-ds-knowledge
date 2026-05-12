---
_schema_version: 1
slug: test-cat
label: Test category
authoring_status: engineer-seed
confidence:
  anatomy: medium
  variants: medium
  motion: high
  a11y: high
last_reviewed: 2026-05-12

anatomy:
  - { name: Label, description: caller-supplied text }
  - { name: Control, description: the input element }

variants:
  - { axis: State, values: [default, focus, error] }

motion_refs:
  - { ref: state-transitions, note: subtle }

accessibility:
  - { ref: keyboard-focus }
  - { ref: color-contrast }
  - { ref: aria-guidance }
---

# Test body

Some prose here.
