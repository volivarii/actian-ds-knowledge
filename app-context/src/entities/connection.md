---
# yaml-language-server: $schema=../../../schemas/app-context-entity.json
_schema_version: 1
slug: connection
label: Connection
properties:
  - name
  - { name: type, type: enum, example: "Snowflake, BigQuery, S3, Postgres (93+ connectors)" }
  - { name: status, type: enum, states: [Connected, Error, Pending] }
  - provider
relationships:
  discoversCatalogObjects: catalog-object
apps:
  - administration
---
Configuration for a data source connector (93+ pre-built)
