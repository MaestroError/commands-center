# I4.9 UI Epic: Comments, Feedback, and Context

## Goal

Define how user feedback and run context are displayed so the operator understands what the AI will see on the next run and what it saw in previous runs.

## Scope

- Feedback comments.
- Comment statuses.
- Ask for Changes flow.
- Context preview before queueing.
- Past run context inspection.

## Feedback Comments

- New user feedback defaults to open.
- Open feedback should be visually marked as actionable for the next run.
- Included feedback should show that it was already sent into a run context.
- Resolved feedback should remain visible but lower priority.
- The user should be able to resolve feedback manually.

## Ask For Changes

- Ask for Changes should be available from Ready to Check and Review states.
- The flow should collect a clear user instruction.
- The flow should make it obvious whether it will queue immediately or only save feedback.
- The created feedback should appear in the task timeline and feedback section.

## Context Preview

- Before queueing with options, the user should be able to inspect the next run context.
- The preview should include task description, todos, selected subtask if any, open feedback, previous run results, previous artifacts, and trigger notes.
- The preview should distinguish trusted task content from user-supplied feedback and historical context.
- Quick Queue can use defaults, but Queue With Options should expose context preview.

## Past Run Context

- Each run should expose the context snapshot it used.
- Past context should be read-only.
- Rendered prompt and structured context should be collapsible by default.
- The user should be able to answer, “What did the AI see?” from run detail.

## Acceptance Criteria

- The user can tell which feedback will affect the next run.
- The user can ask for changes without editing the entire task description.
- The user can preview upcoming run context before queueing with options.
- The user can inspect historical run context without current task edits changing it.
