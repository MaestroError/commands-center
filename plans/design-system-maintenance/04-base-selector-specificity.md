# DSM-004 — Normalize Semantic Base-Selector Specificity

- Status: Complete
- Program: [Design-System Maintenance](README.md)
- Foundation reference:
  [Semantic base-element contract](../design-system-foundation.md#2-give-unclassed-html-a-global-cc-appearance)
- Canonical guidance:
  [Content and styling boundaries](../../docs/design-system/content-and-styling.md)

## Goal

Express generic semantic HTML defaults with deliberately low specificity while
preserving the exact cascade, exclusions, responsive behavior, and rendered
appearance established by the foundation.

## Context

The base layer currently starts selectors with `:where(...)` but then appends
multiple `:not(...)` exclusions. Those exclusions add specificity even though
Tailwind's later utility layer wins in normal use. This is low-risk residual
debt, not a current visual defect, so it runs after behavior and component
migrations and must be a no-visual-change cleanup.

## Scope

- Inventory every generic base selector in `styles/globals.css` and record its
  current specificity, protected scopes, parent/list exclusions, pseudo-element
  behavior, and test owner.
- Freeze computed-style and containment coverage for unclassed headings,
  paragraphs, links, lists, description lists, quotes, code, tables, inline
  semantics, media, and separators before rewriting selectors.
- Define one readable selector pattern that places element/class/protected-scope
  exclusions inside `:where(...)` or otherwise makes the intended specificity
  explicit without depending on a new CSS tool.
- Rewrite selectors mechanically in small category batches. Preserve cascade
  layers, declarations, combinators, pseudo-elements, and all protected scope
  boundaries.
- Keep `.cc-md`, `.cc-md--chat`, Milkdown, Monaco, xterm, and explicit utility-
  styled content excluded exactly as before.
- Add a lightweight source contract test only if it can precisely prevent
  specificity regression without introducing a general CSS parser dependency.

## Required deliverables

- `artifacts/base-selector-specificity-inventory.md` with old/new selector
  forms, specificity targets, exclusions, and verification owner.
- Normalized semantic base selectors with no declaration or visual redesign.
- Focused source/computed-style tests proving the specificity and exclusion
  contract.
- Updated content guidance only if the supported selector rule becomes more
  precise for contributors.

## Blockers and dependencies

- Blocked by: DSM-003.
- Blocks: None.

## Acceptance criteria

- [x] Every changed selector is mapped from its previous form and retains the
      same target elements, parent conditions, protected scopes, and pseudo-
      element behavior.
- [x] The element-targeting compound of generic base selectors has the agreed
      zero-specificity `:where(...)` contract; pseudo-elements contribute only
      their unavoidable type specificity.
- [x] No selector relies on a higher-specificity `:not(...)` chain outside the
      low-specificity wrapper merely to enforce protected-scope exclusions.
- [x] Explicit Tailwind utilities and component classes continue to win through
      the intended cascade-layer contract.
- [x] `.cc-md` and `.cc-md--chat` retain their existing reader/chat appearance
      with no intentional visual change.
- [x] Milkdown/Crepe, Monaco, xterm, classed lists/tables, and nested component
      content remain excluded from generic defaults.
- [x] Unclassed semantic HTML retains typography, spacing, markers, overflow,
      link/focus treatment, and table behavior in Default light/dark.
- [x] Narrow content at 320px/390px does not overflow and explicit responsive
      utilities retain precedence.
- [x] No new dependency, selector framework, compatibility class, or token is
      introduced for the cleanup.
- [x] The design-system audit and all semantic/protected-content tests pass
      without weakening an existing rule or updating appearance baselines.

## Verification tests

- Record selector specificity before and after using a reproducible script or
  documented manual calculation; keep the result in the inventory artifact.
- Run focused semantic HTML tests for every element category and explicit-
  utility precedence.
- Run protected Markdown reader/chat, Milkdown edit/read-only/serialization,
  Monaco, xterm, and classed component containment tests.
- Exercise Default light/dark at wide, 390px, and 320px viewports. Use computed
  style and containment assertions; do not add committed screenshot baselines.
- Run `pnpm exec eslint . --fix`, `pnpm format`, `pnpm lint`, `pnpm typecheck`,
  full tests, design-system Playwright twice, full E2E, production build, knip,
  and `pnpm design-system:audit`.
- Run a production marker search to confirm development fixtures remain
  excluded.

## Completion evidence

- The inventory maps all 33 semantic selectors from their previous form to the
  normalized contract. Ordinary subjects are `(0,0,0)` and only `::marker`
  contributes unavoidable type specificity.
- A focused computed-style run exposed Tailwind Preflight precedence for
  headings, links, lists, and small text. The explicit
  `theme, base, cc-semantic, components, utilities` order now places CC
  semantic defaults after Preflight while leaving components and utilities
  authoritative.
- The audit contains 27 passing source-contract cases and rejects bare semantic
  selectors or protected-scope exclusions outside `:where(...)`.
- Seventeen focused Phase 1 Chromium checks cover semantic categories,
  utility/class exclusions, narrow containment, and Default light/dark. The
  protected Markdown and Milkdown suite remains green without appearance
  baseline updates.
- Design-system Playwright passed twice with 56 desktop checks per run. The full
  E2E suite passed 166 tests with 56 intentionally skipped mobile duplicates.
- Full workspace tests passed, including 137 backend files/1,252 tests, 148
  frontend files/1,443 tests, and 14 shared files/205 tests. ESLint fix/check,
  typecheck, Prettier, Knip, production builds, `git diff --check`, and the
  design-system audit also pass.
- Manual browser inspection covered unclassed semantic HTML, protected reader
  and chat Markdown, and Milkdown in Default light and dark. Production bundles
  contain none of the development fixture markers outside source maps.

## Out of scope

- Changing semantic typography, spacing, colors, radii, or content hierarchy.
- Restyling chat Markdown, reader Markdown, or Milkdown.
- Reordering Tailwind cascade layers or replacing the base contract with a
  typography plugin.
- Refactoring unrelated global CSS.
