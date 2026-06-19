---
# yaml-language-server: $schema=../../../schemas/app-context-app.json
_schema_version: 1
slug: administration
label: Administration
purpose: User management, connections, catalog configuration, system settings
users:
  - Admin
  - IT ops
header:
  type: Admin
sidebar:
  - label: Users and contacts
    id: users-and-contacts
  - label: Catalogs
    id: catalogs
  - label: Groups
    id: groups
  - label: Connections
    id: connections
  - label: Scanners
    id: scanners
  - label: API keys
    id: api-keys
  - label: Policies
    id: policies
  - label: Maintenance mode
    id: maintenance-mode
signals:
  - users
  - permissions
  - connections
  - connectors
  - settings
  - configuration
  - system
  - LDAP
  - SSO
  - roles
  - groups
  - scanners
  - API keys
  - maintenance
  - catalogs
---
