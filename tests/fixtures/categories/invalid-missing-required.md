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
  - { axis: State, values: [default, focus] }

motion_refs:
  - { ref: state-transitions }
---

# Missing accessibility key
