# Development Plan

## Goal

Deliver Phase 1 from `GOAL.md`: a single-user, portable workspace application centered on persistent direct chat with OpenCode-powered agents.

This plan is organized so each epic is a complete feature slice that can ship as its own PR once its blockers are merged.

## Domains

- `engine-infrastructure`: runtime bootstrap, OpenCode engine lifecycle, API backbone, self-updating
- `core-data-state`: database, portable workspace state, agent lifecycle, direct chat persistence
- `product-ux-surfaces`: app shell, dashboard, agent UX, chat UX, file manager, terminals, profile, settings, theming
- `integrations-automation`: provider auth, MCP/integrations, custom tools, automations

## Dependency Tree

```text
E1 Runtime Bootstrap
|- E2 OpenCode Orchestrator
|  |- C3 Direct Chat Session Model
|  |  |- U3 Direct Chat Screen
|  |  \- I4 Automations
|  |- I1 Provider Connections
|  \- I2 Integrations and MCP Management
|- E3 API and Realtime Foundation
|  |- E4 Self-Updating and Version Management
|  |- U1 App Shell and Dashboard
|  |- U4 File Manager and Terminals
|  |- U5 Profile, Settings, and Theming
|  \- I4 Automations
\- C1 Database and Workspace Foundation
   |- C2 Agent Workspace Lifecycle
   |  |- U2 Agents and Agent Editor
   |  |- U3 Direct Chat Screen
   |  |- I2 Integrations and MCP Management
   |  \- I3 Custom Tools Platform
   |- C3 Direct Chat Session Model
   |  |- U3 Direct Chat Screen
   |  \- I4 Automations
   |- U4 File Manager and Terminals
   \- U5 Profile, Settings, and Theming
```

## Recommended Execution Paths

### Path A: Fastest route to internal alpha

1. `engine-infrastructure/01-runtime-bootstrap.md`
2. `engine-infrastructure/02-opencode-orchestrator.md`
3. `core-data-state/01-database-and-workspace-foundation.md`
4. `core-data-state/02-agent-workspace-lifecycle.md`
5. `product-ux-surfaces/02-agents-and-agent-editor.md`
6. `core-data-state/03-direct-chat-session-model.md`
7. `product-ux-surfaces/03-direct-chat-screen.md`

Result: create agents, generate workspaces, open persistent direct chat, send messages.

### Path B: Make the product useful for day-to-day work

Run after Path A starts stabilizing.

1. `engine-infrastructure/03-api-and-realtime-foundation.md`
2. `engine-infrastructure/04-self-updating-and-version-management.md`
3. `product-ux-surfaces/04-file-manager-and-terminals.md`
4. `product-ux-surfaces/01-app-shell-and-dashboard.md`
5. `product-ux-surfaces/05-profile-settings-and-theming.md`

Result: file browsing/editing, global and agent terminals, health visibility, user preferences, theming, and self-updating.

### Path C: Unlock real external capability

Run in parallel with late Path A or early Path B.

1. `integrations-automation/01-provider-connections.md`
2. `integrations-automation/02-integrations-and-mcp-management.md`
3. `integrations-automation/03-custom-tools-platform.md`

Result: providers, MCP servers, Composio integrations, custom tools, per-agent permissions.

### Path D: Complete the MVP operating loop

Run after agents and direct chat execution are stable.

1. `integrations-automation/04-automations.md`

Result: scheduled prompts with isolated sessions and run history.

## Parallel Workstreams

### Workstream 1: Platform

- E1 Runtime Bootstrap
- E2 OpenCode Orchestrator
- E3 API and Realtime Foundation
- E4 Self-Updating and Version Management

### Workstream 2: Data and Workspace

- C1 Database and Workspace Foundation
- C2 Agent Workspace Lifecycle
- C3 Direct Chat Session Model

### Workstream 3: Frontend

- U1 App Shell and Dashboard
- U2 Agents and Agent Editor
- U3 Direct Chat Screen
- U4 File Manager and Terminals
- U5 Profile, Settings, and Theming

### Workstream 4: Capability

- I1 Provider Connections
- I2 Integrations and MCP Management
- I3 Custom Tools Platform
- I4 Automations

## PR Rules

Each epic PR should:

- satisfy the epic acceptance criteria without depending on unreleased follow-up work
- include schema, backend, frontend, and tests needed for that slice
- avoid partial architecture scaffolding without a user-visible or API-visible outcome
- update related docs when the user or developer workflow changes

## Milestones

### Milestone 0: Foundation

- E1 Runtime Bootstrap
- E2 OpenCode Orchestrator
- E3 API and Realtime Foundation
- C1 Database and Workspace Foundation

### Milestone 1: Agent and Chat Alpha

- C2 Agent Workspace Lifecycle
- U2 Agents and Agent Editor
- C3 Direct Chat Session Model
- U3 Direct Chat Screen

### Milestone 2: Workspace Interaction and Polish

- U4 File Manager and Terminals
- U1 App Shell and Dashboard
- U5 Profile, Settings, and Theming
- E4 Self-Updating and Version Management

### Milestone 3: External Capability

- I1 Provider Connections
- I2 Integrations and MCP Management
- I3 Custom Tools Platform

### Milestone 4: MVP Completion

- I4 Automations

## Long-Term Plan

### Phase 2: Group Chat

Build on the same agent, session, attachment, and permission systems. Add shared context and multi-agent coordination instead of replacing the Phase 1 model.

### Phase 3: Kanban Board

Build on automation, session orchestration, and shared context. Add task entities, board state, card execution history, and agent assignment workflows.
