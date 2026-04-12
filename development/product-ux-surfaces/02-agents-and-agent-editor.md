# U2 Agents and Agent Editor

## Outcome

The user can browse agents, search them, create new agents with a model and built-in skills, edit existing agents, and save workspace-backed configuration.

## Why this is a separate PR

This is a complete user-facing slice backed by C2 and I1. It delivers functional agent creation with model selection and skills — MCP permissions, custom tools, and Composio tools are added to the editor by their respective epics (I2, I3, I5) later.

## Blockers

- U0 Frontend Foundation
- C2 Agent Workspace Lifecycle
- I1 Provider Connections

## Unblocks

- U3 Direct Chat Screen

## Context

Creation screen should create a new folder under .cc/workspace/agents with the name defined by user (Make name folder-friendly and save in DB as `slug`, use the same slug for url of edit page). The agent should be created as a workspace of OpenCode with user defined instructions, skills, etc (check `design/` and `GOAL.md` for details).

Editing means rewriting: we should maintain the state in the DB as well, so that we know what is added from our side: list of chosen skills and tools, instructions, default model and etc. And when editing, we should remove everything we added before, update internal state and re-add everything that is in new state.

## Scope

- Implement agents list/grid screen
- Implement shared create/edit agent screen with sections for: name, role, instructions, model selector (from connected providers via I1), and built-in skills
- Implement built-in skills browser screen: browsable grid of curated founder-provided skills with name, description, category, version metadata, and detail view
- Design the editor form layout to be extensible — later epics (I2, I3, I5) will add MCP permissions, custom tools, and Composio tool sections
- Add empty states for missing models or no connected providers
- Navigate to edit state after create
- Ensure agent list, editor, and skills browser are responsive on mobile viewports
- Surface connected provider models from I1 as selectable default-model options in the editor

## Acceptance Criteria

- The agent list supports search by name and role
- The user can create a valid agent with a selected model and built-in skills, and see it persisted on reopen
- The user can edit a saved agent and see updated values on reopen
- The model selector shows models from connected providers (I1)
- The built-in skills browser shows all available skills with metadata and supports searching or filtering by category
- Behavior matches `design/screens/create-edit-agent/acceptance_criteria.md` and `design/screens/built-in-skills/acceptance_criteria.md`
- Agent list, editor, and skills browser layouts adapt correctly to mobile viewports
- Dispose after each new edit to reload configuration. Check `dispose` in `packages/backend/src/services/opencode-service.ts`

## Non-Goals

- Streaming chat
- Provider connection flows themselves
- MCP permissions section (added by I2)
- Custom tools section (added by I3)
- Composio tools section (added by I5)
