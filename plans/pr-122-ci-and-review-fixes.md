# PR 122 CI and Review Fixes

## Todo

- [x] Stabilize the stalled-run requeue-limit test by giving its asynchronous assertion an explicit CI-safe timeout.
- [x] Correct provider-model task-run stage details so session creation and prompt failures remain distinguishable.
- [x] Add or update focused tests for both provider-model failure stages.
- [x] Run ESLint with fixes and the backend test suite.
- [x] Resolve the addressed PR review thread after verification passes.

## Success criteria

- The stalled-run requeue-limit test no longer depends on Vitest's one-second polling default.
- Provider model errors without an OpenCode session report `task_session_create`; prompt errors or runs with a session report `task_session_prompt`.
- Backend linting and tests pass.
- The relevant PR review thread is resolved.
