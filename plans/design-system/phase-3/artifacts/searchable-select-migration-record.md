# SearchableSelect migration record

## Decision

`SearchableSelect` now uses a CC-owned Popover plus Command composition. Radix
owns portal placement, collision handling, outside dismissal, and Escape.
`cmdk` owns filtering, active-option state, Arrow navigation, and Enter
selection. The only new dependency is `cmdk`, as authorized by DS-0301.

## Focus model

The input remains focused while the popup opens and while keyboard navigation
changes the active option. Opening auto-focus is suppressed. Selecting an item
closes the popup and returns focus to the input. Outside interaction dismisses
the popup without stealing focus from the outside target.

## Compatibility

The `value`, `onChange`, `options`, `placeholder`, `disabled`, `className`, and
`ariaLabel` API is unchanged. Closed controls show the current option label;
filtering matches both option label and ID. Controlled option/value changes are
read on every render and closing clears the transient query.

## Ownership and exclusions

Popover and Command mechanics live in `components/ui`. The common composition
owns the query-to-option behavior, while consumers continue to own their domain
options and form state. ModelSelector, GlobalSearchPalette, and composer
suggestion popovers were not migrated.
