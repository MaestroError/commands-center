# MVP Screens

## 1. Dashboard

- Description: Main landing screen with recent agents, recent chats, quick actions, engine/database/cron health, and update status.
- Decision: This is the only MVP place for system health. No separate health or logs screen for now.

## 2. Agents

- Description: Searchable grid of all agents (2–3 per row on desktop) with icon, name, role, and quick actions such as open chat, edit, or delete.
- Decision: Keep this as the main discovery screen for agents instead of overloading the sidebar.

## 3. Create / Edit Agent

- Description: Reusable form for creating and updating agents, including name, role, instructions, icon, default model, and allowed custom tools, built-in skills, Composio integrations, and MCP server access.
- Decision: One shared screen/module for both create and edit states.

## 4. Direct Chat

- Description: Core 1-on-1 chat screen with streaming message rendering, message history, expandable tool calls, composer, model picker, auto-approve switch, attachments, agent interactions, a right context sidebar with tabs (including workspace files with access to memory, preferences, and AGENTS.md), and an embedded agent terminal panel.
- Decision: This is the center of the MVP. The workspace files view belongs inside the direct chat right sidebar and the agent terminal belongs inside the direct chat bottom panel rather than as separate screens.

## 5. File Manager

- Description: Main place to browse folders/files, create/rename/delete files and folders, and edit files comfortably with breadcrumbs, tree navigation, syntax highlighting, and system warnings for critical agent files.
- Decision: This replaces the need for a separate code editor screen. Editing should happen here, not in chat modals or in the small workspace panel.

## 6. Global Terminal

- Description: Standalone terminal for host-level commands, installs, and machine-wide operations outside a single agent workspace.
- Decision: Keep separate from the agent terminal because scope and risk are different.

## 7. Tasks

- Description: Screen for listing, creating, editing, enabling/disabling, archiving, deleting, and reviewing tasks and recurring task templates. Each run is recorded as a separate execution attempt, and run history shows the final enriched prompt.
- Decision: One module can cover board, templates, forms, and run history instead of splitting into many MVP screens.

## 8. Custom Tools

- Description: Manage globally defined custom tools, including list, create, edit, delete, and configuration of request details and instructions.
- Decision: This is a global library, not an agent-local screen. Agents only reference tools from here.

## 9. Built-in Skills

- Description: Browsable library of curated skills provided by the founders. Skills are saved as part of the project repository and copied into agent workspace folders when assigned.
- Decision: Separate from custom tools. Skills are selectable from the create or edit agent screen.

## 10. Integrations

- Description: Unified screen for managing external service connections. Starts with Composio integrations (connect/disconnect apps via managed OAuth and Connect Links) and follows with MCP servers (add/authenticate/disable/remove). Shows connection state and available tools for all integrations.
- Decision: Replaces the former MCP Servers screen. Composio integrations and MCP servers live together here. Auth is global, but permissions are applied per agent in the agent form.

## 11. Provider Connections

- Description: Global screen for connecting and managing LLM providers such as OpenAI or Anthropic.
- Decision: Provider auth is global, so this should live outside agent screens. OAuth/API key flows can open in modal steps from here.

## 12. Settings

- Description: App-wide configuration screen for runtime preferences, workspace-related options, and update actions.
- Decision: Keep update controls here together with general configuration instead of creating a separate MVP update screen. Theme selection lives in Profile, not here.

## 13. Profile

- Description: Personalization screen for the single user, including display name, theme selection, and timezone.
- Decision: In MVP this covers core personal preferences. Post-MVP it can also host quick export/import actions for portable user/workspace setup flows.

## Not Separate MVP Screens

- Logs: Not a dedicated MVP screen. `GOAL.md` mentions structured logging and operational log flushing, but not a required raw log viewer UI.
- System Health: Not a dedicated MVP screen. Health/status lives on the dashboard only.
- Code Editor: Not a separate MVP screen. Editing is part of the file manager.
- Group Chat: Phase 2, not MVP.
- Kanban Board: Phase 3, not MVP.
- MCP Servers: Not a separate screen. Now part of the Integrations screen.
