# PR #199 dependency audit

- [x] Inspect the failing audit job and dependency paths.
- [x] Update js-yaml to 4.3.2 and smol-toml to 1.7.1 without unrelated dependency upgrades.
- [x] Verify the audit, ESLint with --fix, Knip, and focused regression tests.
- [ ] Publish the verified fix using the existing commit/push authorization.

CI job 109374590698 reports GHSA-2883-xcg3-v3hh (ESLint's js-yaml 4.3.1) and GHSA-7w5x-hrqm-74c2 (Knip's smol-toml 1.7.0). The job is informational via continue-on-error, so the overall CI result is green despite these findings.

## Validation

- Frozen-lockfile installation succeeds.
- Registry audit passes at high severity: 0 high, 0 critical; 35 moderate and 7 low remain.
- ESLint with --fix, Knip, and all 24 task-detail regression tests pass.
- No advisory suppressions or CI policy changes. Only the two affected transitive dependencies are updated.
