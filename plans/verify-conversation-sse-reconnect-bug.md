# Verify conversation SSE reconnect bug

## Goal

Verify and fix the behavior where a closed conversation event stream prevents resumed chat output from rendering after a live-request Apply.

## Tasks

- [x] Add a focused hook regression test that opens a live request, closes the event stream, resolves the request, and expects resumed output from a replacement stream.
- [x] Run only the affected frontend test file and confirm the new test fails for the expected missing-reconnect reason.
- [x] Record what the reproduction proves and distinguish it from evidence about the original incident's transport state.
- [x] Add an abort-aware reconnect loop with bounded backoff around the conversation event subscription.
- [x] Update hook test helpers so their default streams remain connected until the hook aborts them.
- [x] Make the regression test pass, then run frontend lint, tests, and typecheck.

## Success criteria

- A closed or failed stream reconnects while the same conversation remains active.
- Navigation and unmount abort both the active stream and any pending retry.
- The resumed assistant event in the regression test renders without a page reload.
- Frontend lint, tests, and typecheck pass.
