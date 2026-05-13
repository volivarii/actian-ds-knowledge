---
title: "Notification toast"
nav_order: 26
---
# Notification toast

Toasts confirm that a background action completed, or surface non-critical errors and warnings that do not block the user.

---

## When to use

- To confirm that a background action completed.
- To surface non-critical errors or warnings that do not block the user.
- Do not use toasts for actions that require user input.
- For routine confirmations that need persistence, use an [alert / banner](alert-banner) instead.

## Style

- Keep to one short sentence.
- Include an undo action where relevant.

## Examples

| Scenario | Toast text |
|---|---|
| Dataset deleted | Dataset deleted. Undo |
| Export complete | Export ready. Download |
| Connection failed | Connection failed. Try again |
