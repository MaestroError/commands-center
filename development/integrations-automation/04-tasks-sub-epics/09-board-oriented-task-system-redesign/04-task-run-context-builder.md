# ✅ I4.9 Phase 4: Task Run Context Builder

## Goal

Create a dedicated context builder that produces immutable task-run prompt/context snapshots from task state, comments, subtasks, prior runs, artifacts, and assignment information.

## Blockers

- Phase 1: Contracts and DB Model.
- Phase 3: Backend Queue Lifecycle.

## Unblocks

- Phase 5: Scheduler, Templates, and Archival.
- Phase 6: REST API and MCP Surface.
- Phase 7: Frontend Integration.

## Scope

- Extract prompt/context composition out of `task-execution-service` into a dedicated module or service.
- Include task description and current task metadata.
- Include target subtask when present.
- Include open/unhandled comments as actionable feedback.
- Include previous run results, review reasons, failures, and artifacts.
- Include artifact paths or URLs exactly.
- Include actual run agent and task default agent context.
- Persist rendered prompt and structured context snapshot on the task run.
- Keep context snapshots immutable after run creation.

## Context Contract

- `task`: current task identity and description.
- `target`: whole task or subtask target.
- `feedback`: open/unhandled comments included in this run.
- `history`: previous runs with result text, final message, outcome, failure/review details, and timestamps.
- `artifacts`: previous artifact title, description, path or URL, and source run ID.
- `assignment`: default task agent and actual run agent.
- `trigger`: manual, scheduled, api, or template metadata.

## Backend Files

- `packages/backend/src/services/task-run-context-service.ts` or equivalent new module.
- `packages/backend/src/services/task-execution-service.ts`
- `packages/backend/src/services/task-service.ts`
- `packages/shared/src/schemas/tasks.ts`

## Verification

- Unit tests cover first run context.
- Unit tests cover retry context with previous result and artifacts.
- Unit tests cover open feedback comments included in a retry.
- Unit tests cover reassignment context.
- Unit tests cover subtask-focused context.
- Prompt escaping tests continue to prevent context injection.
