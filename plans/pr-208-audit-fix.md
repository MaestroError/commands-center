# PR #208 audit fix

- [x] Inspect CI: brace-expansion advisories GHSA-qhr7-859c-m2p7 and GHSA-6j4f-fj2g-mc7p affect the existing lint-tool overrides.
- [x] Upgrade only brace-expansion overrides to patched 1.1.20 and 5.0.11; regenerate the lockfile.
- [x] Verify the high-severity audit, ESLint --fix, typecheck, and tests with the updated dependency installation.
- [x] Prepare the validated fix for publication to PR #208.

Validation: pnpm audit --audit-level=high passes with zero high/critical findings (40 moderate, 7 low remain). All 3,815 package tests passed. Repository ESLint --fix, typecheck, formatting, and diff checks passed. The lockfile changes only brace-expansion 1.1.18 → 1.1.20 and 5.0.9 → 5.0.11.
