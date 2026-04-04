# Custom Tools

## Purpose

Custom Tools is the global screen for defining reusable user-configured tools in CommandsCenter. It should let the single operator create and maintain HTTP-based tool definitions that can later be assigned to agents.

## Functional Description

- Show all globally defined custom tools in one place.
- Let the user create, edit, and delete a custom tool with a name, MCP-facing description, HTTP request configuration, and optional extra instructions.
- Treat each custom tool as a reusable global resource that can later be granted to one or more agents.
- Let the user review and update existing tool definitions without editing agent records directly.
- Let the user delete a custom tool permanently when it is no longer needed.
- Save custom tool definitions inside the workspace so they remain portable with the rest of the application state.

## User Stories

- As a single user, I want to see all custom tools in one global library, so that I can manage reusable tools separately from agent setup.
- As a single user, I want to define a custom tool as an HTTP request with a name and description, so that agents can call external workflows such as n8n endpoints.
- As a single user, I want to add optional extra instructions to a custom tool, so that the tool can contribute guidance to the agent when sessions start.
- As a single user, I want to edit an existing custom tool, so that I can improve or fix its configuration without recreating it.
- As a single user, I want to delete a custom tool, so that I can remove tools I no longer need.
- As a single user, I want custom tools to stay in the workspace, so that tool definitions survive restarts and workspace moves.
