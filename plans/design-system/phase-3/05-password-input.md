# DS-0305 — Consolidate `PasswordInput` and Field Primitives

- Status: Complete
- Phase: [Phase 3](README.md)
- Foundation reference:
  [React primitives](../../design-system-foundation.md#react-primitives)
- Adoption rows: UI-001 and UI-002 in the
  [component adoption matrix](../phase-0/artifacts/component-adoption-matrix.md)

## Goal

Preserve `PasswordInput` as a common composition while moving its native field
and icon-action appearance onto approved Input and Button/IconButton primitives.

## Context

`PasswordInput` correctly owns visibility state and Lucide eye icons, but it
assembles `cc-input`, padding, focus, hover, and icon-button behavior itself.
It is used in claim, login, profile, provider, integration, and settings flows.
Field form semantics, autocomplete, refs, names, validation, and native events
must remain intact.

## Scope

- Add the native Input support primitive and any minimal concrete Button icon
  extension authorized by DS-0301.
- Keep `PasswordInput` in `components/common` and preserve its current native
  input prop surface.
- Compose visibility toggle behavior from the approved primitives.
- Retain Lucide `Eye`/`EyeOff`, accessible Show/Hide labels, and password/text
  type switching.
- Add ref forwarding if DS-0301 confirms current consumers need it; do not
  silently change the public type otherwise.
- Preserve consumer-supplied `className`, autocomplete, disabled, required,
  aria, form, and event props.
- Remove only field/toggle visual-state duplication made obsolete by primitives.

## Required deliverables

- Approved Input and concrete icon-action primitive/API changes with tests.
- Migrated `PasswordInput.tsx` and expanded focused tests.
- Representative auth/profile/provider form checks in both resolved modes.
- Gallery states for default, filled, disabled, invalid/focus review, hidden,
  and visible password modes.

## Blockers and dependencies

- Blocked by: DS-0301 and actual Phase 2 Button API review.
- Blocks: DS-0309 and DS-0310.

## Acceptance criteria

- [ ] Existing PasswordInput consumers compile without business-logic changes.
- [ ] Native input props and form behavior pass through correctly.
- [ ] Visibility toggles without changing the value, selection, focus ownership,
      autocomplete, or form submission.
- [ ] Toggle labels accurately announce Show/Hide state and Lucide icons remain
      decorative.
- [ ] Disabled and invalid/focus-visible states use semantic CC tokens in both
      modes.
- [ ] Input and icon-action APIs remain bounded to demonstrated current needs.
- [ ] No field-label, validation-message, or generic form framework is invented.
- [ ] Existing `cc-input` consumers remain supported for Phase 4 migration.

## Verification tests

- Use Testing Library/user-event for visibility, focus, value preservation,
  disabled behavior, labels, native props, and form submission.
- Run focused Claim/Login/Profile/Settings/provider tests.
- Review gallery states with keyboard in Default light/dark.
- Run application baselines twice for unexplained field/action changes.

## Out of scope

- Migrating all text inputs and textareas.
- Introducing a form library or universal Field abstraction.
- Changing password validation, authentication, or persistence behavior.
