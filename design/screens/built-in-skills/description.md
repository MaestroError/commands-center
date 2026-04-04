# Built-in Skills

## Purpose

Built-in Skills is the screen for browsing and managing the curated skill library provided by the CommandsCenter founders. It should let the single operator discover ready-made skills, review what each skill does, and make skills available for assignment to agents.

## Functional Description

- Show the curated library of built-in skills in a browsable list.
- Display each skill with its name, description, and any relevant metadata such as category or version.
- Let the user view details of a skill before assigning it.
- Built-in skills are saved as part of the project repository and are available for selection from the create or edit agent screen.
- When a built-in skill is assigned to an agent, the system copies the skill files into the agent's workspace folder so the skill becomes part of that agent's portable workspace.
- Save the list of available built-in skills inside the workspace so the library state remains portable.

## User Stories

- As a single user, I want to browse a curated skill library, so that I can discover ready-made capabilities without building everything from scratch.
- As a single user, I want to review what a built-in skill does before assigning it, so that I understand what capability the agent will receive.
- As a single user, I want built-in skills to be selectable from the agent form, so that I can assign skills to agents during creation or editing.
- As a single user, I want assigned skills to be copied into the agent's workspace, so that the agent has the skill files available locally and the workspace remains portable.
