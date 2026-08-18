---
# yaml-language-server: $schema=../../../schemas/app-context-pattern.json
_schema_version: 1
slug: type-picker-grid
label: Type picker grid
apps:
  - studio
tags:
  - grid
  - picker
  - create
  - types
  - selection
when: >-
  Use when creation begins by choosing a type from a grid of equally weighted options,
  grouped by family and filtered by a segmented control. Do not use a dropdown: the grid
  exists because the options carry an icon and a colour that make them recognisable.
components:
  - card-for-items
  - modal
---
Grid of type tiles with color-coded icons for New Item creation.
