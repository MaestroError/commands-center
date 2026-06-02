# Tasks

## Purpose

Tasks is the screen for managing board work items, execution attempts, and reusable task templates in CommandsCenter. It lets the single operator create, review, update, enable, disable, archive, delete, and inspect task work that can be run manually or scheduled through templates.

## Functional Description

- Show active tasks on a board-oriented surface.
- Let the user create and edit a task with a title, description, target agent, prompt, context, and scheduling options.
- Let the user enable or disable scheduled task behavior without deleting the task or template.
- Let the user archive tasks to hide inactive work while preserving reviewable history.
- Let the user delete a task permanently, with a confirmation prompt before removal.
- Show reusable task templates separately from one-off board tasks.
- Show execution history for task runs so the user can review what ran and what happened.
- Show the final enriched prompt that the system sent to the agent for each run.
- Each task run creates a separate execution attempt that can link to the related agent session when available.
- Keep task configuration and run history aligned with the current portable workspace model.

## User Stories

- As a single user, I want to see all tasks in one screen, so that I can understand what work is configured or in progress.
- As a single user, I want to create or update a task with an agent and prompt, so that the system can run work for me.
- As a single user, I want to manage recurring task templates, so that repeated work can be generated consistently.
- As a single user, I want to disable scheduled behavior without deleting the underlying task or template.
- As a single user, I want to archive tasks, so that I can hide inactive work while keeping history available.
- As a single user, I want to delete obsolete tasks permanently.
- As a single user, I want to review task run history, so that I can inspect recent activity, failures, or results.
- As a single user, I want to see the final prompt the system sent to the agent for each run, so that I can understand exactly what context was provided.
