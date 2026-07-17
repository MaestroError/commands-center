# DS-0308 — Migrate `SearchableSelect` to the Approved Combobox Composition

- Status: Complete
- Phase: [Phase 3](README.md)
- Foundation reference:
  [React primitives](../../design-system-foundation.md#react-primitives)
- Adoption row: UI-004 in the
  [component adoption matrix](../phase-0/artifacts/component-adoption-matrix.md)

## Goal

Preserve the common `SearchableSelect` value/options API while replacing its
custom popup and active-option behavior with the approved CC-owned
Popover/Command combobox composition.

## Context

SearchableSelect currently handles filtering, highlighting, arrows, Enter,
Escape, blur, and selection itself. It is used by `SpecialistForm` and
`LiveRequestReviewForm`. The Phase 0 matrix approves a Shadcn-style Popover plus
Command composition, but the trigger/input focus model and any Command
dependency must be frozen in DS-0301 before implementation. Composer suggestion
popovers are explicitly excluded because they must retain textarea focus.

## Scope

- Add only the Popover and Command support primitives/dependency approved by
  DS-0301.
- Preserve `value`, `onChange`, `options`, `placeholder`, `disabled`,
  `className`, `ariaLabel`, option ID/label filtering, and selected-label
  behavior unless an approved API migration is unavoidable.
- Define and implement correct combobox/listbox semantics, active option,
  filtering, arrows, Enter, Escape, outside interaction, focus return, empty
  result, and controlled value updates.
- Keep domain option loading, business validation, and form state in existing
  consumers.
- Keep ModelSelector domain data/API and composer suggestion popovers outside
  this task.
- Remove custom keyboard/outside/listbox behavior only after equivalent public
  behavior is covered.

## Required deliverables

- Approved `components/ui/popover.tsx` and `components/ui/command.tsx` or the
  narrower DS-0301-authorized support files.
- Migrated `components/common/SearchableSelect.tsx` with stable public API.
- Expanded unit tests plus real-browser combobox interaction coverage.
- SpecialistForm and LiveRequestReviewForm integration coverage.
- `artifacts/searchable-select-migration-record.md` documenting dependency,
  focus-model, API, and excluded-surface decisions.

## Blockers and dependencies

- Blocked by: DS-0301, approved focus model, and approved Command dependency.
- Blocks: DS-0309 and DS-0310.

## Acceptance criteria

- [x] Public value/options/onChange behavior remains compatible.
- [x] The selected label is shown when closed and filtering matches both label
      and ID as before.
- [x] Combobox, popup, listbox, and active-option semantics are accurate and
      screen-reader names are stable.
- [x] Arrow keys, Enter, Escape, pointer selection, outside interaction, and
      focus return follow the approved behavior exactly once per interaction.
- [x] Empty results and disabled state are visible, semantic, and tested.
- [x] Controlled value/options changes do not leave stale query/highlight state.
- [x] Popover collision and narrow-width behavior keep the control within the
      viewport.
- [x] Radix imports remain in `components/ui`; filtering/domain state remains in
      the common composition or consumer as approved.
- [x] Composer suggestions and ModelSelector are not silently migrated.

## Verification tests

- Expand focused tests for filtering, label/ID match, controlled updates,
  pointer/keyboard selection, active option, Escape, outside click, blur/focus,
  empty results, and disabled state.
- Use Playwright for actual portal, focus, collision, scroll, and keyboard
  behavior at desktop and narrow widths.
- Run SpecialistForm and LiveRequestReviewForm tests/E2E flows.
- Review Default light/dark gallery states and application baselines twice.

## Out of scope

- ModelSelector data/provider behavior.
- Composer file/slash/specialist suggestion popovers.
- Async fetching, multi-select, free-form values, or a generic form framework.
