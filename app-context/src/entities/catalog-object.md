---
# yaml-language-server: $schema=../../../schemas/app-context-entity.json
_schema_version: 1
slug: catalog-object
label: Catalog Object
properties:
  - name
  - description
  - { name: type, type: enum, example: "Dataset, Data Product, Glossary Term, Domain" }
  - { name: completion level, type: enum, states: [Incomplete, In progress, Complete] }
  - { name: quality status, type: enum, states: [Unverified, Verified, At risk] }
  - owner
  - contacts
  - last modified
relationships:
  belongsTo: domain
  hasMetadata: metadata
  hasLineage: lineage
  hasGlossaryTerms: glossary-term
  hasGovernancePolicies: governance-policy
  hasDiscussionThreads: discussion-thread
  hasSuggestions: suggestion
  hasObservabilitySignals: observability-signal
apps:
  - studio
  - explorer
---
Any indexed item. Types: Dataset, Field, Visualization, Data Process, Data Product, Glossary Item, Custom Item, Category
