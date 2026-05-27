# ✅ I4.9 UI Epic: Level 5 Task Detail Sections

## Goal

Define the internal organization of task detail so overview, feedback, subtasks, runs, context, and activity are understandable without mixing their purposes.

## Scope

- Detail sections and tabs.
- What each section is for.
- How current status changes the visible priority of sections.
- How the user reviews AI results and provides feedback.

## Sections

- Overview: task title, description, todos, agent, schedule, due date, source template, and current status.
- Feedback: user comments and follow-up instructions that should influence future runs.
- Subtasks: lightweight work breakdown under the parent task.
- Runs: execution attempts, outcomes, artifacts, errors, and session access.
- Context: preview of what the next queued run will use and snapshots of what past runs saw.
- Activity: unified timeline of important events such as edits, comments, runs, accepts, retries, and archives.

## Default Section By State

- Backlog: Overview.
- Scheduled: Overview with schedule highlighted.
- Queued: Runs with active run highlighted.
- Ready to Check: Runs with latest result highlighted.
- Review: Feedback or Runs, depending on whether the review reason came from a human-review request or a failure.
- Done: Activity or latest accepted run.
- Archived: Overview and Activity.

## Review Experience

- Ready to Check should place the latest result summary above lower-priority metadata.
- Review should place the failure or human-review reason above lower-priority metadata.
- Ask for Changes should create visible open feedback.
- Accept should be explicit and should not be hidden in a secondary menu.

## Timeline Rules

- Runs should appear as important timeline items.
- Comments should appear where they were created and show whether they are open, included, or resolved.
- Acceptance and archive events should be visible.
- Generated recurring source information should be visible in task history.

## Acceptance Criteria

- The user can find task content, feedback, subtasks, runs, context, and activity without guessing.
- Ready-to-check and review states prioritize the decision the user must make next.
- The user can see what changed across retries and why another run happened.
- The UI does not treat comments, runs, and subtasks as interchangeable chat messages.
