# DS-0410 — Close Palette, Icon, Component, and Compatibility Inventories

- Status: Planned
- Phase: [Phase 4](README.md)
- Foundation reference:
  [theme completeness](../../design-system-foundation.md#6-make-theme-completeness-measurable)
- Baseline: [DS-0401 live ratchets](artifacts/phase-4-ratchets.md)

## Goal

Account for every residual Phase 4 appearance bypass and prove that domain
migrations reduced inventories through semantic ownership rather than hiding or
renaming hardcoded values.

## Context

Domain batches intentionally leave approved brand/product exceptions and Phase
5 editor/terminal bridges. Some compatibility classes also remain for unmigrated
or justified consumers until Phase 6. A repository-wide closure task is needed
to distinguish those from missed migrations and establish realistic enforcement
ratchets.

## Scope

- Re-run DS-0401 raw palette, hardcoded color, inline SVG, Lucide, `cc-*`, direct
  Radix, primitive/common import, and modal/role searches.
- Compare final counts with Phase 0 historical and DS-0401 live baselines.
- Trace each residual raw value/icon/class/custom interaction to an exact
  exception, Phase 5 bridge, native/domain decision, or remaining owner.
- Review new tokens for semantic purpose, demonstrated consumers, both resolved
  modes, and bounded category/status meaning.
- Verify no domain code branches on theme ID/color mode or imports Radix.
- Recommend Phase 6 audit thresholds without adding enforcement prematurely.
- Do not remove compatibility classes until every consumer is gone and removal
  is an approved simplification.

## Required deliverables

- `artifacts/final-domain-inventory.md` with commands, counts, files,
  dispositions, and baseline deltas.
- Updated exception register/addendum with stable IDs and exact residual paths.
- `artifacts/phase-6-ratchet-recommendation.md` with realistic no-increase or
  bounded thresholds and false-positive guidance.
- A list of compatibility classes still consumed, fully unused, or deferred to
  Phase 6 removal review.

## Blockers and dependencies

- Blocked by: DS-0402 through DS-0409.
- Blocks: DS-0411 and DS-0412.

## Acceptance criteria

- [ ] Every residual match has one exact owner/disposition; no unexplained raw
      palette, hardcoded color, or inline SVG remains.
- [ ] EX-001/EX-002/EX-003 paths remain narrow and Phase 5 EX-004/EX-005 paths
      are handed off exactly.
- [ ] Category/status tokens encode demonstrated product meaning and do not form
      an arbitrary palette.
- [ ] No new theme/mode component branch, direct Radix domain import, or parallel
      CSS component system exists.
- [ ] Count reductions come from migrated consumers, not ignored directories or
      weakened search patterns.
- [ ] Compatibility classes are retained or proposed for removal from actual
      consumer evidence.
- [ ] Recommended Phase 6 ratchets are reproducible and practical.

## Verification tests

- Run the same search expressions against the same source scopes as DS-0401.
- Diff every file list and count against Phase 0 and Phase 4 start.
- Run token completeness/import-boundary tests after any final semantic cleanup.
- Manually review every retained exception and proposed class-removal candidate.

## Out of scope

- Deleting compatibility classes as a count-cleanup shortcut.
- Implementing Phase 6 contributor audits.
- Migrating Phase 5 third-party bridge values.
