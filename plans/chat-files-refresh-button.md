# Chat Files refresh button

## Assumptions

- The refresh action belongs immediately before the root-level create-folder action in the chat Files tab.
- A manual refresh should reuse the existing tree refresh routine so expanded folders remain expanded and concurrent requests remain coalesced.
- The existing automatic workspace-change subscription remains enabled; the button is a deterministic fallback when filesystem or SSE events are delayed, missed, or disconnected.

## Todo

- [x] Add a theme-aware, accessible refresh icon button before the create-folder button in `WorkspaceFilesTab`.
- [x] Show refresh progress and prevent duplicate manual clicks while the existing refresh routine is running.
- [x] Add a focused component test proving the button fetches and renders the latest visible tree.
- [x] Run ESLint with fixes, the focused workspace-files tests, frontend typecheck, and the full frontend test suite.

## Success criteria

- The chat Files panel shows a refresh button immediately before the create-folder button.
- Clicking refresh reloads the root and currently expanded directories without reloading the page.
- The refresh button uses existing theme classes, exposes an accessible label/title, and indicates an in-progress refresh.
- Automatic filesystem-event refresh remains unchanged.
