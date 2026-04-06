# U5 Profile, Settings, and Theming

## Outcome

The user can configure their profile (display name, timezone), select a visual theme, view app version and update status, and trigger updates from the settings screen.

## Why this is a separate PR

These are standalone screens with distinct data persistence requirements. The semantic design token infrastructure established here is consumed by every other screen for consistent theming.

## Blockers

- E3 API and Realtime Foundation
- C1 Database and Workspace Foundation

## Unblocks

- No hard blockers. Theme infrastructure benefits all screens once merged.

## Scope

- Implement semantic design token system with three built-in themes: Light (default), Dark, Modern
- Build theme provider and CSS custom property architecture using Tailwind CSS v4 `@theme {}` blocks
- Define all semantic tokens: app background, surface, elevated surface, sidebar background, border, primary and secondary text, accent, selection, focus ring, success, warning, danger, info, chat user and agent bubbles, terminal background and foreground
- Build Profile screen: display name input, timezone selector, theme picker with live preview
- Build Settings screen: current app version display, installation mode, update availability status, update action button or Docker guidance text
- Persist user preferences (display name, timezone, theme) inside the workspace as part of the settings table
- Ensure theme selection survives app restarts, workspace moves, and fresh conversation resets
- Ensure both screens are responsive on mobile viewports

## Acceptance Criteria

- Behavior matches `design/screens/profile/acceptance_criteria.md` and `design/screens/settings/acceptance_criteria.md`
- Theme changes apply immediately across the entire application without page reload
- Three themes (Light, Dark, Modern) render correctly using semantic design tokens from `design/themes.md`
- The settings screen shows current app version and whether an update is available
- The settings screen provides the appropriate update action or guidance based on installation mode
- User preferences persist across app restarts and workspace moves per the Portable Workspace Rule
- Profile and settings layouts adapt correctly to mobile viewports

## Non-Goals

- Self-updating execution logic (owned by E4)
- Group chat or Phase 2 features
