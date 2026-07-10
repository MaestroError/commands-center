# Backend Coverage Logger Stub

## Goal

Fix the unhandled rejection that makes the backend coverage CI job fail after
all tests pass.

## Tasks

1. [completed] Add the missing `error` method to the logger fixture used by
   the OpenCode abort failure test.
2. [completed] Run lint, the affected test, and backend coverage.
3. [in progress] Commit and push the fix, then verify the PR check status.
