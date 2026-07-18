# UI Consistency Follow-ups

- Status: Complete
- Trigger: DSM-002 visual review on 2026-07-18
- Related task: [DSM-002 Button and Input Adoption](02-button-input-adoption.md)
- Decision artifact: [Select decision matrix](artifacts/select-decision-matrix.md)
- Foundation: [CC Design System Foundation](../design-system-foundation.md)

## Goal

Resolve the visual-review findings without changing product behavior: make
accent-filled foregrounds consistent, reduce danger intensity on large failed
task cards, and replace browser-native selects with the appropriate existing
searchable composition or a CC-owned Radix Select primitive.

## Tasks

1. Inventory the affected semantic colors and all 14 remaining native select
   consumers; classify each select as searchable/dynamic or short/fixed.
2. Replace undefined or raw foreground colors on accent-filled controls with
   `text-on-accent`, and add audit coverage against regression.
3. Add a Default-theme `danger-surface-subtle` role and use it for failed task
   cards while retaining strong danger treatment for destructive actions,
   badges, and compact status text.
4. Extend `SearchableSelect` only with the required form semantics, then migrate
   specialist, timezone, and other dynamic/search-worthy consumers.
5. Add the smallest copy-owned Radix Select API, migrate every short fixed
   native select, and cover it in the design-system gallery and focused tests.
6. Remove the completed select handoffs from the audit, update canonical
   component guidance and maintenance artifacts, then run full verification.

## Acceptance criteria

- [x] Every solid accent control uses the theme-owned on-accent foreground in
      both Default modes; no undefined `accent-contrast` role or raw white
      foreground remains on an accent fill.
- [x] Failed task cards use the theme-controlled subtle danger surface in light
      and dark mode while preserving status, actions, layout, and drag behavior.
- [x] Dynamic or potentially long option sets use `SearchableSelect`; short
      fixed enumerations use the CC-owned Radix Select primitive.
- [x] No production or gallery native `<select>` remains, and the audit rejects
      reintroduction with guidance to choose the appropriate CC component.
- [x] Required, disabled, selected-value, callback, test-ID, keyboard, focus,
      dismissal, and form-submit behavior is preserved.
- [x] Radix imports remain inside `components/ui`, styling uses semantic theme
      roles, and protected Markdown/Milkdown styling is untouched.
- [x] Focused tests, full tests, linting, typecheck, Knip, production build,
      design-system audit, two consecutive design-system E2E passes, and full
      E2E all pass.

## Verification

- Test `SearchableSelect` required/disabled selection behavior and the Select
  primitive's keyboard selection, dismissal, focus return, and form value.
- Exercise task and template specialist selection plus representative fixed
  selectors through component/E2E coverage.
- Verify Tasks Board accent foreground and failed-card surface in Default light
  and dark, including narrow viewport containment.
- Run `pnpm exec eslint . --fix`, `pnpm lint`, `pnpm lint:root`,
  `pnpm typecheck`, `pnpm test`, `pnpm format`, `pnpm knip`, `pnpm build`,
  `pnpm design-system:audit`, the design-system Playwright selection twice, and
  `pnpm test:e2e`.

## Completion evidence

- Repository lint, root lint, formatting, typecheck, Knip, production build,
  diff checks, and the 23-case design-system audit passed.
- Unit and component suites passed: backend 1,252 tests, frontend 1,435 tests,
  and shared 205 tests.
- The design-system Playwright selection passed twice with 44 Chromium tests
  and 44 intentional mobile skips per run; full E2E passed with 154 tests and
  44 intentional skips.
- Browser inspection confirmed the fixed Select's option selection and focus
  return, plus theme-owned dark-mode colors for accent controls and fields.
