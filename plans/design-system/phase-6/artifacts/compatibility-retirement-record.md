# Compatibility Retirement Record

## Removed

- `.cc-nav-item`: zero production, test, fixture, documentation, and dynamic
  consumers before removal. `.cc-nav-item-active` remains independent and live.
- `cc-button-primary`: five class tokens removed from Claim, Login, Profile,
  AppShell, and TerminalTabsSurface. No CSS definition existed; `cc-button`
  already provides the complete primary appearance.

The audit rejects either retired name in source or CSS.

## Retained

`cc-panel`, button secondary/danger/icon, input/password, alert/success,
badge/status, active navigation, tab, empty-state, eyebrow, logo, and protected
Markdown families all have live consumers recorded in
`compatibility-disposition.md`. DS004 records a per-class maximum so counts
cannot grow.

## Blocked

No live family was removed merely to reduce counts. Remaining retirement needs
normal consumer migration in the owning domain; Phase 6 does not force that
refactor. `.cc-md` and `.cc-md--chat` are protected contracts and are not
retirement candidates.
