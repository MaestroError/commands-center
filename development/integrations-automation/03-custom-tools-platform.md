# I3 Custom Tools Platform

## Outcome

The user can define reusable global custom tools in CC, assign them per-agent, and have CC materialize agent-local OpenCode tool wrappers that expose those tools inside each selected agent workspace.

## Why this is a separate PR

This is a complete capability platform with its own data model, backend execution layer, workspace materialization flow, dependency management, and management UI.

## Blockers

- C2 Agent Workspace Lifecycle
- I2 Integrations and MCP Management (for agent editor MCP permission patterns)

## Unblocks

- No hard blockers downstream. Extends the agent editor with custom tools assignment.

## Decision

- Do not build a dedicated CC-managed custom-tools MCP server for the MVP.
- Use OpenCode's native custom tool loading model instead: OpenCode discovers JavaScript/TypeScript tools from `.opencode/tool/` and `.opencode/tools/` inside the active workspace.
- Keep CC as the source of truth for reusable tool definitions, then materialize CC-managed wrappers into each selected agent workspace.
- Keep `opencode.jsonc` responsible only for permissions, not for registering local custom tools.

## Approach

### Global Source Of Truth

- Store global custom tool definitions in CC-managed workspace state.
- Persist tool metadata in DB for list/filter/assignment UI and API usage.
- Persist canonical source files under `.cc/workspace/custom-tools/` so the entire tool platform remains portable with the workspace.
- Treat these global entries as reusable templates/catalog items, not directly executable per-agent runtime files.

### Agent Materialization

- On agent create/edit, regenerate a CC-owned tool directory inside that agent workspace: `.opencode/tool/`
- Materialize only tools assigned to that agent.
- Do not write CC-managed files into `.opencode/tools/`; reserve that path for manual user-authored tools that CC should not delete.
- Remove and recreate `.opencode/tool/` during workspace rewrite, matching the same ownership model CC already uses for `.opencode/skills/`.

### Wrapper System

- Each assigned custom tool becomes a small wrapper file inside the agent workspace.
- The wrapper exports the actual OpenCode tool definition that the model can call.
- The wrapper delegates to the canonical implementation stored under `.cc/workspace/custom-tools/`.
- The wrapper may inject per-agent assignment settings, such as extra instructions or assignment-specific metadata.
- The canonical implementation remains global and shared; the wrapper is the per-agent adapter.

### Why Wrappers Instead Of Copying Full Tool Code

- Avoid duplicating full tool source into every agent workspace.
- Keep one canonical implementation to edit, validate, and test.
- Make global tool updates propagate by regenerating wrappers rather than rewriting many divergent copies.
- Support per-agent customization without forking the canonical implementation.
- Keep dependency installation centralized around the canonical tool store.

### Dependencies

- Support optional package dependencies per custom tool.
- Maintain a CC-managed package manifest for global custom tools under `.cc/workspace/custom-tools/`.
- Canonical tool implementations import dependencies from the global custom tools workspace.
- Agent wrappers stay minimal and dependency-free where possible.

### Permissions And Availability

- Tool availability is controlled by wrapper presence in the agent workspace.
- Assigned tool: wrapper exists.
- Unassigned tool: no wrapper exists.
- `opencode.jsonc` permission rules still control runtime action (`allow`, `ask`, `deny`) for tool IDs.
- CC should continue writing tool permission rules into `opencode.jsonc` for assigned custom tool IDs/patterns.

### Reload Behavior

- Assume local custom tool changes require agent workspace disposal/reload.
- After custom tool assignment changes or wrapper regeneration, dispose the affected OpenCode instance so the next session load re-reads the workspace tool files.
- Do not depend on MCP `listChanged` behavior for local tool files.

## Scope

### Custom Tool Definitions

- Add custom tool schema and persistence for reusable global tool definitions
- Support script-first tool implementations as the primary model
- Support optional HTTP request template input that generates script-based tool implementations rather than becoming a separate runtime
- Persist canonical tool source under `.cc/workspace/custom-tools/`
- Support optional dependency metadata for canonical tool implementations

### Custom Tool CRUD UI And API

- Implement custom tools CRUD as a backend service exposed via REST API routes
- Build custom tools CRUD screen
- Provide starter templates for common integration cases such as webhook calls, authenticated HTTP requests, and n8n triggers
- Allow editing generated or handwritten JavaScript/TypeScript tool code

### Agent Wrapper Materialization

- Regenerate `.opencode/tool/` on agent create/edit for CC-managed tool wrappers
- Generate one wrapper per assigned custom tool
- Support optional extra instructions injection per assigned custom tool through wrapper generation
- Keep `.opencode/tools/` untouched so manual user-authored tools are not removed by CC
- Add custom tools section to the agent editor: per-agent tool assignment and permission controls (allow, ask, deny)
- Update agent workspace config (`opencode.jsonc`) when custom tool assignments or permissions change
- Dispose/reload affected OpenCode instances after wrapper regeneration
- Ensure custom tools screen and agent editor custom tools section are responsive on mobile viewports

## Acceptance Criteria

- The user can create, edit, and delete global custom tools
- Global custom tool definitions are persisted inside `.cc/workspace/custom-tools/` so they move with the workspace
- Custom tools appear in the agent editor as assignable capabilities with per-agent permission controls
- Saving an agent regenerates `.opencode/tool/` wrappers for the selected custom tools only
- Wrapper files delegate to canonical implementations stored under `.cc/workspace/custom-tools/`
- Agent workspace `opencode.jsonc` is updated when custom tool permissions are saved
- Custom tool edits and assignment changes are picked up after affected OpenCode instances are disposed/reloaded
- Custom tool CRUD is implemented as a decoupled service reusable by future surfaces (CLI, automation, generated templates)
- Custom tools screen and agent editor section adapt correctly to mobile viewports

## Non-Goals

- Dedicated CC-managed custom-tools MCP server for MVP
- App-provided tools MCP server (owned by I6)
- Composio integration (owned by I5)
- Scheduling or cron execution (owned by I4)
