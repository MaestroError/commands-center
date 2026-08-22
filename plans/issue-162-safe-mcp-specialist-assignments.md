# Issue 162: Safe MCP Specialist Assignments

## Goal

Prevent a newly created globally enabled custom MCP server from being inherited by active specialists that were not explicitly selected.

## Plan

1. Extend the shared MCP creation schema with a create-only specialist assignment policy, then update the frontend API call to submit it.
2. Update the custom MCP dialog with an unchecked `Enable for all` control that overrides individual specialist selection only during creation.
3. Move new-server assignment into the backend creation workflow: create the global server disabled, write explicit allow or deny overrides for all active specialists and their managed workspaces, then enable the global server only after reconciliation succeeds.
4. Preserve existing edit, auth, enable/disable, removal, Composio, and CC-instance flows.
5. Add focused shared, backend service/route, frontend component, and Playwright UI coverage for zero selection, mixed selection, enable-for-all, archived specialists, and reconciliation failure.
6. Run formatting, lint with fixes, focused tests, type checking, and relevant E2E tests before review.
