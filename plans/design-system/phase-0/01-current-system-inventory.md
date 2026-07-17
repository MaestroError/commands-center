# DS-0001 — Inventory the Current Design System

- Status: Complete
- Phase: [Phase 0](README.md)
- Foundation reference:
  [Phase 0 inventory](../../design-system-foundation.md#phase-0--inventory-and-freeze-the-contract)

## Goal

Produce one traceable inventory of the styling and component mechanisms already
used by CC, without deciding their replacements yet.

## Context

CC already has three themes, Tailwind v4 mappings, `cc-*` compatibility classes,
common and domain React components, read-only Markdown styles, Milkdown and
other third-party theme bridges, raw palette utilities, and hardcoded visual
values. The generated design project is inspiration only and must not be used as
inventory evidence or as a source of truth.

This inventory is required before component classification, baseline selection,
or semantic-element rollout analysis can be reliable.

## Scope

Inventory the current frontend for:

- CSS custom properties for `light`, `dark`, and `modern` themes.
- Tailwind v4 `@theme` mappings and any theme values that are not mapped.
- Current theme state, persistence, DOM application, browser `color-scheme`,
  header selection, and Profile selection flows.
- `cc-*` classes, selectors, variants, and their call sites.
- Domain-neutral components under `components/common/` and equivalent repeated
  patterns elsewhere.
- Custom dialogs, menus, popovers, comboboxes, tabs, switches, checkboxes, and
  other interactive patterns.
- Raw Tailwind palette utilities, hardcoded color values, inline style colors,
  gradients, shadows, and focus treatments.
- Inline SVGs and Lucide usage.
- Scoped theme bridges and fixed themes for Milkdown, Monaco, xterm, SVAR, and
  assistant-ui surfaces.
- Existing unit, integration, and E2E coverage associated with each repeated
  component or styling contract.

## Required deliverables

Create `artifacts/current-system-inventory.md` with:

1. A token table containing token name, semantic purpose, theme values,
   Tailwind mapping, and current consumers.
2. A `cc-*` class table containing selectors, variants, consumers, and existing
   tests.
3. A component-pattern table containing implementation locations, call sites,
   interaction responsibilities, and test coverage.
4. A hardcoded-style table grouped into theme-dependent candidates and
   potentially intentional exceptions.
5. An icon table distinguishing Lucide, inline SVG, third-party-owned icons, and
   generated strings required by external APIs.
6. A third-party bridge table showing the source theme API, current CC mapping,
   fixed values, and theme-switch behavior.
7. The exact search commands used and match counts so the inventory can be
   reproduced.
8. A current appearance-state flow showing how stored values reach Zustand,
   ThemeProvider, DOM attributes, header controls, and Profile controls.

Do not classify items as migrate or retire in this task. Record evidence and
possible concerns only.

## Blockers and dependencies

- Blocked by: None.
- Blocks: DS-0002.

## Acceptance criteria

- [x] All three `data-theme` blocks and the Tailwind `@theme` mappings are
      represented.
- [x] Current storage, state, DOM, browser color-scheme, header, and Profile
      responsibilities are traceable end to end.
- [x] Every selector beginning with `cc-` has an inventory row or is grouped
      under a clearly bounded selector family.
- [x] Every repeated interactive pattern has implementation and consumer links.
- [x] Every raw palette utility and hardcoded color match is accounted for as a
      candidate or possible exception without silently deciding its future.
- [x] Inline SVG and Lucide usage are separately countable.
- [x] Milkdown, Monaco, xterm, SVAR, and assistant-ui theming are represented,
      including fixed-theme gaps.
- [x] Existing relevant tests are linked; missing coverage is identified.
- [x] Every table entry links to a real repository file or selector.
- [x] The generated design project is not cited as current CC implementation
      evidence.

## Verification tests

### Reproducibility checks

Run the recorded searches again and compare their match counts with the
inventory. At minimum, searches must cover:

```bash
rg -n --glob '*.{css,ts,tsx}' 'data-theme|@theme|--[a-zA-Z0-9-]+:' packages/frontend/src
rg -n --glob '*.{css,ts,tsx}' 'cc-[a-zA-Z0-9_-]+' packages/frontend/src
rg -n --glob '*.{css,ts,tsx}' '(slate|gray|zinc|red|orange|amber|yellow|green|emerald|teal|cyan|blue|indigo|violet|purple|pink|rose)-[0-9]+' packages/frontend/src
rg -n --glob '*.{css,ts,tsx}' '#[0-9a-fA-F]{3,8}|rgb\(|hsl\(' packages/frontend/src
rg -n --glob '*.tsx' '<svg|lucide-react' packages/frontend/src
rg -n --glob '*.tsx' 'role="(dialog|menu|listbox|tablist|switch)"|aria-modal|<select|type="checkbox"' packages/frontend/src
```

### Document checks

```bash
pnpm exec prettier --check plans/design-system/phase-0/artifacts/current-system-inventory.md
```

Manually sample at least five entries from each table and confirm that their
links, selector names, consumers, and test references match the current code.

## Out of scope

- Changing production CSS, components, dependencies, or themes.
- Deciding which Shadcn/Radix components to adopt.
- Creating new semantic tokens.
- Correcting unrelated lint or styling issues found during the inventory.
