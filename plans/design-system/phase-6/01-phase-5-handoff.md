# DS-0601 — Accept the Phase 5 Handoff and Freeze the Enforcement Contract

- Status: Planned
- Phase: [Phase 6](README.md)
- Foundation reference:
  [Phase 6 scope](../../design-system-foundation.md#phase-6--document-and-enforce-the-system)
- Required predecessor: DS-0508 Phase 5 sign-off and Phase 6 handoff

## Goal

Convert the completed design-system implementation and its final inventories
into exact documentation ownership, audit ratchets, compatibility decisions,
and task file boundaries before Phase 6 changes guidance or CI.

## Context

Phase 6 must document the code that exists after Phase 5, not the original
proposal or today's transitional tree. The handoff should contain approved
tokens/APIs, fixtures, exceptions, bridge paths, and proposed ratchets, but each
claim must be reproduced against the live repository.

## Scope

- Read all Phase 4/5 sign-off, inventory, exception, and handoff artifacts.
- Inventory live semantic tokens, theme declarations, base-element rules,
  protected content scopes, UI/common/domain APIs, Radix boundaries, icons,
  third-party adapters, gallery fixtures, and compatibility consumers.
- Run every proposed Phase 6 ratchet and classify false positives/gaps.
- Audit current `AGENTS.md`, `CONTRIBUTING.md`, README, package manifests, and
  code comments for design-system claims that are stale, duplicated, or absent.
- Freeze canonical documentation destinations and non-overlapping ownership for
  DS-0602 through DS-0608.
- Define the final compatibility decision per `cc-*` class family: remove now,
  retain with owner, or block pending a named consumer migration.

## Required deliverables

- `artifacts/phase-6-contract.md` with approved APIs, paths, ownership, task file
  sets, execution order, and completion evidence.
- `artifacts/documentation-gap-map.md` mapping each required contributor
  decision to its current and future documentation owner.
- `artifacts/enforcement-baseline.md` with reproducible commands, exact counts,
  exceptions, approved paths, false positives, and target rule type.
- `artifacts/compatibility-disposition.md` with consumers and decisions for each
  legacy class family.

## Blockers and dependencies

- Blocked by: DS-0508 and its completed Phase 6 handoff.
- Blocks: DS-0602 through DS-0609.

## Acceptance criteria

- [ ] Every documented API, token, class, route, fixture, and command exists in
      the post-Phase-5 tree.
- [ ] Every required contributor decision has exactly one canonical docs owner.
- [ ] `AGENTS.md`, CONTRIBUTING, README, and manifest discrepancies are listed
      with an exact correction owner.
- [ ] Every proposed automated rule has a reproducible baseline, approved
      exceptions, and a reason to use ESLint, a repository audit, or a test.
- [ ] Existing direct-Radix enforcement is preserved rather than duplicated.
- [ ] Every compatibility class has current consumer evidence and one decision.
- [ ] Documentation, gallery, audit, cleanup, and CI tasks have non-overlapping
      primary file ownership or an explicit sequence.
- [ ] No Phase 6 task is authorized from stale Phase 0 counts alone.

## Verification tests

- Re-run all Phase 4/5 final inventory and ratchet commands.
- Search documentation and manifests for Tailwind, Shadcn, Radix, assistant-ui,
  SVAR, Markdown, Milkdown, Monaco, xterm, theme, and `cc-*` claims.
- Resolve every referenced source path, documentation link, fixture, exception
  ID, and package dependency.
- Review task ownership against the live git tree before implementation starts.

## Out of scope

- Editing product source, docs, audits, compatibility classes, or CI.
- Changing exceptions or count targets without reproduced evidence.
- Treating planned/aspirational dependencies as installed technologies.
