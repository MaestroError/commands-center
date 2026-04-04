# Direct Chat

## Purpose

Direct Chat is the primary workspace for 1-on-1 interaction with a single agent. It should let the single operator continue an agent's ongoing work, send new prompts with the needed runtime controls, and use the page's contextual sidebar and terminal surfaces without leaving the conversation flow.

## Functional Description

- Open one agent-specific conversation workspace that centers on the current agent's persistent direct-message history.
- Show the selected agent's conversation history and new assistant activity in one continuous chat view.
- Render agent responses progressively as content streams in, displaying Markdown formatting in real time rather than waiting for the full response to complete.
- Show agent tool calls inline in the conversation and allow the user to expand each tool call to inspect its details.
- Provide a message composer with the main per-prompt controls, including model selection, auto-approve state, and attachments.
- Provide a `Start Fresh` action that begins a new chat session for the same agent without changing the agent configuration.
- Provide a secondary way to access previous conversations for the current agent without making session lists the primary navigation model.
- Include a collapsible right sidebar that acts as the page's context pane and supports tabs for contextual tools and information related to the current chat.
- Include the workspace files view as one tab inside that right sidebar for MVP, with room for additional context tabs later.
- Let the workspace files tab support quick workspace browsing from chat, including selecting files or folders and handing off to the file manager or terminal when deeper work is needed.
- Agent workspace files such as memory, preferences, and AGENTS.md are visible in the workspace file tree and can be read or edited through the file manager.
- Include a bottom terminal panel inside direct chat so the user can run workspace commands while staying in the chat workflow.
- Let the bottom terminal panel support multiple terminal sessions as tabs.

## User Stories

- As a single user, I want opening an agent chat to return me to that agent's ongoing conversation, so that I can continue work without managing separate threads first.
- As a single user, I want to inspect tool calls inline in the conversation, so that I can understand what the agent did and review execution details when needed.
- As a single user, I want to send prompts with attachments, model selection, and auto-approve controls, so that I can run the agent with the context and execution behavior I need.
- As a single user, I want to start a fresh conversation with the same agent, so that I can reset chat context without recreating the agent.
- As a single user, I want to access previous conversations from the chat screen, so that I can review or reopen older work when needed.
- As a single user, I want access to a right sidebar with contextual tabs from chat, so that I can inspect workspace files and future chat-related context without leaving the conversation.
- As a single user, I want access to the agent terminal from chat, so that I can run and manage workspace terminal sessions alongside the conversation.
