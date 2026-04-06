# U2 Agents and Agent Editor

## Outcome

The user can browse agents, search them, create new agents, edit existing agents, and save workspace-backed configuration.

## Why this is a separate PR

This is a complete user-facing slice backed by C2 and directly matches the MVP agent-management requirement.

## Blockers

- C2 Agent Workspace Lifecycle

## Unblocks

- U3 Direct Chat Screen

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
