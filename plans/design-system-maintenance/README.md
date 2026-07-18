# Design-System Maintenance Program

- Status: In progress
- Parent: [CC Design System Foundation](../design-system-foundation.md)
- Contributor contract: [CC Design System](../../docs/design-system/README.md)

## Goal

Reduce the residual design-system debt left intentionally outside the completed
foundation program without reopening its architecture or turning migration
counts into a visual rewrite. The work prioritizes accessible behavior first,
then direct adoption of existing typed primitives, then new primitives proven by
real consumers, and finally a no-visual-change selector cleanup.

## Working rules

- The completed foundation remains the source of architectural decisions.
- Native HTML remains valid when it supplies the required behavior. A raw
  element count is not, by itself, a migration target.
- Direct `cc-*` compatibility-class consumption is debt. Existing ratchets may
  decrease but must never be relaxed to make a migration pass.
- Domain behavior and data flow remain in their owning domains. Shared
  primitives own reusable semantics, accessibility, and visual variants.
- Add a primitive only with an approved immediate consumer. Do not create a
  speculative Shadcn catalogue.
- Preserve the current Default light/dark appearance and protected Markdown and
  Milkdown contracts.

## Ordered tasks

| ID      | Task                                                                                  | Blocked by | Status   |
| ------- | ------------------------------------------------------------------------------------- | ---------- | -------- |
| DSM-001 | [Close retained custom-overlay accessibility debt](01-overlay-accessibility.md)       | None       | Complete |
| DSM-002 | [Deepen Button and Input adoption](02-button-input-adoption.md)                       | DSM-001    | Planned  |
| DSM-003 | [Add deferred primitives only for proven consumers](03-consumer-driven-primitives.md) | DSM-002    | Planned  |
| DSM-004 | [Normalize semantic base-selector specificity](04-base-selector-specificity.md)       | DSM-003    | Planned  |

The order is intentional. Overlay migration closes correctness and accessibility
risk first. That work also removes some direct button/input compatibility
consumers before the broader adoption inventory is frozen. The adoption task
then supplies evidence for any missing primitive. Selector cleanup runs last
because it has broad CSS reach but low current product risk.

## Program exit gate

This program is complete only when:

- all ten retained custom-overlay paths delegate modal behavior to CC-owned
  primitives and the audit allowlist is empty;
- ordinary button and input call sites no longer consume compatibility classes
  directly, while justified native controls remain allowed;
- every deferred primitive candidate has an evidence-backed disposition and
  every introduced primitive ships with real consumers and tests; and
- generic semantic HTML selectors have the agreed low-specificity form with no
  change to protected content, explicit utilities, or rendered appearance.

Each task owns its own inventory artifact under this directory's `artifacts/`
folder. Counts must be reproduced from the live tree when implementation begins;
the reviewer estimates are context, not frozen acceptance baselines.
