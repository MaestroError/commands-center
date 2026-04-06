# E2 OpenCode Orchestrator

## Outcome

The backend owns one persistent `opencode serve` process, exposes its health, and can route requests against the correct workspace context.

## Why this is a separate PR

This is the critical architectural bet from `GOAL.md`. Once merged, chat, provider auth, MCP auth, and terminal work can build against a stable engine layer.

## Blockers

- E1 Runtime Bootstrap

## Unblocks

- C3 Direct Chat Session Model
- I1 Provider Connections
- I2 Integrations and MCP Management
- I4 Automations

## Scope

- Resolve the OpenCode binary from project dependency with `CC_OPENCODE_PATH` override support
- Spawn and monitor a single `opencode serve` process
- Spawn the engine in a detached Unix process group and terminate via negative PID to kill the entire process tree, preventing zombie and orphan processes
- Poll engine health and expose aggregated status to the app
- Implement startup timeout, shutdown timeout, and restart behavior
- Add workspace-aware client access for requests that target different agent workspaces
- Add instance disposal support for config and skill reload cases

## Acceptance Criteria

- The backend can start OpenCode and detect healthy vs unhealthy startup states
- Engine status is exposed through a backend service and API surface
- Engine restarts are logged and bounded by configured timeouts
- Engine termination kills the entire Unix process tree via process-group signal, leaving no orphaned child processes
- Requests can target a specific workspace without spawning per-agent processes
- Config changes that require reload can dispose the current workspace instance safely

## Non-Goals

- Chat persistence
- Provider or MCP UI
- Terminal UI
