# Phase 6 — Document and Enforce the System

- Status: Planned

Parent plans:

- [Design-system task-plan index](../README.md)
- [CC Design System Foundation](../../design-system-foundation.md#phase-6--document-and-enforce-the-system)

Required evidence:

- [Target appearance contract](../phase-0/artifacts/target-appearance-contract.md)
- [Component adoption matrix](../phase-0/artifacts/component-adoption-matrix.md)
- [Phase 4 task plan](../phase-4/README.md)
- [Phase 5 task plan](../phase-5/README.md)
- Phase 5 sign-off and `artifacts/phase-6-handoff.md`, produced by DS-0508

## Goal

Turn the implemented CC design system into a contributor-facing, testable
contract: document how to select tokens, Tailwind utilities, semantic HTML,
primitives, compositions, and theme bridges; encode narrow repository audits;
remove only proven-unused compatibility APIs; and keep all guidance, including
`AGENTS.md`, aligned with the live codebase.

## Delivery strategy

1. Accept the actual Phase 5 handoff and establish one documentation and
   enforcement source of truth from the completed implementation.
2. Write task-oriented contributor guidance and a separate theme/exception
   runbook using real APIs and paths.
3. Update `AGENTS.md` and contributor entry points to state the enforceable
   rules concisely and link to the canonical guide.
4. Consolidate the development-only component gallery and focused visual/
   interaction coverage as a living contract.
5. Implement lightweight, exception-aware audit ratchets; prove their positive
   and negative behavior before adding them to CI.
6. Retire compatibility classes only where zero consumers and a clear
   simplification are proven, then sign off with a contributor usability review.

Phase 6 documents and enforces the system produced by Phases 0–5. It does not
invent a second token vocabulary, adopt a documentation framework, or redesign
components under the label of cleanup.

## Task sequence

| ID      | Task                                                                                         | Blocked by                | Status  |
| ------- | -------------------------------------------------------------------------------------------- | ------------------------- | ------- |
| DS-0601 | [Accept the Phase 5 handoff and freeze the enforcement contract](01-phase-5-handoff.md)      | Phase 5 sign-off          | Planned |
| DS-0602 | [Write the canonical contributor design-system guide](02-contributor-guide.md)               | DS-0601                   | Planned |
| DS-0603 | [Document theme authoring and exception workflows](03-themes-and-exceptions.md)              | DS-0601                   | Planned |
| DS-0604 | [Update AGENTS.md and contributor entry points](04-agents-and-entry-points.md)               | DS-0602, DS-0603          | Planned |
| DS-0605 | [Consolidate the development gallery and visual contract](05-gallery-and-visual-contract.md) | DS-0601                   | Planned |
| DS-0606 | [Implement lightweight design-system audit ratchets](06-audit-ratchets.md)                   | DS-0601                   | Planned |
| DS-0607 | [Retire proven-unused compatibility classes](07-compatibility-retirement.md)                 | DS-0601, DS-0606          | Planned |
| DS-0608 | [Integrate design-system enforcement into contributor workflows](08-workflow-enforcement.md) | DS-0604, DS-0606, DS-0607 | Planned |
| DS-0609 | [Verify and sign off Phase 6](09-phase-6-signoff.md)                                         | DS-0601 through DS-0608   | Planned |

DS-0602, DS-0603, DS-0605, and DS-0606 may proceed in parallel after DS-0601
when their declared files do not overlap. DS-0608 intentionally follows
compatibility cleanup so CI starts with the final reviewed ratchets rather than
a transitional baseline.

## Documentation ownership

- `docs/design-system/` is the canonical contributor guide and runbook.
- `AGENTS.md` contains concise mandatory repository rules and links to the
  canonical guide; it does not duplicate the full design-system manual.
- `CONTRIBUTING.md` exposes local commands and contributor workflow.
- Root `README.md` carries only the accurate stack summary and documentation
  entry point.
- Phase artifacts remain historical evidence, not everyday contributor docs.

## Enforcement principles

- Prefer an existing ESLint boundary when it expresses the rule precisely.
- Use a small repository audit for cross-file/count/exception rules ESLint does
  not express well.
- Every allowlisted result must cite a stable exception ID or approved adapter
  category and exact path; line-number allowlists are not durable.
- Ratchets prevent new debt without demanding artificial zero counts.
- Audit failures must name the rule, file, matched value, approved alternative,
  and relevant documentation.
- Do not add a broad dependency or documentation site generator for this phase.

## Phase exit gate

Phase 6 is complete only when:

- A contributor can choose the correct token, Tailwind utility, semantic HTML
  behavior, primitive, composition, icon, or third-party adapter from the docs.
- A contributor can add a theme by changing approved theme declarations and
  registration only, without editing component implementations.
- `AGENTS.md`, `CONTRIBUTING.md`, README stack claims, manifests, and canonical
  design-system docs agree with the live repository.
- The development gallery covers approved reusable APIs and important states in
  Default light/dark and narrow/wide contexts without shipping to production.
- Audits reject new unapproved hardcoded palette roles, inline SVGs, direct
  Radix use, primitive duplication, compatibility consumers, and bridge bypasses
  while preserving registered exceptions.
- Compatibility classes are removed only when all consumers are gone; retained
  classes have an owner and no-new-consumer ratchet.
- Local commands and CI execute the same deterministic enforcement contract.
