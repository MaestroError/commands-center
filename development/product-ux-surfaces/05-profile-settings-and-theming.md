# U5 Profile, Settings, and Theming

## Outcome

The user can configure their profile (display name, timezone), select and persist a visual theme, view app version and update status, and trigger updates from the settings screen.

## Why this is a separate PR

These are standalone screens with distinct data persistence requirements. Theme persistence and the user-facing theme picker live here, while the underlying token system and theme provider are delivered by U0.

## Blockers

- U0 Frontend Foundation
- E3 API and Realtime Foundation
- C1 Database and Workspace Foundation

## Unblocks

- No hard blockers. Theme persistence and profile data benefit all screens once merged.

## Scope

- Build Profile screen: display name input, timezone selector, theme picker with live preview
- Build Settings screen: current app version display, installation mode, update availability status, update action button or Docker guidance text
- Persist user preferences (display name, timezone, selected theme) inside the workspace as part of the settings table
- Ensure theme selection survives app restarts, workspace moves, and fresh conversation resets
- Ensure both screens are responsive on mobile viewports

## Acceptance Criteria

- Behavior matches `design/screens/profile/acceptance_criteria.md` and `design/screens/settings/acceptance_criteria.md`
- Theme picker allows selecting between Light, Dark, and Modern themes using the token system from U0
- Selected theme persists across app restarts and workspace moves per the Portable Workspace Rule
- The settings screen shows current app version and whether an update is available
- The settings screen provides the appropriate update action or guidance based on installation mode
- User preferences persist across app restarts and workspace moves
- Profile and settings layouts adapt correctly to mobile viewports

## Non-Goals

- Semantic design token definitions or theme provider (owned by U0)
- Self-updating execution logic (owned by E4)
- Group chat or Phase 2 features
