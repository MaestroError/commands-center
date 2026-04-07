# U2 Agents and Agent Editor

## Outcome

The user can browse agents, search them, create new agents, edit existing agents, and save workspace-backed configuration.

## Why this is a separate PR

This is a complete user-facing slice backed by C2 and directly matches the MVP agent-management requirement.

## Blockers

- C2 Agent Workspace Lifecycle
- I1 Provider Connections
- I2 Integrations and MCP Management
- I3 Custom Tools Platform
- I5 Composio Integration

## Unblocks

- U3 Direct Chat Screen

## Context

Creation screen should create a new folder under .cc/workspace/agents with the name defined by user (Make name folder-friendly and save in DB as `slug`, use the same slug for url of edit page). The agent should be created as a workspace of OpenCode with user defined instructions, skills, etc (check `design/` and `GOAL.md` for details). 

Editing means rewriting: we should maintain the state in the DB as well, so that we know what is added from our side: list of chosen skills and tools, instructions, default model and etc. And when editing, we should remove everything we added before, update internal state and re-add everything that is in new state.

## Scope

- Implement agents list/grid screen
- Implement shared create/edit agent screen
- Connect form sections for model, skills, custom tools, integrations, and MCP permissions
- Implement built-in skills browser screen: browsable grid of curated founder-provided skills with name, description, category, version metadata, and detail view
- Add empty states for missing models or missing global capabilities
- Navigate to edit state after create
- Ensure agent list, editor, and skills browser are responsive on mobile viewports

## Acceptance Criteria

- The agent list supports search by name and role
- The user can create a valid agent and see it persisted on reopen
- The user can edit a saved agent and see updated values on reopen
- The built-in skills browser shows all available skills with metadata and supports searching or filtering by category
- Behavior matches `design/screens/create-edit-agent/acceptance_criteria.md` and `design/screens/built-in-skills/acceptance_criteria.md`
- Agent list, editor, and skills browser layouts adapt correctly to mobile viewports

## Non-Goals

- Streaming chat
- Provider connection flows themselves
