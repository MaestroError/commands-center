# Public MCP Client E2E Test

## Goal

Add backend E2E coverage that exercises the public MCP endpoint the way an external MCP client would use it.

## Tasks

1. Boot a real HTTP server in a temp workspace with the orchestrator stubbed.
2. Connect through the MCP SDK Streamable HTTP client using an API token.
3. Verify `tools/list` exposes token-authorized tools.
4. Create a task through MCP, read it back through MCP, and verify persistence.
5. Run an existing task and a task template through MCP, verify runs are created and reachable through result/read tools.
6. Verify MCP token activity audit records the tool calls.
7. Run eslint fix and the relevant backend test.
