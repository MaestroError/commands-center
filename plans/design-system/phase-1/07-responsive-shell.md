# DS-0107 — Correct Narrow Shell Overflow

- Status: Complete
- Phase: [Phase 1](README.md)
- Foundation reference:
  [Phase 1 responsive scope](../../design-system-foundation.md#phase-1--normalize-foundations-without-redesigning-screens)
- Evidence:
  [Application baseline manifest](../phase-0/artifacts/application-visual-baseline-manifest.md)

## Goal

Remove the pre-existing horizontal overflow in the authenticated application
shell at the approved 390px viewport without redesigning desktop navigation.

## Context

Phase 0 measured a 512px document width at a 390px viewport. The header action
row, including Search, Activity, Profile, and the appearance control, is the
known offender. This is intentionally separate from semantic base styles so the
cause and visual tradeoffs remain reviewable.

## Scope

- Reproduce and isolate every shell element contributing to the 512px width.
- Define a narrow-header behavior for navigation actions and the new color-mode
  control while preserving access to every action.
- Keep desktop placement and interaction stable unless an explicit responsive
  change is required.
- Verify focus order, accessible names, touch targets, menus, and overlays after
  the layout correction.
- Add a permanent page-level no-horizontal-overflow assertion.

## Required deliverables

- The smallest shell/header layout change that removes measured overflow while
  retaining every action.
- Responsive interaction and bounding-box tests at 320px, 390px, and desktop.
- Updated application containment assertions and an implementation note recording
  the chosen narrow-header behavior.

## Blockers and dependencies

- Blocked by: DS-0101 so the final header control is present.
- Blocks: DS-0108.
- May proceed independently of DS-0102 through DS-0106.

## Acceptance criteria

- [ ] At 390px, document and application-shell `scrollWidth` do not exceed their
      `clientWidth`.
- [ ] Search, Activity, Profile, and color-mode selection remain reachable by
      pointer and keyboard.
- [ ] No action is hidden without an accessible replacement.
- [ ] Menus and overlays remain inside the viewport and are not clipped by the
      shell.
- [ ] Focus order follows the visual order at narrow and desktop widths.
- [ ] Desktop application baseline has no unexplained visual change.
- [ ] The correction does not use page-wide `overflow-x: hidden` to conceal the
      defect.

## Verification tests

- Add Playwright assertions at 320px, 390px, and the existing desktop viewport.
- Exercise every header action and color-mode choice at 390px using keyboard
  and pointer interaction.
- Assert light/dark narrow and desktop shell containment and reachability.
- Test menu/overlay bounding boxes against the viewport.
- Run affected shell unit tests and two no-update application visual runs.

## Out of scope

- Redesigning desktop navigation or information architecture.
- Semantic-content overflow, which DS-0106 owns.
- Replacing shell controls with Phase 2 primitives.
