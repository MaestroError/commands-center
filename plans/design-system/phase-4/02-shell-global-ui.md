# DS-0402 — Migrate Shell and Global Interaction Surfaces

- Status: Planned
- Phase: [Phase 4](README.md)
- Foundation reference:
  [Tailwind and primitive ownership](../../design-system-foundation.md#1-keep-four-distinct-layers)
- Adoption rows: UI-011 through UI-013 and UI-020 in the
  [component adoption matrix](../phase-0/artifacts/component-adoption-matrix.md)

## Goal

Move the global shell's repeated actions, menus, tooltips, overlays, statuses,
and equivalent UI glyphs onto approved CC primitives while preserving
navigation, shortcuts, responsive behavior, and appearance ownership.

## Context

The shell frames every domain and includes navigation, color-mode selection,
search, activity, profile, engine status, responsive icon actions, and global
overlay entry points. `ThemeMenu` is approved for DropdownMenu/RadioGroup
behavior; global search and file navigation are audit-first because they carry
selection and shortcut behavior.

## Scope

- Use the DS-0401 file/flow list for AppShell, navigation/layout shell,
  ThemeMenu, Activity controls, global search, and global icon actions.
- Migrate ordinary menu/radio behavior through approved CC DropdownMenu APIs.
- Add Tooltip only for concrete icon controls that lack a sufficient visible or
  accessible description.
- Compose existing Button/Dialog/common APIs for actions and overlays when their
  behavior matches; retain domain logic outside primitives.
- Replace equivalent inline UI SVGs with Lucide; retain AppLogo under EX-001.
- Replace theme-dependent raw palette/status classes with existing semantic
  roles or narrowly approved tokens.
- Preserve Phase 1 narrow-header layout, focus order, shortcuts, outside/Escape
  behavior, and color-mode persistence.

## Required deliverables

- Migrated shell/global files listed by DS-0401 with focused tests.
- Any approved DropdownMenu/RadioGroup/Tooltip support primitives with concrete
  shell consumers and gallery coverage.
- Real-browser coverage for keyboard menus, global shortcuts, focus return,
  responsive actions, and overlay bounds.
- `artifacts/shell-global-migration-record.md` with files, API changes, palette/
  icon deltas, exceptions, and remaining audit-first surfaces.

## Blockers and dependencies

- Blocked by: DS-0401 and required Phase 3 APIs.
- Blocks: DS-0410, DS-0411, and DS-0412.

## Acceptance criteria

- [ ] Every migrated shell behavior uses CC-owned primitives/common APIs; Radix
      imports remain inside `components/ui`.
- [ ] Light/Dark/System selection, selected preference, live System behavior,
      persistence, and accessible naming remain unchanged.
- [ ] Menu arrows/typeahead/Escape/outside interaction and focus return follow
      the approved contract.
- [ ] Search, Activity, Profile, appearance, and navigation remain reachable at
      320px, 390px, and desktop widths.
- [ ] Global shortcuts and search/navigation selection behavior remain intact.
- [ ] AppLogo remains EX-001 and equivalent non-brand UI glyphs use Lucide.
- [ ] Status/focus/hover/disabled states use semantic tokens in both modes.
- [ ] No shell information architecture or routing redesign is introduced.

## Verification tests

- Run ThemeMenu, AppShell, navigation, activity, and global-search focused tests.
- Use Playwright for menus, shortcuts, portal/focus return, narrow overflow, and
  every header action by keyboard and pointer.
- Capture light/dark shell states at 320px, 390px, and desktop.
- Re-run application and protected-content baselines twice.

## Out of scope

- Replacing AppLogo or provider branding.
- Refactoring search data, activity APIs, routing, or appearance persistence.
- Migrating domain file pickers whose behavior does not match the approved
  global overlay contract.
