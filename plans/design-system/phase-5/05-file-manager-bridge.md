# DS-0505 — Audit and Normalize the File-Manager Bridge

- Status: Planned
- Phase: [Phase 5](README.md)
- Foundation reference:
  [Phase 5 scope](../../design-system-foundation.md#phase-5--complete-third-party-theming)
- Upstream gates: DS-0501 and DS-0409 workspace/file-manager migration

## Goal

Prove whether a third-party file-manager theme bridge exists after Phase 4 and,
only when backed by a real consumer, normalize it to the CC semantic contract
without changing file-management behavior.

## Context

The current repository uses CC-owned file-manager components and has no SVAR
dependency or consumer, despite older architectural references to SVAR. Phase 4
owns CC chrome migration. Phase 5 must not install a dependency or create an
unused adapter merely to satisfy an outdated label.

## Scope

- Audit package manifests, imports, runtime consumers, CSS selectors/variables,
  and Phase 4 file-manager artifacts.
- Classify each remaining visual value as CC-owned domain UI, a real third-party
  bridge, an approved exception, or unrelated product semantics.
- If no third-party consumer exists, record a verified no-implementation
  disposition and reuse Phase 4 file-manager appearance/behavior coverage.
- If a real consumer exists, freeze its fixture before changes, map its supported
  theme API/variables to CC semantics, and keep the adapter scoped to that
  consumer.
- Preserve navigation, selection, uploads, dialogs, revisions/conflicts,
  read-only roots, permissions, errors, and URL behavior.

## Required deliverables

- `artifacts/file-manager-bridge-disposition.md` with dependency/consumer proof,
  exact ownership, and either the no-op decision or implementation scope.
- If applicable, a stable bridge fixture, semantic mapping, scoped adapter,
  focused tests, and reviewed light/dark baselines.
- Updated Phase 4/Phase 5 inventory disposition for every file-manager visual
  result.

## Blockers and dependencies

- Blocked by: DS-0501, DS-0409, and the relevant Phase 4 sign-off evidence.
- Blocks: DS-0506 through DS-0508.

## Acceptance criteria

- [ ] Package, import, runtime, and CSS evidence proves whether a real third-
      party file-manager bridge exists.
- [ ] No SVAR, assistant-ui, or replacement file-manager dependency is added to
      manufacture a consumer.
- [ ] When no bridge exists, the task closes with a documented no-op and no
      production source change.
- [ ] When a bridge exists, a fixture passes before changes and the supported
      adapter updates live in Default light/dark/system.
- [ ] CC-owned file-manager chrome remains owned by Phase 4 primitives/tokens,
      not duplicated in a Phase 5 bridge.
- [ ] File navigation, operations, uploads, dialogs, revisions/conflicts,
      permissions, read-only state, errors, and URLs remain stable.
- [ ] Every retained product/category/brand color has a specific disposition;
      none is hidden behind a vague `file-manager` token.

## Verification tests

- Search manifests, lockfile, imports, rendered consumers, and CSS for SVAR and
  any other file-manager library or bridge API.
- Run focused file-manager unit/integration tests and the Phase 4 file-manager
  visual/behavior fixture in Default light/dark at narrow/wide viewports.
- If a bridge exists, switch light/dark/system while its live state is active
  and run two consecutive no-update visual passes.
- Review the disposition against DS-0409 and DS-0412 artifacts.

## Out of scope

- Installing or adopting SVAR.
- Reworking CC-owned file-manager components already migrated in Phase 4.
- Changing file APIs, persistence, routing, or portable workspace behavior.
