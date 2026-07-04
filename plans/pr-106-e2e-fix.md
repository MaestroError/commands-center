# PR #106 E2E Fix Plan

1. [x] Confirm failing E2E routes from CI logs and local code inspection.
   - Verify: identify the missing mocked endpoints or UI selectors that explain the red Playwright jobs.

2. [x] Apply the smallest fixture or UI wiring fix needed for the refactor.
   - Verify: focused E2E specs can reach seeded specialists, skills, tasks, and templates.

3. [x] Run lint and relevant tests.
   - Verify: `eslint --fix`, focused E2E tests, and broader available test commands pass or report any environment blocker.
