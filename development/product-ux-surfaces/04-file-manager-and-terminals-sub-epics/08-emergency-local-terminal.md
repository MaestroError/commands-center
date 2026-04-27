# U4.X Emergency Local Terminal

## Goal

Define a separate future enhancement for local-machine terminal access that is intentionally outside the main OpenCode-backed terminal workflow.

## Why This Is Separate

- Local shell access has a different runtime model than OpenCode PTY sessions.
- It depends on native PTY process management and host-machine compatibility.
- It has a different safety profile because it exposes direct machine-level command execution.
- It should not complicate or destabilize the main operator terminal experience.

## Proposed Outcome

- Provide a dedicated advanced/admin screen for emergency local shell access.
- Keep it clearly labeled as machine-local and operational, not agent/workspace-native.
- Gate it behind explicit UX affordances and warning language.

## Suggested Scope

- Separate route and page for local terminal access
- Independent backend service abstraction if needed
- Clear warnings about host-level execution and portability limits
- Explicit availability checks and degraded-state messaging
- No tab-level mixing with OpenCode PTY sessions in the main terminal page

## Out of Scope

- Main global terminal page backend switching
- Automatic fallback from OpenCode PTY to local shell
- Agent-scoped direct local shell execution

## Acceptance Criteria

- The feature exists as an explicitly separate surface from the main terminal page.
- The user can distinguish OpenCode PTY sessions from local-machine shell access before opening it.
- Failure of the local terminal runtime does not degrade the main terminal experience.
- Documentation clearly describes why this feature is operational/emergency-only.

## Dependencies

- Revisit after the OpenCode-backed terminal experience is stable and polished.

## Reference

- Parent epic: `development/product-ux-surfaces/04-file-manager-and-terminals.md`
- Main terminal epic: `development/product-ux-surfaces/04-file-manager-and-terminals-sub-epics/03-terminal-surfaces.md`
