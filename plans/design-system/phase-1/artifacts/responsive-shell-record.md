# Phase 1 Responsive Shell Record

Implements [DS-0107](../07-responsive-shell.md).

Phase 0 measured a 512px-wide document at a 390px viewport. The header action
row was the cause. At sub-small widths the implementation now truncates the
workspace title, keeps Search, color-mode selection, Activity, and navigation
reachable, hides the non-action engine label, and presents Profile as an
accessible icon button. Desktop placement remains unchanged.

The shell no longer relies on page-wide horizontal-overflow clipping. Playwright
asserts document overflow is absent at 320px and 390px while exercising the
header actions and color-mode menu.
