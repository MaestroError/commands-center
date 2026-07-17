# Phase 1 — Normalize Foundations Without Redesigning Screens

- Status: Planned

Parent plans:

- [Design-system task-plan index](../README.md)
- [CC Design System Foundation](../../design-system-foundation.md#phase-1--normalize-foundations-without-redesigning-screens)

## Goal

Replace CC's conflated theme plumbing with the approved `Default` theme and
light/dark/system color-mode contract, complete the semantic token foundation,
and give unclassed HTML a low-specificity CC appearance without redesigning
existing screens or changing protected Markdown and Milkdown output.

## Delivery strategy

Phase 1 is intentionally ordered so each layer has a stable dependency:

1. Appearance state and legacy migration.
2. Complete semantic token vocabulary and existing `cc-*` compatibility.
3. Four small semantic-HTML batches.
4. A separate responsive-shell correction.
5. Integrated visual, behavioral, and repository verification.

Do not combine Phase 1 with Shadcn/Radix installation or component migration.
Those begin in Phase 2 after this foundation is stable.

## Task sequence

| ID      | Task                                                                                  | Blocked by                                           | Status  |
| ------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------- |
| DS-0101 | [Implement the appearance state contract](01-appearance-state-contract.md)            | Phase 0                                              | Planned |
| DS-0102 | [Complete semantic tokens and normalize compatibility styles](02-token-foundation.md) | DS-0101                                              | Planned |
| DS-0103 | [Add semantic base guardrails and inherited defaults](03-semantic-base-guardrails.md) | DS-0102                                              | Planned |
| DS-0104 | [Style headings, paragraphs, and document separators](04-semantic-typography.md)      | DS-0103                                              | Planned |
| DS-0105 | [Style semantic lists](05-semantic-lists.md)                                          | DS-0104                                              | Planned |
| DS-0106 | [Style tables, code, and remaining semantic elements](06-semantic-structures.md)      | DS-0105                                              | Planned |
| DS-0107 | [Correct narrow shell overflow](07-responsive-shell.md)                               | DS-0101                                              | Planned |
| DS-0108 | [Verify and sign off Phase 1](08-phase-1-signoff.md)                                  | DS-0102, DS-0103, DS-0104, DS-0105, DS-0106, DS-0107 | Planned |

DS-0107 is logically independent of the semantic rollout after DS-0101 and may
be implemented alongside DS-0103 through DS-0106. DS-0108 remains blocked until
all implementation tasks are complete.

## Verification fixture

`/__design-system-baseline` is a development-only, authentication-bypassed
fixture created in Phase 0. It renders deterministic examples of existing CC
surfaces so implementation work can be compared without relying on live API
data or a particular workspace.

Supported surfaces:

- `?surface=application` — existing panels, actions, fields, badges, and states.
- `?surface=dialog` — current dialog, overlay, and underlying surface.
- `?surface=markdown` — protected reader and chat Markdown.
- `?surface=milkdown` — protected editor behavior and visuals.
- `?surface=semantic` — unclassed HTML used to review intentional base-style
  changes.

The route exists only when `import.meta.env.DEV` is true, is excluded from unit
coverage because Playwright owns it, and is removed from production bundles.
It is test infrastructure, not a product page, component catalogue, or source
of future component APIs. Keep it through the design-system migration; remove
or replace it only after the final phase decides the permanent gallery/testing
strategy.

## Phase exit gate

Phase 1 is complete only when:

- `Default` is the sole theme and its resolved light/dark output is stable.
- Light, dark, and system preferences initialize without an avoidable wrong-mode
  flash and migrate all legacy values safely.
- Header and Profile own their approved, separate appearance responsibilities.
- Existing consumers use one complete semantic token contract.
- Unclassed semantic HTML looks like CC and remains overridable.
- `.cc-md`, `.cc-md--chat`, and Milkdown remain protected.
- The app shell and semantic fixture do not overflow at the approved narrow
  viewport.
- All documented automated and manual verification passes.
