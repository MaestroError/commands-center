# MCP tool group layout

- [x] Nest each specialist MCP tool list in its server card.
- [x] Show the expandable list only for Ask/Allow; preserve other servers' rules.
- [x] Reuse the existing expandable section and permission rows.
- [x] Verify visibility, collapse/expand, and saving; run lint, tests, typecheck,
      and design audit.

UI-only change; no persistence or workspace ignore changes.

Validation: 30 affected tests pass; ESLint, frontend typecheck, and design audit
pass. Verified Notion's nested tool section collapses and expands in the local
browser. Unavailable saved rules for removed integrations remain removable.
