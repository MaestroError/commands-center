# CC Design System Task Plans

This directory contains executable task plans derived from the
[CC Design System Foundation](../design-system-foundation.md). The foundation
document owns the architectural decisions and phase-level sequence. These task
plans own implementation scope, dependencies, acceptance criteria, and
verification.

## Planning rules

- Every task links back to the foundation plan and its phase index.
- Every phase links to each detailed task from the foundation plan.
- Every task identifies blockers and the later tasks it blocks.
- A task is complete only when all acceptance criteria and verification checks
  pass.
- New architectural decisions must be added to the foundation plan first, then
  reflected in affected task plans.
- Findings and baselines produced during execution belong in the task's declared
  `artifacts/` paths.
- Later phase task plans must use the same structure: goal, context, scope,
  deliverables, blockers, acceptance criteria, verification tests, and out of
  scope.

## Phases

| Phase                                       | Detailed plan                           | Status      |
| ------------------------------------------- | --------------------------------------- | ----------- |
| Phase 0 — Inventory and freeze the contract | [Phase 0 task index](phase-0/README.md) | Complete    |
| Phase 1 — Normalize foundations             | [Phase 1 task index](phase-1/README.md) | Complete    |
| Phase 2 — Establish typed UI primitives     | [Phase 2 task index](phase-2/README.md) | Complete    |
| Phase 3 — Consolidate common compositions   | [Phase 3 task index](phase-3/README.md) | Complete    |
| Phase 4 — Migrate domain UI                 | [Phase 4 task index](phase-4/README.md) | In progress |
| Phase 5 — Complete third-party theming      | [Phase 5 task index](phase-5/README.md) | Planned     |
| Phase 6 — Document and enforce              | [Phase 6 task index](phase-6/README.md) | Planned     |
