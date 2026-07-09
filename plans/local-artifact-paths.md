# Local artifact paths

## Goal

Fix chat result artifacts that are created inside a specialist workspace but are opened and shared as if their paths were global workspace paths.

## Steps

1. Enrich file artifacts with a `fileManagerPath` that points at the owning specialist workspace.
2. Resolve file artifact snapshots from the owning specialist workspace first, with global workspace fallback for older artifacts.
3. Use `fileManagerPath` when opening file artifacts from result cards.
4. Show share-link creation errors in the card instead of failing silently.
5. Add regression tests for specialist-local paths and visible share failures.
