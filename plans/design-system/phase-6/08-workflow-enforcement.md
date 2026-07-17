# DS-0608 — Integrate Design-System Enforcement into Contributor Workflows

- Status: Planned
- Phase: [Phase 6](README.md)
- Foundation reference:
  [Phase 6 scope](../../design-system-foundation.md#phase-6--document-and-enforce-the-system)
- Upstream gates: DS-0604 guidance, DS-0606 audit, DS-0607 final compatibility baseline

## Goal

Make the same final design-system rules easy to run locally and mandatory in CI,
with actionable failures and no contradictory or unnecessarily duplicated check.

## Context

A repository audit that contributors do not know about will drift; a CI-only
check is slow to discover. Conversely, adding expensive scans to every staged
file hook can harm normal development. This task integrates the proven DS-0606
command at the narrowest useful workflow points after compatibility baselines
are final.

## Scope

- Add the design-system audit to the CI static-check job with a clear step name.
- Add it to the appropriate aggregate/release verification command if that
  command represents pre-release repository health.
- Document the exact local command and expected remediation path in
  `CONTRIBUTING.md` and `AGENTS.md` via DS-0604's approved text.
- Keep ESLint as owner of import-level Radix boundaries and avoid running the
  same expensive check multiple times.
- Decide from measured runtime whether lint-staged/pre-push integration is
  useful; do not add it by default without evidence.
- Ensure CI uses the same baseline/configuration/tests as local execution.

## Required deliverables

- CI/static workflow step for the final design-system audit.
- Updated aggregate verification command where justified.
- Final local workflow documentation in AGENTS/CONTRIBUTING.
- `artifacts/workflow-enforcement-record.md` with runtime, placement decisions,
  failure example, and local/CI parity evidence.

## Blockers and dependencies

- Blocked by: DS-0604, DS-0606, and DS-0607.
- Blocks: DS-0609.

## Acceptance criteria

- [ ] A clean repository passes the identical local and CI audit command.
- [ ] A representative forbidden fixture/change fails CI with the same rule ID
      and remediation message as local execution.
- [ ] The CI step has no network/runtime-state dependency and uses committed
      deterministic configuration.
- [ ] Import rules remain owned by ESLint and are not needlessly rescanned.
- [ ] The final compatibility baseline is used; no transitional allowlist ships.
- [ ] AGENTS and CONTRIBUTING name commands that exist in `package.json`.
- [ ] Hook integration is included only when measured cost/scope is appropriate;
      otherwise the documented decision explains its omission.
- [ ] CI runtime remains within the existing static-check budget.

## Verification tests

- Run the final local aggregate and standalone design-system audit commands.
- Exercise the CI command in the same clean environment/order where practical.
- Run a controlled negative case and confirm actionable output/nonzero status.
- Validate workflow YAML, package scripts, documentation links, and command names.
- Record before/after static-check runtime.

## Out of scope

- Creating a separate CI workflow when the static-check job is sufficient.
- Adding slow visual E2E tests to lint-staged or pre-commit hooks.
- Enforcing subjective style preferences not present in the final contract.
