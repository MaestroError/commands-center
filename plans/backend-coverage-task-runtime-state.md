# Plan: Backend Coverage Task Runtime State

## Problem

Backend coverage failed in `task-execution-service.test.ts` because the test waited for the broad `running` status and then immediately asserted the derived `runtimeState`. A queued task run can become `running` before the async OpenCode monitor metadata is persisted, especially under coverage instrumentation.

## Implementation Tasks

1. Wait for the specific `waiting_for_opencode` runtime substate in the async monitor metadata test.
2. Keep production task execution behavior unchanged.
3. Verify the failing coverage target and standard checks before pushing.

## Verification

- `pnpm --filter @cc/backend exec vitest run --coverage test/services/task-execution-service.test.ts`
- `pnpm exec eslint --fix .`
- `pnpm --filter @cc/backend typecheck`
- `pnpm test`
