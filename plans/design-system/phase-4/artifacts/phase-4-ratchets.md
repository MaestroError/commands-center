# Phase 4 Ratchets (DS-0401)

- Task: [DS-0401](../01-phase-3-handoff.md)
- Phase: [Phase 4](../README.md)
- Inventory: [live-migration-inventory.md](live-migration-inventory.md)

Ratchet rule: these counts may only **decrease** during Phase 4. Any increase
requires an approved exception update recorded here. Counts are from
`packages/frontend/src`, excluding `.test.` files.

## Baselines (DS-0401 entry, commit `08e83c7`)

| Metric                                    | Baseline | Current | Target end-state                                       |
| ----------------------------------------- | -------: | ------: | ------------------------------------------------------ |
| Raw palette occurrences (strict pattern)  |      178 |   **0** | 0 outside registered category/brand/Phase-5 exceptions |
| Files with raw palette                    |       23 |   **0** | only exception-bearing files                           |
| TSX files with inline `<svg>`             |       16 |       3 | EX-001/002/003 only                                    |
| Direct Radix/`cmdk` imports outside `ui/` |        0 |       0 | 0 (hard invariant, ESLint-enforced)                    |
| Hardcoded color occurrences               |      136 |     136 | theme definitions + registered Phase 5 bridge only     |
| `cc-*` occurrences                        |      776 |     778 | classified compatibility classes and nonvisual keys    |
| `lucide-react` importers                  |       53 |      66 | informational (expected to rise as glyphs migrate)     |

## Applied reductions

| Batch   | File                             | Palette Δ | Detail                                                                                                |
| ------- | -------------------------------- | --------: | ----------------------------------------------------------------------------------------------------- |
| DS-0402 | `components/shell/AppShell.tsx`  |    −7 → 0 | `amber-*`/`emerald-500` status dots + active-runs pill → `success`/`warning`/`danger` semantic tokens |
| DS-0402 | `components/shell/ThemeMenu.tsx` |         0 | Interaction migration to `ui/dropdown-menu`; already used semantic tokens (no palette Δ)              |

New `components/ui/` primitive this batch: `dropdown-menu.tsx` (Radix
DropdownMenu; concrete consumer `ThemeMenu`). Direct Radix files outside `ui/`
remain 0.

The two `cc-*` increases are development-only primitive-gallery `cc-panel`
wrappers added with the concrete DropdownMenu and Checkbox consumers. They are
approved fixture composition, not new compatibility APIs or production
consumers.

## Guardrails

- No count may be reduced by hiding values in arbitrary CSS, inventing vague
  tokens, or replacing an accessible component with an untested abstraction.
- Category/product-semantic color maps (`task-helpers.ts`,
  `integration-helpers.ts`) remain in the entry count and must be classified by
  their owning task; no search exclusions or line-count shortcuts are allowed.

Counts are occurrences, not matching lines. The reproduction expression is the
color-name pattern in the live inventory, run with `rg -o`; this prevents a
consumer from evading the ratchet by adding another raw class to an existing line.
