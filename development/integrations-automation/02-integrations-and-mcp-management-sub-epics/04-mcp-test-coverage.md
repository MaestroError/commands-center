# I2.4 MCP Management Test Coverage

## Goal

Add systematic automated coverage for MCP management so the global integration lifecycle, auth/status flows, and per-agent permission model stay reliable as I3 and I5 build on top of them.

## Pre-Conditions

- Sub-Epics 1-3 are implemented or nearly complete.

## Scope

### Shared Schema Tests

- Validate MCP create/update payloads.
- Validate transport and auth input shapes.
- Validate tool permission enum values.

### Backend Service Tests

- Create/update/delete/enable/disable lifecycle.
- Duplicate-name rejection.
- Global `opencode.jsonc` serialization.
- Agent workspace `opencode.jsonc` serialization for MCP enablement and tool permissions.
- Connection status and tool discovery success/failure handling.

### Backend Route Tests

- MCP lifecycle routes.
- Auth delegation routes.
- Status/tools routes.
- Validation failures and error mapping.

### Frontend Component Tests

- Integrations screen loading/error/empty states.
- MCP server cards and action wiring.
- Add/edit/auth dialog validation and success/error flows.
- Agent editor MCP permissions rendering and save behavior.

### End-to-End / Flow Coverage

- Add one integration flow covering:
  1. create or enable an MCP server
  2. authenticate or simulate connected state
  3. open an agent editor
  4. configure server/tool permissions
  5. save and verify persistence after reload

## Out of Scope

- Exhaustive OpenCode runtime behavior tests that belong upstream.
- Composio-specific tests (I5).

## Acceptance Criteria

- Backend MCP services and routes are covered by automated tests.
- Frontend integrations and agent editor MCP UI are covered by automated tests.
- At least one end-to-end flow proves the full MCP management path works across reload.
- Full workspace test suite passes after MCP feature implementation.

## Key Files to Create/Modify

- `packages/backend/test/` — MCP service and route tests
- `packages/frontend/src/**/*.test.tsx` — integrations and agent editor coverage
- `packages/shared/src/**/*.test.ts` — schema coverage if needed
- `packages/frontend/e2e/` — MCP flow coverage if appropriate

## Reference

- `development/product-ux-surfaces/03-direct-chat-sub-epics/05-chat-test-coverage.md`
- Existing provider route/component tests

## OpenWork Context

OpenWork includes useful MCP-adjacent tests that reinforce the shape we should aim for: config manipulation should be covered as pure logic where possible, and remote-connect flows should have focused integration tests around the server surface.

- **Backend MCP integration test:** `examples/openwork/apps/server/src/mcp.remote-connect.e2e.test.ts`
  - useful reference for testing MCP behavior through the server surface rather than only unit-level helpers.
- **Backend JSONC/config helper coverage:** `examples/openwork/apps/server/src/jsonc.test.ts`
  - good reminder to test config editing helpers independently.
- **Frontend MCP flow ownership:** `examples/openwork/apps/app/src/app/connections/store.ts`
  - suggests that store/action logic deserves focused coverage when it contains non-trivial orchestration.
