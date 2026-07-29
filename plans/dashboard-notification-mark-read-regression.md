# Dashboard notification “Mark read” regression

## Assumptions

- “All notifications” means every kind in the shared `activityKindSchema`.
- Marking a notification as read archives only that activity through the existing activity archive mutation.
- Existing kind-specific actions remain unchanged; “Mark read” is an additional escape hatch for action-oriented notifications.
- Resolved activity cards remain read-only and do not show the control.

## Plan

1. Restore a consistently labelled `Mark read` action in every pending activity-kind action group.
   - Verify each current activity kind renders the control.
   - Verify clicking it calls the existing archive callback with that activity’s id.
2. Give activity cards a stable test id for end-to-end scoping.
   - Verify resolved cards remain action-free through existing regression coverage.
3. Add a dashboard Playwright test backed by the shared activity-kind list.
   - Serve one pending card for every activity kind.
   - Verify every card exposes `Mark read`.
   - Click each control and verify every activity is archived individually and removed from Unreads.
4. Run formatting/lint fixes, the design-system audit, frontend typechecking and unit tests, and the focused Chromium end-to-end test.

## Success criteria

- Every pending dashboard notification kind visibly offers `Mark read`.
- Each control archives its own notification.
- Existing notification-specific workflows still pass their tests.
- The Resolved tab remains read-only.
- All required verification commands pass.
