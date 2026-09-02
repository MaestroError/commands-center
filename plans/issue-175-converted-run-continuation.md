# Issue 175 Converted Run Continuation Plan

## Goal

Make a converted task-run conversation the sole continuation surface while preserving its task-run provenance, parent task state, sibling runs, and future task executions.

## Approach

1. Keep `source: "task_run"` immutable and use `convertedAt` to distinguish a converted chat-accessible conversation from an active task-run session.
2. Reject direct replies to converted runs before conversation synchronization, run/task reactivation, follow-up insertion, prompt delivery, or activity mutation.
3. Allow `add_task_artifact` for either an owned running run or an owned terminal run whose linked conversation is converted and current; leave all other outcome tools unchanged.
4. Enrich task-run responses with compact linked-conversation metadata so task detail, run history, task panels, and notification actions can render `Open chat` without synchronizing sessions.
5. Label a new execution after conversion as `Start new run`, preserving the existing queue path and independent run/conversation creation.

## Files

- Backend conversation and reply ownership: `packages/backend/src/services/conversation-service.ts`, `packages/backend/src/services/task-execution-service/reply-flow.ts`
- Backend artifact authorization and run projection: `packages/backend/src/services/task-service/run-ops.ts`, `packages/backend/src/services/task-service/mappers.ts`
- Shared response contract: `packages/shared/src/schemas/tasks.ts`
- Frontend task and notification surfaces: `packages/frontend/src/pages/task-detail/task-run-detail.tsx`, task board/detail components, and `packages/frontend/src/components/activities/ActivityActions.tsx`
- Focused backend, shared, frontend, route/MCP, and E2E coverage beside the existing task continuation tests

## Verification

- Prove conversion leaves task/run status and task-run provenance unchanged while exposing the conversation as current chat.
- Prove rejected replies cause no run, task, follow-up, activity, message-cache, or prompt mutation.
- Prove artifact compatibility accepts only the same specialist's current converted chat and creates one conversation artifact.
- Prove converted task, history, and notification surfaces open chat while unconverted runs retain reply behavior.
- Prove starting a new run remains independent and is clearly labeled.
- Run focused tests, formatting, lint, type checking, knip, build, full unit/integration suites, design-system audit, and Playwright E2E only when a supported browser executable is available.

## Non-Goals

- No schema migration, dependency change, automatic task acceptance/archive, run-result merge, arbitrary historical artifact mutation, or change to normal unconverted reply behavior.

## Review Maintenance

1. Disable run-history and run-detail chat actions while conversion is pending or the specialist slug is unavailable, and label the pending state `Opening...`.
2. Catch open-in-chat failures on both surfaces and render the mutation error without navigating.
3. Add focused regressions for pending, rejected, and unavailable-specialist behavior on each surface.
