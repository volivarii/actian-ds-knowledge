---
# yaml-language-server: $schema=../../../schemas/app-context-pattern.json
_schema_version: 1
slug: analytics-dashboard
label: Analytics dashboard
apps:
  - studio
tags:
  - dashboard
  - metrics
  - charts
  - monitor
  - adoption
when: >-
  Use for the aggregate view over a whole catalog: a grid of per-type completion cards
  beside a rail of charts. Do not use documentation-completion-dashboard, which scores
  individual items against criteria; this one answers how the catalog is doing, not which
  item is behind.
components:
  - card-for-items
  - bar-graph
  - line-graph
  - page-header
---
Completion cards, adoption rate charts, popular items, frequent searches.
