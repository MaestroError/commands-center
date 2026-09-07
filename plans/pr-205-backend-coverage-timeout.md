# PR #205 backend coverage timeout

- [x] Inspect CI: Backend Tests passed; Backend Coverage failed waiting for three failed feedback-subtask runs.
- [x] Verify the polling timeout and reproduce the retry-chain test with coverage.
- [x] Give the asynchronous retry-chain assertion the same explicit polling budget as nearby lifecycle tests, with sufficient overall test time.
- [x] Run ESLint --fix, backend tests with coverage, and typechecking; commit and push the follow-up under the existing PR-resolution authorization.

The test passed locally with coverage before changes. A temporary 1.5-second prompt gate reproduced the exact polling failure; the same delayed test passed with the explicit five-second polling budget. The temporary delay was removed. The test has a ten-second overall limit to allow setup and cleanup. Production behavior and coverage thresholds are unchanged.

Validation: all 1,657 backend tests passed with coverage and the configured thresholds. ESLint --fix and backend typechecking passed.
