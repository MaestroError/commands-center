# DS-0003 — Classify Components and Approve Shadcn/Radix Adoption

- Status: Complete
- Phase: [Phase 0](README.md)
- Foundation references:
  [React primitives](../../design-system-foundation.md#react-primitives) and
  [component hierarchy](../../design-system-foundation.md#5-reuse-the-existing-component-hierarchy)

## Goal

Approve an exact, evidence-based disposition for every current reusable control
and repeated interaction pattern before Shadcn or Radix is installed.

## Context

CC will use copy-owned Shadcn component implementations configured explicitly
with the Radix base. Radix supplies complex behavior and accessibility; CC owns
the public API, Tailwind classes, theme tokens, and visual contract.

Application pages, common compositions, and domain components must consume
CC-owned primitives from `@/components/ui/*`. Direct Radix imports belong inside
`components/ui/` unless a reviewed matrix entry documents why a domain-specific
exception is necessary.

Shadcn/Radix is not automatically the correct answer for every control. Native
HTML, existing CC components, and domain-specific behavior remain valid when
they are simpler or more appropriate.

## Scope

Use the DS-0001 inventory and approved DS-0002 appearance contract to evaluate:

- Buttons, icon buttons, inputs, textareas, field messaging, badges, statuses,
  cards, surfaces, and alerts.
- Dialogs, destructive confirmations, dropdown menus, tooltips, popovers,
  selects, comboboxes, tabs, switches, checkboxes, and radio groups.
- Composer mention popovers, global search, file pickers, image lightboxes,
  terminal/editor tab bars, and other behavior-rich domain surfaces.
- Existing `components/common/` APIs and duplicated implementations embedded in
  pages or domain folders.

Do not evaluate semantic HTML typography, Markdown rendering, Milkdown internals,
page layout, or third-party component internals as Shadcn candidates.

## Required deliverables

Create `artifacts/component-adoption-matrix.md` with one row per current pattern
or bounded component family. Each row must include:

- Stable matrix ID.
- Component/pattern name and all known implementation locations.
- Concrete consumers and usage count.
- Required semantics, focus behavior, keyboard behavior, portal/layering needs,
  state model, and domain-specific behavior.
- Existing tests and missing regression coverage.
- Current visual contract or `cc-*` compatibility classes to preserve.
- Final classification: keep native, keep domain-specific, normalize existing,
  wrap existing behind a CC primitive, migrate to Shadcn/Radix, or retire.
- Target CC component and intended `components/ui/`, `components/common/`, or
  domain ownership.
- Whether Radix is required internally.
- Required dependencies and bundle implications.
- Migration phase/batch, blockers, risk, and rationale.
- Any approved exception to the no-direct-Radix-import boundary.

The matrix must also include:

1. An approved first Phase 2 implementation batch with concrete consumers.
2. A list of Shadcn files and Radix primitives permitted for that first batch.
3. A list of patterns explicitly excluded from Shadcn/Radix.
4. An import-boundary rule stating that application, common, and domain code
   imports from `@/components/ui/*`, while `components/ui/` owns Radix imports.
5. A rule that Shadcn initialization must select the Radix base explicitly and
   that generated styles must be replaced with the approved `Default` theme's
   semantic color, shape, typography/emphasis, and component-role tokens.

## Blockers and dependencies

- Blocked by: DS-0001 and DS-0002.
- Blocks: DS-0007 and all Phase 2 primitive implementation tasks.

## Acceptance criteria

- [x] Every reusable or repeated interactive pattern from DS-0001 is present.
- [x] Every row has one final classification; unresolved `TBD` classifications
      block approval.
- [x] Native controls are retained where custom behavior has no demonstrated
      value.
- [x] High-confidence accessible primitives have concrete current consumers.
- [x] Audit-first domain surfaces document their complete behavior before a
      target is selected.
- [x] Markdown, Milkdown, generic HTML, layout, and third-party internals are
      explicitly excluded from Shadcn ownership.
- [x] The first Phase 2 batch is the smallest coherent batch that removes real
      duplication or accessibility risk.
- [x] No speculative component catalogue or unused dependency is approved.
- [x] The CC-owned import boundary is explicit and every exception has a narrow
      behavioral rationale.
- [x] Each migration preserves or deliberately supersedes an identified visual
      and behavioral contract.
- [x] Every approved CC primitive consumes the DS-0002 semantic appearance
      contract without branching on theme or color-mode names.
- [x] The matrix has recorded approval in its execution record.

## Verification tests

### Coverage searches

Rerun the DS-0001 interactive-pattern searches and confirm each result maps to a
matrix row:

```bash
rg -n --glob '*.tsx' 'role="(dialog|menu|listbox|tablist|switch)"|aria-modal|<select|type="checkbox"' packages/frontend/src
find packages/frontend/src/components -type f \( -iname '*Dialog*.tsx' -o -iname '*Modal*.tsx' -o -iname '*Popover*.tsx' -o -iname '*Select*.tsx' -o -iname '*Tabs*.tsx' -o -iname '*Switch*.tsx' -o -iname '*Checkbox*.tsx' \)
```

Before Phase 2, this command should confirm that no existing application code
already bypasses the planned boundary:

```bash
rg -n --glob '*.{ts,tsx}' 'from "radix-ui"|from "@radix-ui/' packages/frontend/src
```

After each later migration batch, the same search must return Radix imports only
inside `packages/frontend/src/components/ui/`, except matrix-approved paths.

### Document checks

```bash
pnpm exec prettier --check plans/design-system/phase-0/artifacts/component-adoption-matrix.md
```

Manually trace at least one consumer for every matrix family and exercise the
documented keyboard and closing behavior before approving its target.

## Out of scope

- Installing Shadcn, Radix, or supporting dependencies.
- Creating `components/ui/` implementations.
- Changing component behavior, APIs, or styling.
- Choosing components based only on the generated design project.
