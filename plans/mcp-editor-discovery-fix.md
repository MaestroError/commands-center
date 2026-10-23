# MCP editor discovery fix

- [x] Trace the mismatch: global connection status can be connected while the
      passive specialist catalog has never initialized.
- [x] Initialize configured MCP connections for editor catalog requests using
      the existing SDK listTools path. Keep validation and execution reads passive.
- [x] Add regression coverage and run lint, affected tests, and typechecks.
- [x] Verify the real Notion tool list in the local specialist editor.

No portable configuration or filesystem format changes; no ignore changes needed.
