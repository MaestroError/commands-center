# PR #184 Copilot read-state label maintenance

## Goal

Keep every activity action disabled while the shared read-state scope is busy, but show per-card progress text only for the activity whose own mutation is pending.

## Changes

1. Separate the shared/per-archive disabled state from the matching unarchive progress state in `ActivityFeed`.
2. Make the resolved action honor either disabled input while keeping its `Marking...` label keyed to matching unarchive progress.
3. Update the panel regression to prove an archiving activity moved into Resolved remains disabled without being labeled as an unarchive operation.

## Verification

- Run the focused activity panel and feed tests.
- Run frontend ESLint with fixes, Prettier, frontend typecheck, and the full frontend test suite.
- Run workspace typecheck, lint, format, Knip, design-system audit, and whitespace checks before push.
