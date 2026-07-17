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
| Raw palette matches (strict pattern)      |       72 |  **68** | 0 outside registered category/brand/Phase-5 exceptions |
| Files with raw palette                    |       23 |  **22** | only exception-bearing files                           |
| TSX files with inline `<svg>`             |       16 |      16 | EX-001/002/003 + Phase 5 only                          |
| Direct Radix/`cmdk` imports outside `ui/` |        0 |       0 | 0 (hard invariant, ESLint-enforced)                    |
| `lucide-react` importers                  |       53 |      53 | informational (expected to rise as glyphs migrate)     |

## Applied reductions

| Batch   | File                            | Palette Δ | Detail                                                                                                |
| ------- | ------------------------------- | --------: | ----------------------------------------------------------------------------------------------------- |
| DS-0402 | `components/shell/AppShell.tsx` |    −4 → 0 | `amber-*`/`emerald-500` status dots + active-runs pill → `success`/`warning`/`danger` semantic tokens |

## Guardrails

- No count may be reduced by hiding values in arbitrary CSS, inventing vague
  tokens, or replacing an accessible component with an untested abstraction.
- Category/product-semantic color maps (`task-helpers.ts`,
  `integration-helpers.ts`) are excluded from the raw-palette target until their
  owning task classifies product meaning; they are tracked separately, not
  silently tokenized.
