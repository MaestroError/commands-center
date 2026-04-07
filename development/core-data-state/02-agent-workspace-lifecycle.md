# C2 Agent Workspace Lifecycle

## Context

An agent is an OpenCode workspace — a directory containing `AGENTS.md` (system prompt), `opencode.jsonc` (model, MCP permissions, tool permissions), and `skills/` (copied skill files). The app creates and maintains these files; OpenCode reads them at runtime. Refer to OpenCode documentation for the workspace configuration format and supported fields.

## Outcome

Creating or editing an agent produces a durable portable OpenCode workspace with `AGENTS.md`, `opencode.jsonc`, copied skills, and persisted permission settings.

## Why this is a separate PR

This is the core domain boundary between app state and OpenCode workspaces. It is a full feature on its own and can back the agent UI immediately.

## Blockers

- C1 Database and Workspace Foundation

## Unblocks

- U2 Agents and Agent Editor
- U3 Direct Chat Screen
- I2 Integrations and MCP Management
- I3 Custom Tools Platform

## Scope

- Implement agent CRUD as a backend service, exposed via REST API routes
- Create workspace folders per agent inside `.cc/workspace/agents/`
- Generate and update `AGENTS.md`
- Generate and update per-agent OpenCode config with permissions
- Copy built-in skills into agent workspace on assignment
- Persist default model, role, instructions, icon, and capability selections

## Acceptance Criteria

- Creating an agent creates both DB records and workspace files
- Editing an agent updates stored metadata and workspace configuration consistently
- Assigned built-in skills are copied into the agent workspace
- Agent permissions for MCP and app tools are written into workspace config in OpenCode-compatible form
- Deleting or archiving an agent follows an explicit lifecycle policy instead of silently orphaning workspace state

## Non-Goals

- Streaming chat
- Provider authentication
- Automations
