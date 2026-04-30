# Custom Tools

## Purpose

Custom Tools is the global screen for discovering, creating, inspecting, and moving portable OpenCode custom tools in CommandsCenter.

## Functional Description

- Show all globally defined custom tools stored under the workspace tool library.
- Let the user create a new starter tool by entering a name, generating a folder and starter files, then opening that tool in the file manager.
- Let the user inspect each global tool's metadata, usage, and drift state across agent copies.
- Let the user copy a global tool into one or more agent workspaces.
- Let the user inspect agent-local tools for a selected agent and copy or move them back into the global library.
- Use the file manager as the editing surface for tool implementation.
- Make it clear that global and agent-local tools are copied snapshots that do not sync automatically.

## User Stories

- As a single user, I want one global tool library, so I can manage reusable tools separately from a single agent.
- As a single user, I want to create a starter tool quickly and then edit its files directly, so CC does not need a second code editor.
- As a single user, I want to copy a global tool into multiple agents, so I can reuse the same tool implementation across workspaces.
- As a single user, I want to inspect agent-local copies and see whether they match or drift from the global source, so I understand the current state clearly.
- As a single user, I want to move or copy an agent-local tool back into the global library, so local experimentation can become reusable later.
