# Issue 151: Interrupted Task Run Recovery

## Goal

Prevent an interrupted OpenCode assistant turn from being finalized as a successful task run after CommandsCenter or OpenCode restarts.

## Plan

1. Preserve OpenCode's assistant completion timestamp on mapped conversation messages, including across the existing SQLite conversation cache.
2. Represent a missing session-status map entry as unknown rather than affirmative idle.
3. Require the latest in-scope assistant message to carry explicit completion evidence before the idle debounce can complete a run.
4. During startup recovery, finalize a run with an incomplete assistant turn and missing live session status as an engine interruption, using the existing bounded stall-requeue settings when enabled.
5. Add focused mapper, OpenCode service, monitor, and startup-recovery tests for completed turns, incomplete turns with running tools, missing status, interruption diagnostics, and bounded requeue behavior.
6. Run formatting, lint with fixes, type checking, build, backend tests, workspace tests, and applicable task-run E2E coverage before review.
