# DS-0307 — Migrate Ordinary Common Tabs

- Status: Complete
- Phase: [Phase 3](README.md)
- Foundation reference:
  [React primitives](../../design-system-foundation.md#react-primitives)
- Adoption rows: UI-017 and UI-018 in the
  [component adoption matrix](../phase-0/artifacts/component-adoption-matrix.md)

## Goal

Move the ordinary reusable `TabBar` onto CC-owned Radix Tabs behavior while
preserving its controlled tab-ID API, scrolling presentation, icons, and current
page consumers.

## Context

`TabBar` currently provides tab roles and selected state but uses independent
buttons, has no roving-focus/arrow-key behavior, and does not own panels. It is
widely used across ordinary page sections and layout surfaces. Dedicated
`TerminalTabBar` and `EditorTabBar` have close/dirty/pane behavior and remain
explicitly excluded.

## Scope

- Reconcile every `TabBar` consumer with the DS-0301 ordinary/domain tab
  classification before changing the shared component.
- Add the approved copy-owned Shadcn/Radix Tabs primitive.
- Preserve `tabs`, `activeTabId`, `onTabChange`, `testIdPrefix`, icons,
  icon-only accessible labels, and horizontal overflow behavior.
- Define how externally rendered panels associate with triggers; do not claim
  complete tabpanel semantics when a consumer does not expose a panel ID.
- Add arrow-key, Home/End, focus, activation-mode, disabled-if-needed, and
  controlled-state behavior according to the approved contract.
- Keep terminal/editor-specific tab components on their existing controllers.
- Remove only ordinary tab role, selected-state, and focus behavior now owned by
  the primitive.

## Required deliverables

- `components/ui/tabs.tsx` with focused behavior tests.
- Migrated `components/common/TabBar.tsx` with compatible props or an approved
  atomic API transition.
- Expanded TabBar tests and representative page/layout E2E coverage.
- `artifacts/tab-consumer-classification.md` listing migrated ordinary consumers
  and retained domain-specific exclusions.

## Blockers and dependencies

- Blocked by: DS-0301 and approved ordinary-tab consumer classification.
- Blocks: DS-0309 and DS-0310.

## Acceptance criteria

- [ ] Every current TabBar consumer is classified before the shared behavior
      changes.
- [ ] Controlled selection and `onTabChange(tabId)` remain compatible.
- [ ] Arrow keys and Home/End move focus according to the approved orientation
      and activation contract.
- [ ] Icon-only tabs retain accurate accessible names and decorative icons.
- [ ] Horizontal scrolling and narrow-width access remain usable.
- [ ] Trigger/panel relationships are accurate where panels are available and
      are not fabricated where they are external.
- [ ] TerminalTabBar and EditorTabBar retain their domain-specific behavior and
      do not import generic Radix Tabs directly.
- [ ] Changed appearance uses semantic tokens and the existing tab visual
      direction in both modes.

## Verification tests

- Expand TabBar tests for pointer selection, controlled rerender, arrow keys,
  Home/End, focus, empty tabs, icons, test IDs, and overflow classes.
- Run representative API, Settings, Tasks, Activity, and WorkspaceLayout tests.
- Run terminal/editor tab suites unchanged as exclusion regressions.
- Use Playwright for real keyboard/focus/scroll behavior and light/dark visual
  review at narrow/wide widths.

## Out of scope

- Migrating TerminalTabBar, EditorTabBar, drag/reorder, close, dirty, or pane
  ownership behavior.
- Redesigning page tab information architecture.
- Forcing all consumers to render panels inside the common component.
