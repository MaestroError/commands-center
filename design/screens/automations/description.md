# Automations

## Purpose

Automations is the screen for managing scheduled prompts in CommandsCenter. It should let the single operator create, review, update, enable, disable, and inspect automations that send prompts to selected agents on a defined schedule.

## Functional Description

- Show the user's configured automations in one place.
- Let the user create and edit an automation with a title, description, schedule, target agent, and prompt.
- Let the user enable or disable an automation without deleting it.
- Enforce the configured automation limit when a maximum number of automations is set by environment configuration.
- Show execution history for automation runs so the user can review what ran and what happened.
- Save each automation and its run history inside the workspace so scheduled behavior and past runs remain portable.

## User Stories

- As a single user, I want to see all automations in one screen, so that I can understand what scheduled work is configured.
- As a single user, I want to create or update an automation with a schedule, agent, and prompt, so that the system can run recurring work for me.
- As a single user, I want to disable an automation without deleting it, so that I can temporarily stop scheduled runs.
- As a single user, I want to review automation run history, so that I can inspect recent activity, failures, or results.
- As a single user, I want automation data to remain in the workspace, so that scheduled configuration and history survive restarts and workspace moves.
