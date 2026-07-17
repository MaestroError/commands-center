# DS-0603 — Document Theme Authoring and Exception Workflows

- Status: Planned
- Phase: [Phase 6](README.md)
- Foundation reference:
  [Theme model](../../design-system-foundation.md#1-separate-theme-identity-from-color-mode)
- Upstream gate: DS-0601 documentation and enforcement contract

## Goal

Provide a verified runbook for adding or changing a CC theme without editing
component implementations, and for approving the rare visual exception without
silently bypassing the system.

## Context

The current product has one `Default` theme with light/dark values and a
light/dark/system preference. Future theme authors need to know which portable
theme declarations supply colors, shape, emphasis, and component roles, how
system resolution works, and how bridges consume the result. Exceptions such as
brand artwork, Crepe SVG format, ANSI, and syntax palettes need stable IDs.

## Scope

- Create `docs/design-system/themes.md` from the implemented registry/token/
  provider contract and portable workspace boundary.
- Document required light and dark semantic sets, shared shape/emphasis roles,
  registration, profile selection, header color-mode control, system reaction,
  fallback/migration, and verification.
- Prove the documented process does not require component implementation edits.
- Document third-party bridge consumption without exposing bridge internals as
  general component APIs.
- Create `docs/design-system/exceptions.md` with eligibility, required evidence,
  stable ID format, owner, exact path, theme behavior, verification, review, and
  retirement rules.
- Include the final Phase 5 exception register and distinguish brand, syntax,
  ANSI, third-party-format, and controlled product-semantic categories.

## Required deliverables

- `docs/design-system/themes.md` with an end-to-end add/change-theme checklist.
- `docs/design-system/exceptions.md` with request/review/retirement workflow and
  links to the live exception registry or enforcement configuration.
- A dry-run record showing which files a hypothetical second theme would touch,
  without actually adding that theme.
- Verified commands for theme, system-mode, gallery, bridge, and production
  exclusion checks.

## Blockers and dependencies

- Blocked by: DS-0601.
- Blocks: DS-0604, DS-0608, and DS-0609.

## Acceptance criteria

- [ ] Theme identity and color-mode preference are unmistakably separate.
- [ ] The runbook covers complete light/dark semantic values plus shared shape,
      typography/emphasis, focus, status, and component-role expectations.
- [ ] A hypothetical new theme requires only approved theme declarations,
      registration/metadata, and tests—not component implementation edits.
- [ ] `system` behavior and persistence source are documented without persisting
      resolved mode or bridge output as portable workspace state.
- [ ] Generic HTML, Markdown, Milkdown, Monaco, xterm, and file-manager coverage
      are included in theme verification.
- [ ] Exceptions require stable IDs and cannot be justified by count reduction,
      convenience, or vague third-party ownership.
- [ ] EX-001 through EX-005 and later approved exceptions have exact owners and
      live paths or are marked retired with evidence.
- [ ] No teal, second production theme, or speculative bridge is added.

## Verification tests

- Follow the runbook as a no-write dry run and list the exact files/checks for a
  hypothetical theme.
- Verify every documented token/registry/provider/bridge path exists.
- Run link/format checks and compare exception examples with final inventories.
- Review the runbook against the Portable Workspace Rule and production fixture
  exclusion contract.

## Out of scope

- Implementing another theme or redesigning `Default`.
- Changing appearance controls, persistence, or theme registry behavior.
- Approving new exceptions without implementation evidence.
