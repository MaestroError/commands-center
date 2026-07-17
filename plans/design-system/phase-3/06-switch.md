# DS-0306 — Migrate the Common Switch

- Status: Planned
- Phase: [Phase 3](README.md)
- Foundation reference:
  [React primitives](../../design-system-foundation.md#react-primitives)
- Adoption row: UI-014 in the
  [component adoption matrix](../phase-0/artifacts/component-adoption-matrix.md)

## Goal

Replace the hand-built common Switch behavior and raw palette styling with a
CC-owned Radix Switch primitive while preserving the existing common API.

## Context

The current Switch is a button with `role="switch"`, controlled `checked`, and
`onChange`, but it uses raw emerald, muted, and white colors and lacks focused
disabled/form behavior coverage. The demonstrated production consumer is
`SpecialistForm`; the design-system fixture is a test consumer.

## Scope

- Add the copy-owned Shadcn/Radix Switch primitive authorized by DS-0301.
- Adapt its track/thumb/focus/disabled states to CC semantic tokens and shape
  roles without a Shadcn palette.
- Preserve the existing common `Switch` import path and `checked`, `onChange`,
  `label`, and `aria-label` API through composition or an atomic migration.
- Add disabled support only if approved as a demonstrated native/Radix need and
  update the compatibility contract explicitly.
- Use Radix for switch semantics, keyboard activation, and state exposure.
- Remove raw palette classes and custom role/state behavior made obsolete by
  Radix.

## Required deliverables

- `components/ui/switch.tsx` with focused tests.
- Migrated common Switch adapter or approved atomic consumer import migration.
- SpecialistForm behavioral coverage and gallery states for checked,
  unchecked, focused, and disabled where supported.
- `artifacts/switch-migration-record.md` documenting API compatibility and raw
  palette removal.

## Blockers and dependencies

- Blocked by: DS-0301 and approved unified-Radix support scope.
- Blocks: DS-0309 and DS-0310.

## Acceptance criteria

- [ ] Radix owns switch role, checked state, keyboard activation, and disabled
      behavior.
- [ ] Existing controlled checked/onChange behavior remains compatible.
- [ ] Accessible labeling works through visible label or `aria-label`.
- [ ] Track, thumb, focus, checked, unchecked, and disabled states use semantic
      tokens in Default light/dark.
- [ ] Space activates the switch once; Enter behavior follows the approved
      Radix/native contract and is covered rather than assumed.
- [ ] Raw emerald/white/muted palette styling is removed from the common switch.
- [ ] No direct Radix import appears outside `components/ui`.
- [ ] SpecialistForm domain state and submission behavior remain unchanged.

## Verification tests

- Use Testing Library/user-event for role, accessible name, checked state,
  pointer/keyboard changes, controlled rerender, and disabled behavior.
- Run SpecialistForm tests and the relevant creation/edit flow.
- Use Playwright for visible focus and real keyboard behavior.
- Capture all states in Default light/dark and rerun application baselines.

## Out of scope

- Migrating native checkboxes/radios or the API tri-state checkbox.
- Changing SpecialistForm business rules.
- Adding Toggle, ToggleGroup, or preference persistence.
