# DS-0301 — Accept the Phase 2 Handoff and Freeze the Common-Composition Contract

- Status: Complete
- Phase: [Phase 3](README.md)
- Foundation reference:
  [Phase 3 scope](../../design-system-foundation.md#phase-3--consolidate-common-compositions)
- Required predecessor: DS-0207 Phase 2 sign-off

## Goal

Reconcile the implemented Phase 2 primitive APIs with every Phase 3 common
composition and approve the smallest additional support-primitive batches before
editing consumers.

## Context

Phase 3 planning is written while Phase 2 is being implemented in parallel.
The final Button, Dialog, AlertDialog, `cn`, dependency, and gallery APIs must be
treated as inputs rather than assumed from the plan. Current common components
also vary significantly: dialogs lack unified focus behavior, TabBar has no
arrow-key contract, Switch uses raw colors, PasswordInput assembles its own
field/toggle states, and SearchableSelect implements a custom combobox.

## Scope

- Read the completed Phase 2 sign-off and inspect actual public primitive APIs.
- Re-run the adoption-matrix inventory for UI-002, UI-004 through UI-009, and
  UI-014 through UI-020.
- Record current props, consumers, keyboard/focus behavior, visual states, and
  focused test coverage for every Phase 3 target.
- Classify each target as compose existing primitive, add one approved support
  primitive, retain native behavior, or keep domain-specific.
- Freeze support-primitive files, exports, dependencies, and direct consumers
  for DS-0304 through DS-0308.
- Confirm terminal/editor tab bars, composer popovers, and other Phase 0
  exclusions remain outside the common migrations.
- Define API compatibility and deprecation rules for common adapters.

## Required deliverables

- `artifacts/common-composition-contract.md` containing the implemented Phase 2
  handoff, target/consumer inventory, API compatibility matrix, behavior gaps,
  support-primitive allowlist, dependency allowlist, exclusions, and task
  ownership.
- Focused pre-migration tests for uncovered current domain behavior, with no
  expected-failing assertions.
- An explicit authorization decision for each DS-0302 through DS-0308 batch.

## Blockers and dependencies

- Blocked by: DS-0207 and an approved Phase 2 sign-off.
- Blocks: DS-0302 through DS-0310.

## Acceptance criteria

- [ ] The contract references actual Phase 2 source and sign-off rather than
      planned APIs.
- [ ] Every Phase 3 target has current consumers, public props, behavior, and
      test ownership recorded.
- [ ] Every proposed support primitive has a named common-composition consumer
      and approved adoption-matrix classification.
- [ ] Any new dependency is tied to one approved support primitive; `cmdk` or an
      equivalent Command dependency is not added without explicit approval.
- [ ] Common adapters preserve public APIs by default; any exception includes an
      atomic consumer migration and rationale.
- [ ] Direct Radix imports remain prohibited outside `components/ui/`.
- [ ] Terminal/editor tabs, composer suggestions, Markdown, Milkdown, Monaco,
      xterm, file-manager internals, and broad domain migrations remain excluded.
- [ ] No implementation task starts with an unresolved behavioral decision.

## Verification tests

- Re-run import and usage searches for every target component.
- Run focused existing tests for ConfirmDialog, document dialogs, PasswordInput,
  TabBar, SearchableSelect, and each direct consumer with behavior not otherwise
  isolated.
- Compare proposed files/dependencies with the Phase 0 adoption matrix and Phase
  2 sign-off allowlists.
- Verify every artifact link and named test path resolves.

## Out of scope

- Adding dependencies, primitives, or migration code.
- Reopening the Phase 1 theme/token architecture.
- Approving speculative Phase 4 domain primitives.
