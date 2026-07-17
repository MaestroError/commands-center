# Switch Migration Record

- Task: [DS-0306](../06-switch.md)
- Status: Complete

The common `Switch` keeps its controlled `checked`, `onChange`, `label`, and
`aria-label` contract. Optional `disabled` support is additive. The adapter now
composes the CC-owned Radix Switch primitive; Radix owns role, checked state,
Space/Enter activation, disabled behavior, and state data attributes.

The previous raw `emerald-500`, `white`, and `muted` appearance was removed.
Track, thumb, focus, checked, unchecked, and disabled states now use CC semantic
tokens. `SpecialistForm` remains the production state owner and needs no API or
business-logic change.
