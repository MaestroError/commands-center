# Provider model-not-found error handling

## Assumptions

- OpenCode may surface the failure either as a thrown request error, a chat session error event, or a task-run retry/error status.
- The configured model is not changed automatically. The operator is told to re-save the specialist model or restart OpenCode.
- Existing task-run terminal failure behavior remains authoritative; this change only improves recognition and presentation.

## Todo

- [x] Trace chat and task error normalization and identify the smallest shared boundary.
- [x] Add focused regression tests for chat and task-run `ProviderModelNotFoundError` handling.
- [x] Preserve provider/model details and append actionable recovery guidance.
- [x] Ensure affected task runs terminate and expose the message in the task panel payload.
- [x] Run `eslint --fix`, typecheck, and the relevant/full test suites.

## Success criteria

- Chat displays a concise model-not-found error with provider/model details and recovery guidance.
- A task run encountering the same error ends in `error`, with the actionable message available to the task panel.
- Other failures retain their existing behavior.
- Lint, typecheck, and tests pass.
