# Create / Edit Agent

## Purpose

Create / Edit Agent is the shared screen for adding a new agent or updating an existing one. It should let the single operator define an agent's identity, behavior, runtime defaults, and allowed integrations from one reusable workflow.

## Functional Description

- Use one form module for both create and edit states.
- Capture the agent's core identity and behavior, including name, role, instructions, and optional icon or image.
- Let the user choose the agent's default model from globally available provider models.
- Let the user control which globally configured custom tools, built-in skills, Composio integrations, and MCP servers the agent can use, including per-tool or per-server permission behavior when supported.
- In edit state, load the selected agent's current configuration so the user can review and change it.
- Save the configuration back to the workspace so the agent's workspace, instructions, and tool permissions remain consistent with the portable workspace rules.

## User Stories

- As a single user, I want to create an agent with a name, role, and instructions, so that I can add a new working agent to the app.
- As a single user, I want to choose a default model for an agent, so that new chats start with the model I expect.
- As a single user, I want to control which custom tools, built-in skills, Composio integrations, and MCP servers an agent can access, so that each agent only receives the capabilities I intend.
- As a single user, I want to optionally set or replace an agent icon, so that I can recognize agents more easily in lists and chat entry points.
- As a single user, I want to edit an existing agent in the same workflow, so that I can update its configuration without learning a different screen.
