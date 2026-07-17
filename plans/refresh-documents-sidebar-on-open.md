# Refresh Documents sidebar on open

## Assumptions

- “Refresh once” means one document-tree request for each closed → open transition.
- Both manual expansion and route-driven expansion (including navigating directly to a selected document) must refresh the tree.
- The initial render of an already-open Documents section should load the tree once, not trigger an additional request.
- Existing query invalidation after creating or editing documents must continue to work while the section is open.

## Todo

- [x] Update `DocumentsSidebarSection` so its document-tree query is active only while the sidebar and Documents section are expanded, and ensure reopening refetches even when the cached tree is still inside the global 30-second freshness window.
- [x] Add focused component tests proving manual reopening performs exactly one refresh and renders the refreshed tree.
- [x] Add a focused component test proving navigation from another page to a document URL auto-expands the section and performs exactly one refresh.
- [x] Run ESLint with fixes on the affected frontend files, then run the focused component test, frontend typecheck, and frontend test suite.

## Success criteria

- Opening the Documents dropdown manually fetches the latest global and private document trees once.
- Opening a document from another page auto-expands the dropdown and fetches the latest tree once.
- Closing the dropdown does not fetch the tree.
- Reopening within 30 seconds still refreshes instead of reusing the fresh cache without a request.
- Initial load on the Documents page does not issue a duplicate tree request.
- Existing folder expansion, selection, creation, and navigation behavior remains unchanged.
