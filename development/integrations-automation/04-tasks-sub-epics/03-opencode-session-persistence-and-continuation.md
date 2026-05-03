# I4.3 OpenCode Session Persistence and Continuation

## Goal

Ensure every task run creates or records an inspectable OpenCode session, links that session to run history, and allows the user to continue valid task-created sessions from direct chat.

## Pre-Conditions

- I4.1 Task Data Model and Service API is complete.
- I4.2 Scheduler and Execution Lifecycle is complete enough to create task runs.
- C3 Direct Chat Session Model is complete.
- E2 OpenCode Orchestrator is complete.

## Scope

### Task Run Sessions

- Create or resolve a dedicated OpenCode session for each task run.
- Persist the OpenCode session ID on `task_runs`.
- Persist rendered prompt/context sent to OpenCode for the run.
- Store run result summary after AI completion when available.

### Prompt Context

- Build task run prompts from task title, description, context, todos, trigger metadata, assigned agent, and schedule metadata.
- Include previous relevant result context only when useful and bounded.
- Preserve the exact rendered prompt/context in run history for later inspection.

### Inspection and Continuation

- Expose API data needed to open a task run and inspect its linked OpenCode session.
- Allow the user to continue a task-created session in chat when the session is still valid for the agent workspace.
- Make invalid/missing sessions visible as recoverable run diagnostics rather than hiding the run.

### Error Handling

- Catch session creation failures, OpenCode request failures, timeout failures, and malformed result handling.
- Persist failed run state with human-readable error and structured diagnostic details.

## Out of Scope

- Permission merge/application for task runs (Sub-Epic I4.4).
- Full UI for run detail/session links (Sub-Epic I4.5).
- Group chat or multi-agent task sessions.

## Acceptance Criteria

- Each executed task run has a linked OpenCode session ID when session creation succeeds.
- Run history includes the exact rendered prompt/context used for the run.
- Completed runs persist a result summary when OpenCode returns one.
- Failed OpenCode/session operations create failed run records with useful diagnostics.
- A task-created session can be opened from run history and continued in direct chat when valid.
- Tests cover successful session persistence and failure recording.

## Key Files to Create/Modify

- `packages/backend/src/services/task-execution-service.ts`
- `packages/backend/src/services/conversation-service.ts` or related session bridge modules
- `packages/backend/src/services/opencode-service.ts`
- `packages/backend/src/routes/tasks.ts`
- `packages/shared/src/schemas/` task run/session response schemas
- `packages/backend/test/services/task-execution-service.test.ts`

## Reference

- Parent epic: `development/integrations-automation/04-automations.md`
- Direct chat model: `development/core-data-state/03-direct-chat-session-model.md`
- Existing conversation routes/services: `packages/backend/src/routes/conversations.ts`
