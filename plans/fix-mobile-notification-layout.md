# Fix Mobile Notification Layout

## Assumptions

- Notification popovers should fit within the mobile viewport even when opened from the header bell.
- Notification titles should wrap normally instead of forcing horizontal overflow.
- The accept action can be shortened to `Accept`; the done transition is already implied by the action behavior.

## Tasks

- [x] Clamp the notification popover width/position on small screens.
- [x] Make notification title/time layout wrap without overflowing.
- [x] Rename the task outcome accept button to `Accept`.
- [x] Update tests for the new button label and mobile-safe classes.
- [x] Run `eslint --fix`, relevant tests, commit, and push to the existing PR branch.
