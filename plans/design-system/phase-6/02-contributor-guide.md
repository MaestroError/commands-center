# DS-0602 — Write the Canonical Contributor Design-System Guide

- Status: Complete
- Phase: [Phase 6](README.md)
- Foundation reference:
  [Layering approach](../../design-system-foundation.md#recommended-approach)
- Upstream gate: DS-0601 documentation contract

## Goal

Give contributors one concise, task-oriented guide for choosing and using the
implemented CC design-system layers without reading unrelated source files.

## Context

The foundation and phase artifacts explain architecture and history, but they
are not an everyday usage manual. The canonical guide must use actual post-
Phase-5 APIs and explain when to use semantic HTML, Tailwind, CC-owned
primitives, common compositions, domain-specific UI, or scoped CSS.

## Scope

- Create `docs/design-system/README.md` as the entry point and decision tree.
- Document token families and naming by semantic role, including color, shape,
  typography/emphasis, focus, status, and component roles.
- Document allowed Tailwind usage and when theme-dependent values must use CC
  semantic tokens instead of raw palette utilities.
- Document the small authored-CSS boundary: tokens, base rules, complex states,
  third-party bridges, and temporary compatibility only.
- Document semantic unclassed HTML behavior and protected `.cc-md`,
  `.cc-md--chat`, and Milkdown boundaries.
- Document the selection path for native HTML, CC-owned Shadcn/Radix primitives,
  common compositions, and domain-specific behavior-rich UI.
- Document icon rules, accessibility expectations, tests, and examples using
  real imports and variants.
- Link to the separate theme/exception runbook from DS-0603.

## Required deliverables

- `docs/design-system/README.md` with the contributor decision tree and quick
  start.
- Focused supporting pages only where one file would become hard to scan, such
  as `components.md` and `content-and-styling.md`, as approved by DS-0601.
- Copy-pastable examples verified against real exported APIs.
- A mapping from adoption-matrix categories to the final contributor guidance.

## Blockers and dependencies

- Blocked by: DS-0601.
- Blocks: DS-0604, DS-0608, and DS-0609.

## Acceptance criteria

- [x] The guide answers how to style layout, theme-dependent color/shape,
      unclassed HTML, forms, dialogs, menus, statuses, Markdown, and third-party
      surfaces.
- [x] Tailwind is the default for ordinary styling; the guide does not promote
      a parallel class framework or CSS-per-component convention.
- [x] Shadcn is described as copy-owned component source/convention and Radix as
      behavior foundation; domain code consumes CC-owned APIs.
- [x] Direct Radix imports, custom accessible-interaction reimplementation, and
      speculative component extraction are clearly bounded.
- [x] Native controls and audit-first behavior-rich domain surfaces are covered.
- [x] `.cc-md`/`.cc-md--chat` protection, Milkdown scoping, and generic HTML
      fallback behavior cannot be confused with each other.
- [x] All examples compile or are mechanically checked against live exports.
- [x] Links are relative, valid, and do not make phase artifacts required
      reading for ordinary implementation work.

## Verification tests

- Run Prettier and a local Markdown link checker over `docs/design-system/`.
- Typecheck or otherwise mechanically verify example imports, props, variants,
  and token names against the post-Phase-5 source.
- Walk the guide against representative scenarios from every adoption-matrix
  category and record the selected layer/API.
- Search for terminology that conflicts with the foundation or live source.

## Out of scope

- Building a documentation website or Storybook-like dependency.
- Re-documenting every component prop already expressed by TypeScript.
- Adding components, tokens, themes, or exceptions to make examples convenient.
