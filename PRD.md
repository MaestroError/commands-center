# Product Requirements Document

## Product

CommandsCenter (`cc`)

## Problem Statement

Operators who work with multiple AI coding agents need one place to configure them, talk to them, manage their workspaces, and control the surrounding tools those agents depend on. Today that workflow is fragmented across local folders, terminals, provider dashboards, external integrations, and agent-specific configuration files. This creates operational friction, inconsistent agent setup, poor visibility into ongoing work, and weak portability when moving environments between machines.

The product should solve this by giving a single operator one workspace-centric application where agents, conversations, files, tools, credentials, and automations are managed together and remain portable with the workspace directory.

## Product Goal

Provide a single-user application for creating, managing, and interacting with isolated AI agents through persistent direct chat, while keeping all application state inside the active workspace so the full system can be moved to another machine without losing context or configuration.

## Target User

- A single operator managing their own AI agents and local or hosted workspaces
- A user who needs direct control over files, terminals, tools, and agent behavior
- A user who expects the entire application state to travel with the workspace folder

## MVP Scope

Phase 1 covers direct messaging only. Group chat and Kanban orchestration are out of scope for the MVP.

## Core Requirements

### 1. Single-User Workspace-Centric Product

- The application must assume one trusted operator with full access.
- The workspace directory must be the single source of truth for application state.
- Moving or copying the workspace directory to another machine must preserve the same usable application state.

### 2. Agent Management

- The user must be able to create, view, edit, and manage multiple agents.
- Each agent must have a name, role, instructions, and optional icon/image.
- Each agent must allow configurable access to tools, integrations, and other permitted capabilities.
- Agents must appear in a dedicated agents view with search and quick access to chat.

### 3. Persistent Direct Chat

- The user must be able to open a direct 1-on-1 chat with any agent.
- Each agent chat must feel persistent, returning the user to the current ongoing conversation by default.
- The user must be able to start a fresh conversation with an agent without losing access to previous conversations.
- Previous conversations must remain accessible as secondary history, not the primary navigation model.
- The chat experience must support model selection, approval controls, and file attachments.

### 4. Shared Agent Workspace Access

- From the direct chat experience, the user must be able to inspect the agent workspace files.
- The user must be able to access an agent-scoped terminal from the chat experience.
- The agent workspace should support the user reviewing the files and context relevant to that agent.

### 5. File Management

- The application must provide a file manager for browsing, reading, and editing files.
- The user must be able to browse both the active workspace and the broader machine filesystem.
- File editing must be available from within the application.

### 6. Terminal Access

- The application must provide a global terminal for machine-level commands.
- The application must provide agent-specific terminal access for work inside an agent workspace.
- Terminal access must support interactive command execution.

### 7. Automations

- The user must be able to create, edit, enable, disable, and review scheduled automations.
- Each automation must target a selected agent and send a prompt on a defined schedule.
- Each automation run must be recorded as its own session for later review.
- Limits on automation usage may be controlled by application configuration.

### 8. Custom Tools

- The user must be able to define global custom tools.
- Custom tools must be reusable across agents.
- The user must be able to control which agents can access which tools.

### 9. Provider Connections

- The user must be able to connect and manage AI providers globally.
- Provider credentials must be configured once and shared across agents.
- The user must be able to select and change an agent's default model.

### 10. MCP Servers and Integrations

- The user must be able to add and manage MCP servers globally.
- MCP connections must be authenticated and maintained at the app level.
- Tool access from MCP servers must be configurable per agent.

### 11. User Preferences

- The application must store user preferences and important long-term memory within the workspace.
- Preferences must persist across restarts, workspace moves, and fresh chat resets.
- The user must be able to manage app-level settings, including theme selection.

### 12. Dashboard and Navigation

- The application must provide a dashboard with recent agents, recent chats, and system status relevant to the operator.
- The application must provide clear navigation to agents, chat, file manager, terminal, automations, tools, connections, settings, and profile.
- The sidebar should prioritize quick access to recent agent conversations.

## Non-Goals for MVP

- Multi-user collaboration
- User registration or login flows
- Group chat between multiple agents
- Kanban-based orchestration
- A dedicated logs screen
- A separate standalone code editor screen

## Success Criteria

- A single operator can create an agent and begin chatting with it in a persistent direct conversation.
- The operator can manage the agent's files, tools, terminal access, and integrations from the same product.
- The full application state remains usable after the workspace directory is moved to another machine.