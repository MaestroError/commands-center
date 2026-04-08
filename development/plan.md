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
 ✅ E1 Runtime Bootstrap
 |- ✅ E2 OpenCode Orchestrator
 |  |- ✅ E5 OpenCode Workspace Contract
 |  |- C3 Direct Chat Session Model
 |  |  |- U3 Direct Chat Screen
 |  |  \- I4 Automations
 |  |- I1 Provider Connections
 |  |  \- U2 Agents and Agent Editor
 |  \- I2 Integrations and MCP Management
 |     |- I3 Custom Tools Platform
 |     \- I5 Composio Integration
 |- E3 API and Realtime Foundation
 |  |- E4 Self-Updating and Version Management
 |  |- U0 Frontend Foundation
 |  |  |- U1 App Shell and Dashboard
 |  |  |- U2 Agents and Agent Editor
 |  |  |- U3 Direct Chat Screen
 |  |  |- U4 File Manager and Terminals
 |  |  \- U5 Profile, Settings, and Theming
 |  \- I4 Automations
 \- ✅ C1 Database and Workspace Foundation
    |- ✅ C2 Agent Workspace Lifecycle
    |  |- ✅ E5 OpenCode Workspace Contract
    |  |- U2 Agents and Agent Editor
    |  |- U3 Direct Chat Screen
    |  |- I2 Integrations and MCP Management
    |  |- I3 Custom Tools Platform
    |  \- I5 Composio Integration
    |- C3 Direct Chat Session Model
    |  |- U3 Direct Chat Screen
    |  \- I4 Automations
    |- U4 File Manager and Terminals
    \- U5 Profile, Settings, and Theming

U0 blocks on: E3
U2 blocks on: U0, C2, I1
U3 blocks on: U0, C2, C3
I2, I3, I5 each extend the agent editor independently after U2 ships
```

## Recommended Execution Paths

### Path A: Fastest route to internal alpha

1. `✅ engine-infrastructure/01-runtime-bootstrap.md`
2. `✅ engine-infrastructure/02-opencode-orchestrator.md`
3. `✅ core-data-state/01-database-and-workspace-foundation.md`
4. `✅ core-data-state/02-agent-workspace-lifecycle.md`
5. `✅ engine-infrastructure/05-opencode-workspace-contract.md`
6. `engine-infrastructure/03-api-and-realtime-foundation.md`
7. `integrations-automation/01-provider-connections.md`
8. `product-ux-surfaces/00-frontend-foundation.md`
9. `product-ux-surfaces/02-agents-and-agent-editor.md`
10. `core-data-state/03-direct-chat-session-model.md`
11. `product-ux-surfaces/03-direct-chat-screen.md`

Result: connect providers, app shell with layout and theming, create agents with model and skills, generate workspaces, open persistent direct chat, send messages.

### Path B: Extend capabilities and make the product useful for day-to-day work

Run after Path A starts stabilizing. Integration epics (I2, I3, I5) each extend the agent editor with their respective sections.

1. `integrations-automation/02-integrations-and-mcp-management.md`
2. `integrations-automation/03-custom-tools-platform.md`
3. `integrations-automation/05-composio-integration.md`
4. `engine-infrastructure/04-self-updating-and-version-management.md`
5. `product-ux-surfaces/04-file-manager-and-terminals.md`
6. `product-ux-surfaces/01-app-shell-and-dashboard.md`
7. `product-ux-surfaces/05-profile-settings-and-theming.md`

Result: MCP server management, custom tools, Composio integration, file browsing/editing, global and agent terminals, health visibility, user preferences, theming, and self-updating.

### Path C: Complete the MVP operating loop

Run after agents and direct chat execution are stable.

1. `integrations-automation/04-automations.md`

Result: scheduled prompts with isolated sessions and run history.

## Cross-Cutting Architectural Principles

### Service-First Architecture

All business actions (agent CRUD, session management, automation CRUD, custom tool management, etc.) MUST be implemented as backend services first, then exposed via REST API routes for the frontend. Services are the single source of truth for all business logic — no business rules in route handlers, CLI commands, or MCP tools.

This decoupling ensures that any action can be surfaced through additional interfaces (MCP tools, CLI commands, etc.) in the future without reimplementing logic. The web UI, a CLI command, and an MCP tool must all call the same service method and produce the same result.

**Currently confirmed for MCP exposure:** automation one-time task scheduling and status checks, so AI agents can create and monitor scheduled jobs programmatically.

### OpenCode as Engine Dependency

All AI agent interactions (prompt execution, session management, provider auth, MCP auth, terminal) go through the OpenCode SDK and the single `opencode serve` process. The app never implements its own LLM interaction layer — OpenCode is the engine, the app is the orchestrator.

### Agent = OpenCode Workspace

An agent is a standard OpenCode workspace directory containing `AGENTS.md` (system prompt), `opencode.jsonc` (model, MCP/tool permissions), and `.opencode/skills/` (copied skill files). The app creates and updates these files; OpenCode reads them at runtime. The single `opencode serve` process handles all workspaces — the orchestrator routes requests to the correct agent workspace via directory parameter. Refer to OpenCode documentation for workspace configuration format and supported fields.

### Mobile-First Responsiveness

Every screen and panel MUST be usable on mobile viewports. This is not optional polish — it's a core requirement for comfortable mobile access. Each epic with a UI surface must include mobile responsiveness in both scope and acceptance criteria.

### Portable Workspace (.cc/workspace)

The `.cc` directory is the application root (created on first run, like OpenCode's `.opencode`). Within it, `.cc/workspace/` is the single portable state directory containing all user data: agents, database, preferences, auth credentials, MCP configs, automations history, and everything else. Copying `.cc/workspace/` to another machine and running `ccenter start` MUST produce the exact same application state — zero external dependencies on the originating host.

## PR Rules

Each epic PR should:

- satisfy the epic acceptance criteria without depending on unreleased follow-up work
- include schema, backend, frontend, and tests needed for that slice
- avoid partial architecture scaffolding without a user-visible or API-visible outcome
- update related docs when the user or developer workflow changes

## Milestones

### Milestone 0: Foundation

- ✅ E1 Runtime Bootstrap
- ✅ E2 OpenCode Orchestrator
- ✅ E5 OpenCode Workspace Contract
- E3 API and Realtime Foundation
- ✅ C1 Database and Workspace Foundation

### Milestone 1: Agent Alpha

- ✅ C2 Agent Workspace Lifecycle
- I1 Provider Connections
- U0 Frontend Foundation
- U2 Agents and Agent Editor
- C3 Direct Chat Session Model
- U3 Direct Chat Screen

### Milestone 2: Capability Extensions

- I2 Integrations and MCP Management
- I3 Custom Tools Platform
- I5 Composio Integration

### Milestone 3: Workspace Interaction and Polish

- U4 File Manager and Terminals
- U1 App Shell and Dashboard
- U5 Profile, Settings, and Theming
- E4 Self-Updating and Version Management

### Milestone 4: MVP Completion

- I4 Automations

## Long-Term Plan

### Phase 2: Group Chat

Build on the same agent, session, attachment, and permission systems. Add shared context and multi-agent coordination instead of replacing the Phase 1 model.

### Phase 3: Kanban Board

Build on automation, session orchestration, and shared context. Add task entities, board state, card execution history, and agent assignment workflows.
