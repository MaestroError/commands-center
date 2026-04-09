# I4 Automations

## Outcome

The user can create scheduled prompts for agents, run them in isolated sessions, review execution history, and manage active or archived automations.

## Why this is a separate PR

This is a full product feature with its own backend scheduler, data model usage, and user-facing screen.

## Blockers

- E2 OpenCode Orchestrator
- E3 API and Realtime Foundation
- C3 Direct Chat Session Model
- I6 App-Provided MCP Server (for exposing scheduling tools to agents)

## Unblocks

- No hard blockers. This is the final major Phase 1 feature.

## Scope

- Implement scheduler abstraction for local mode
- Implement automations CRUD, archive, restore, delete, and enable or disable behavior as a backend service exposed via REST API routes
- Expose one-time task scheduling and status check via the app-provided MCP server, so AI agents can create scheduled jobs and check their status programmatically
- Enforce optional max-automation limit from config
- Run each automation as a separate agent session with enriched prompt context
- Persist automation runs and link them back to created sessions
- Build automations screen and run history views
- Ensure automations screen and run history are responsive on mobile viewports

## Acceptance Criteria

- Behavior matches `design/screens/automations/acceptance_criteria.md`
- Each run creates a separate agent session
- Run history shows execution status, time, and final enriched prompt
- Configured limits are enforced when present and ignored when disabled
- Failed runs are recorded and remain visible for diagnosis
- Automations list and run history adapt correctly to mobile viewports
- One-time task scheduling and status check are available via the app-provided MCP server, enabling AI agents to create and monitor scheduled jobs

## Non-Goals

- Group chat orchestration
- Kanban task execution
