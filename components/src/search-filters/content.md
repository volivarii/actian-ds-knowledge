---
title: "Search filters"
---
# Search filters

Search filters narrow a set of search results by attribute, such as type, owner, or domain. They refine what is already returned without changing the query.

***

## When to use

- Alongside [search](search) results when users need to narrow a large result set.
- For the general result-refinement pattern outside of search, see [filters](filters).

## Style

- Filter labels use short noun phrases that match the attribute. For example, "Type", "Owner", "Data domain".
- Use sentence case for labels and option values.
- Show the active filter count when filters are collapsed. For example, "Filters (3)".
- Keep terminology consistent with the [filters](filters) used elsewhere in the product.

## Behavior

- Update results as filters are applied, and keep the original query visible.
- Provide a "Clear all" action when any filter is active.
- Show how many results remain after filtering.

## Do / Don't

| Do | Don't |
|---|---|
| Owner | Filter by owner |
| Filters (3) | 3 filters are currently applied |
| Clear all | Reset everything |
