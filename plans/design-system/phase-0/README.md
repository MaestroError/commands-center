# Phase 0 — Inventory and Freeze the Contract

- Status: Complete

Parent plans:

- [Design-system task-plan index](../README.md)
- [CC Design System Foundation](../../design-system-foundation.md#phase-0--inventory-and-freeze-the-contract)

## Goal

Create a complete, reviewable record of CC's current visual and interaction
contracts, approve the target appearance architecture, and use the evidence to
revise all later phases before foundation code changes begin. Phase 0 changes
documentation, test fixtures, and regression baselines; it does not redesign or
migrate production components.

## Task sequence

| ID      | Task                                                                                                     | Blocked by                                  | Status   |
| ------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------- |
| DS-0001 | [Inventory the current design system](01-current-system-inventory.md)                                    | None                                        | Complete |
| DS-0002 | [Define the target appearance contract](02-target-appearance-contract.md)                                | DS-0001                                     | Complete |
| DS-0003 | [Classify components and approve Shadcn/Radix adoption](03-component-disposition-and-adoption-matrix.md) | DS-0001, DS-0002                            | Complete |
| DS-0004 | [Capture application visual baselines](04-application-visual-baselines.md)                               | DS-0001, DS-0002                            | Complete |
| DS-0005 | [Capture Markdown and Milkdown baselines](05-markdown-and-milkdown-baselines.md)                         | DS-0001, DS-0002                            | Complete |
| DS-0006 | [Inventory semantic HTML impact](06-semantic-html-impact-inventory.md)                                   | DS-0001, DS-0002                            | Complete |
| DS-0007 | [Approve exceptions, enrich later phases, and sign off Phase 0](07-exceptions-and-phase-0-signoff.md)    | DS-0002, DS-0003, DS-0004, DS-0005, DS-0006 | Complete |

DS-0001 establishes the current-state evidence. DS-0002 then approves the target
appearance architecture. After DS-0002, DS-0003 through DS-0006 may proceed
independently. DS-0007 is the phase gate and cannot start until all five
upstream tasks are complete.

## Phase outputs

Execution of these tasks creates records under
`plans/design-system/phase-0/artifacts/` and deterministic Playwright baselines
under `packages/frontend/e2e/design-system/`.

Expected records:

- Current token, class, component, hardcoded-style, icon, and third-party bridge
  inventory.
- Approved target appearance contract for `Default`, light/dark/system
  preference behavior, semantic tokens, persistence, and legacy migration.
- Approved component disposition and Shadcn/Radix adoption matrix.
- Application visual-baseline manifest and screenshots.
- Markdown preservation and Milkdown behavior/baseline manifest.
- Semantic HTML impact inventory.
- Approved exception register, downstream-phase reassessment, updated Phase 1–6
  foundation plan, and Phase 0 sign-off record.

## Exit gate

Phase 0 is complete only when DS-0007 confirms that:

- Every proposed token and primitive maps to demonstrated current usage.
- The `Default` theme and color-mode contract is approved before implementation.
- The Shadcn/Radix adoption matrix is approved.
- Existing application, Markdown, and Milkdown contracts have deterministic
  baselines.
- Semantic HTML risks and intentional exceptions are documented.
- Phases 1–6 are re-evaluated and enriched from Phase 0 evidence, and detailed
  Phase 1 planning is identified as the next gate.
- Formatting, type checking, linting, unit/integration tests, and Phase 0
  Playwright checks pass.
