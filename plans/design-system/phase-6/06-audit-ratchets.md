# DS-0606 — Implement Lightweight Design-System Audit Ratchets

- Status: Complete
- Phase: [Phase 6](README.md)
- Foundation reference:
  [Phase 6 scope](../../design-system-foundation.md#phase-6--document-and-enforce-the-system)
- Upstream gate: DS-0601 enforcement baseline

## Goal

Add a deterministic, fast repository audit that prevents new design-system debt
while accepting only the final reviewed baseline, approved adapter paths, and
stable exception IDs.

## Context

ESLint already owns precise source rules such as the direct-Radix import
boundary. Cross-file counts, raw palette values, inline SVGs, compatibility
consumers, and third-party bridge locations need a small complementary audit.
The tool must ratchet real remaining debt rather than demand artificial zeroes
or hide values behind vague variables.

## Scope

- Preserve and test existing ESLint design-system boundaries; do not implement
  the same rule twice.
- Implement a repository audit, preferably with the standard library/current
  dependencies, for the DS-0601-approved rules.
- Cover new unapproved theme-dependent raw palette/hardcoded colors, inline SVG,
  primitive/composition duplication signatures, `cc-*` compatibility consumers,
  third-party fixed-theme/bridge bypasses, and exception/approved-path drift.
- Keep semantic product colors, brand artwork, syntax, ANSI, and bridge values
  tied to stable exception IDs or explicit approved categories.
- Use path-and-rule allowlists rather than line-number suppressions.
- Add positive tests for the live baseline and isolated negative fixtures for
  each rule, including actionable failure messages.
- Add one documented local package command, such as
  `pnpm design-system:audit`, only after naming is reconciled with existing scripts.

## Required deliverables

- A small audit implementation/configuration in the DS-0601-approved root
  `scripts/` location.
- Test fixtures proving each rule accepts approved cases and rejects violations.
- Root package command and focused audit tests.
- `artifacts/audit-rule-register.md` with rule IDs, purpose, owner, scope,
  exceptions, examples, expected baseline, and remediation link.

## Blockers and dependencies

- Blocked by: DS-0601.
- Blocks: DS-0607, DS-0608, and DS-0609.

## Acceptance criteria

- [x] Every rule corresponds to a reproduced Phase 4/5 ratchet or explicit final
      design-system boundary; no speculative style preference becomes CI policy.
- [x] Existing ESLint Radix ownership remains the single enforcement mechanism
      for direct imports, with the audit checking only uncovered drift if needed.
- [x] The live reviewed tree passes with exact, human-readable baselines.
- [x] Each negative fixture fails only its intended rule and reports rule ID,
      file, match, approved alternative, and documentation link.
- [x] Allowlisted results cite stable exception IDs or approved adapter paths;
      line numbers and blanket directories are not used as suppressions.
- [x] New `cc-*` consumers fail even when retained legacy definitions still
      exist; retained consumer counts cannot increase.
- [x] The audit is deterministic across macOS/Linux paths and completes quickly
      enough for local and CI static checks.
- [x] No new dependency is added unless the standard library/current tooling
      cannot implement a demonstrated rule safely.

## Verification tests

- Run the audit twice on the live repository and compare stable output/counts.
- Run every positive and negative fixture independently.
- Run ESLint boundary tests/checks to prove direct-Radix behavior remains owned
  there and approved `components/ui/` imports still pass.
- Execute on normalized POSIX/Windows-style fixture paths if path handling is
  implemented manually.
- Measure runtime and record it in the audit rule register.

## Out of scope

- Building a general-purpose CSS/AST linter.
- Failing on every Tailwind palette utility regardless of semantic context.
- Replacing visual, accessibility, or behavior tests with textual searches.
