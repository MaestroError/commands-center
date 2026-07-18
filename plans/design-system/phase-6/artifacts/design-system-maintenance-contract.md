# Design-System Maintenance Contract

## Canonical ownership

- `docs/design-system/` owns contributor decisions, component selection,
  content boundaries, theme authoring, and exception policy.
- `AGENTS.md` owns concise mandatory repository rules and links to the canonical
  documentation.
- `packages/frontend/src/styles/globals.css` owns semantic tokens, unclassed
  HTML, protected content scopes, and approved authored-CSS boundaries.
- `packages/frontend/src/components/ui/` owns copy-owned primitives and the
  Radix import boundary. Common and domain components consume those APIs.
- `scripts/design-system-audit.mjs` owns cross-file ratchets that ESLint cannot
  express precisely. ESLint remains the sole owner of import restrictions.
- `/__design-system-baseline` and `packages/frontend/e2e/design-system/` own the
  development gallery contract and its deterministic interaction/appearance
  checks.

## Change requirements

### Tokens and base content

Add a semantic token only for a reusable visual role. Supply complete Default
light/dark values, expose it through Tailwind when ordinary utilities need it,
and verify unclassed HTML plus protected Markdown/Milkdown precedence when the
role affects content. Do not add a raw palette alias for one component.

### Components

Reuse native HTML, a CC-owned primitive, or a common composition before adding
an API. New behavior-rich overlays start from the existing Shadcn/Radix-owned
primitive layer and include keyboard, focus, dismissal, responsive, and gallery
coverage. Domain UI stays domain-owned until at least two consumers share the
same contract.

### Themes

Follow `docs/design-system/themes.md`. A theme change supplies complete light
and dark semantic declarations plus shared shape/emphasis values, keeps theme
identity separate from color-mode preference, and does not edit component
implementations. A future selectable theme must first gain a portable workspace
source of truth.

### Exceptions and bridges

Follow `docs/design-system/exceptions.md`. Every exception needs an `EX-NNN`
ID, owner, exact path, evidence, theme behavior, verification, and retirement
condition. Bridge adapters receive resolved appearance; they do not read
browser preference or create a parallel theme state.

### Compatibility

No new `cc-*` compatibility consumer is allowed. Retained families remain at
or below the audited per-class maximum. Retirement requires zero production,
test, fixture, documentation, and dynamic consumers; protected `.cc-md` scopes
are permanent content contracts rather than migration debt.

## Required maintenance triggers

- Update the gallery and focused tests when a public primitive, composition,
  semantic content category, state, or bridge contract changes.
- Update the audit register and isolated positive/negative test when an audit
  rule, exact path, count, or exception changes.
- Update canonical docs and entry-point links in the same change when a
  contributor decision or command changes.
- Run `pnpm design-system:audit` locally. Before release, run the repository
  quality gates documented in `plans/design-system/phase-6/09-phase-6-signoff.md`.
- Review retained compatibility and all exceptions during design-system changes;
  do not lower counts without corresponding source evidence.
