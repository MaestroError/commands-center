# Plan: Backend CI Racy Task Execution Test

**Status:** Completed. Authored 2026-07-01.
**Goal:** Fix the backend CI failure by removing timing-sensitive assumptions from backend task execution tests.

## Todo

- [completed] Confirm the CI failure and identify the racy assertions in the backend task execution tests.
- [completed] Update the tests to wait for stable session evidence instead of assuming background side effects are persisted immediately after status changes.
- [completed] Run lint and the most relevant backend verification commands, then summarize results.
