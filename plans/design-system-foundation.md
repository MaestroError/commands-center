# CC Design System Foundation

## Goal

Turn CC's current theme tokens, `cc-*` classes, common React components, and
Tailwind usage into one reliable, documented design system without a visual
rewrite or a big-bang migration.

The design system should make the intended path the easiest path:

- Theme-dependent values come from semantic CC tokens.
- Layout and ordinary styling use Tailwind utilities.
- Repeated interactive patterns use typed React primitives.
- Unclassed HTML elements receive consistent, theme-aware CC typography.
- Existing production classes and components are reused where their behavior
  and visual contract are already sound.

## Confirmed scope

- Replace the current `light`/`dark`/`modern` theme enum with two independent
  concepts: a high-level CC theme and a color-mode preference.
- Ship one theme named `Default`. Its light and dark color sets preserve the
  current `light` and `dark` visual direction, while its shared tokens define
  shape, corner radius, typography emphasis, and component-role treatments.
- Remove `modern` as a theme and migrate any stored `modern` selection to the
  `Default` theme's dark mode.
- Offer `light`, `dark`, and `system` as color-mode preferences in the header.
  Resolve `system` to light or dark without treating it as a third palette.
- Keep high-level theme selection on the Profile page. Only `Default` is
  available initially.
- Do not add or plan around the generated teal theme.
- Keep the existing chat Markdown renderer and `.cc-md` styles unchanged.
- Treat the generated design folder as visual and structural inspiration only.
- Do not introduce a new visual language during the foundation work.
- Do not replace Tailwind with a parallel CSS framework or token system.
- Use Radix as the behavior and accessibility foundation for complex interactive
  primitives such as dialogs, dropdowns, popovers, tooltips, and selects.
- Use copy-owned Shadcn component implementations where they provide a sound
  starting point, then adapt their Tailwind classes to CC's semantic tokens and
  existing visual contract.
- Add Shadcn/Radix components only when they have a concrete CC consumer; do not
  import a speculative component catalogue.

## Recommended approach

### 1. Keep four distinct layers

#### Theme contract

Use separate DOM attributes for the selected high-level theme and resolved color
mode, for example `data-theme="default"` and `data-color-mode="dark"`. The
persisted color-mode preference may be `light`, `dark`, or `system`; the resolved
DOM value is always `light` or `dark`.

CSS custom properties under that theme/mode contract are the source of truth for
values that can vary. Continue exposing semantic properties through Tailwind
v4's `@theme` block so components can use utilities such as `bg-surface`,
`text-text-secondary`, and `border-border`.

Theme tokens should describe purpose rather than a specific palette:

- Light and dark application/surface color hierarchies.
- Primary and secondary text.
- Accent foreground, hover, active, and on-accent colors.
- Success, warning, danger, and information foreground/surface/border pairs.
- Focus rings, selection, overlays, and disabled treatment.
- Shared theme-level shape tokens such as control, surface, badge, and pill
  radii.
- Shared typography/emphasis and component-role tokens where visual character
  genuinely differs by theme.
- Chat, terminal, editor, and other product-specific surfaces only when they
  genuinely need independent theme values.

Theme definitions are bounded token contracts, not arbitrary stylesheets.
Components consume semantic tokens and must not branch on theme names or color
modes. The Phase 0 appearance contract must decide portable versus device-local
persistence in accordance with the Portable Workspace Rule and define a
flash-free `system` initialization strategy.

Do not duplicate Tailwind's complete spacing, font-weight, breakpoint, sizing,
or layout scales as raw CSS variables. A small semantic role such as heading or
badge emphasis may resolve to a theme token when the approved appearance
contract requires it; do not recreate the underlying Tailwind scale.

#### Tailwind composition

Use Tailwind for:

- Layout, spacing, sizing, responsive behavior, and overflow.
- Ordinary typography size/weight/leading utilities.
- Component composition and page-specific arrangement.
- Simple hover, focus, disabled, and group states when they remain readable.

Prefer semantic Tailwind colors backed by `@theme`. Raw palette utilities such
as `amber-*`, `emerald-*`, or `purple-*` should remain only when the color itself
has non-theme product meaning. Otherwise migrate them to semantic state or
category tokens.

#### React primitives

Use typed React components for repeated controls and patterns whose behavior,
accessibility, or variants should not be reassembled at each call site.

Initial primitive candidates:

- `Button` and `IconButton`.
- `Input`, `Textarea`, `Select`, and field messaging.
- `Card` or `Surface`.
- `Badge`, `Pill`, and `Status`.
- `Alert`.
- `Tabs`.
- `Dialog`, popover, dropdown, and tooltip primitives when needed.
- `Switch` and checkbox controls.

Start these components by wrapping the current production `cc-*` classes where
those classes already express the correct visual contract. Keep variants small
and concrete. Do not create generic configuration APIs for hypothetical uses.

For interactive overlay primitives, use the documented Shadcn/Radix approach
instead of implementing focus management and keyboard behavior from scratch.
Radix owns interaction semantics, focus management, keyboard behavior, portals,
and state exposure. CC owns the component API, Tailwind classes, visual states,
and theme integration.

The frontend does not currently have Shadcn initialized and does not directly
depend on Radix. Bootstrap the copy-owned Shadcn structure with Radix during the
first approved primitive implementation, review every generated file and
dependency, and add only the components included in that implementation batch.
Initialize Shadcn with the Radix base explicitly; do not rely on the CLI's
default primitive selection.

Application pages, common compositions, and domain components should import
CC-owned primitives from `@/components/ui/*`, not Radix directly. Radix imports
belong inside `components/ui/`, where CC owns the public API, styling, and theme
integration. A direct Radix import outside that boundary requires a concrete
behavioral reason and an explicit exception in the approved adoption matrix.

Before Phase 2 begins, complete and approve an adoption matrix for current UI
patterns. Each row must identify the current component or call sites, their
behavioral requirements, and one target classification:

- Keep the native HTML control.
- Keep the domain-specific implementation.
- Wrap the existing implementation behind a CC primitive.
- Migrate to a copy-owned Shadcn component backed by Radix where applicable.

High-confidence Shadcn/Radix candidates are ordinary dialogs, destructive
confirmation dialogs, dropdown menus, tooltips, switches, checkboxes, radio
groups, ordinary tabs, and searchable comboboxes. Copy-owned Shadcn `Button`,
`Input`, `Textarea`, and `Badge` implementations may also seed CC primitives,
provided their APIs and styles are adapted to the existing CC contract.

Treat composer mention popovers, terminal/editor tab bars, global search, file
pickers, image lightboxes, and other behavior-rich domain surfaces as
audit-first items. Their current focus, keyboard, selection, closing, and domain
behavior must be mapped before choosing a primitive. Retain simple native
controls when Shadcn would not materially improve consistency, behavior, or
accessibility.

Do not use Shadcn for semantic HTML typography, Markdown presentation,
Milkdown's internal editor UI, page layout, or third-party internals such as
Monaco, xterm, SVAR, and assistant-ui. Those concerns use the base layer,
Tailwind, scoped theme bridges, or their existing domain APIs.

#### Small CSS layer

Keep authored CSS for the cases where CSS is the correct abstraction:

- Theme variable declarations and Tailwind `@theme` mappings.
- Safe global resets, inherited defaults, and semantic element styles in
  `@layer base`.
- Complex pseudo-element or state styling that is materially clearer in CSS.
- Third-party component theme bridges for Milkdown, Monaco, xterm, and the file
  manager.
- Temporary legacy `cc-*` compatibility classes during migration.

Avoid adding page-specific selector trees to the global stylesheet.

### 2. Give unclassed HTML a global CC appearance

Define theme-aware defaults for semantic HTML elements in Tailwind's
`@layer base`. Generic HTML rendered anywhere inside the application should look
intentional without requiring a class on every child.

Cover at least:

- `h1` through `h6`.
- `p`.
- `ul`, `ol`, and `li`, including visible markers and nested lists.
- `a`.
- `blockquote`.
- `table`, `thead`, `tbody`, `tr`, `th`, `td`, and `caption`.
- `hr`.
- `pre`, `code`, `kbd`, and `samp`.
- `strong`, `em`, `small`, `mark`, `del`, and `ins` where a CC treatment adds
  value.

Use semantic theme utilities and properties for color, borders, surfaces,
selection, and focus. Theme changes must update these elements automatically.
Use Tailwind's existing type, spacing, radius, and layout scales rather than
duplicating them as CSS tokens.

Keep the defaults deliberately low precedence:

- Put them in `@layer base`, before component and utility layers.
- Prefer low-specificity selectors such as `:where(h1)` when useful.
- Let an explicit Tailwind utility or component class override the base style.
- Treat the base styles as the fallback appearance, not an inflexible rule.

The base layer should include enough rhythm that a fragment containing only
ordinary HTML remains readable, including heading spacing, paragraph spacing,
list indentation, table borders, and horizontal-rule spacing. Before enabling
it, capture and compare existing screens because CC currently contains many
semantic elements that have only partial or no utility classes.

The existing `.cc-md` contract remains separate and unchanged. Its component
layer and more specific selectors must continue to override the base HTML
defaults, so chat Markdown keeps its current rendering.

An optional prose/container class may still provide a constrained reading width
or a roomier document rhythm, but it must not be required for unclassed HTML to
look like CC.

### 3. Protect the existing Markdown styles

Treat `.cc-md` and `.cc-md--chat` as a frozen visual contract during the design
system foundation and migration.

Markdown is a content format, not one universal visual surface. Keep these
rendering contexts explicit:

- Generic unclassed HTML uses the new global CC base styles.
- Read-only Markdown uses the existing `.cc-md` reader contract.
- Chat Markdown uses `.cc-md` plus the existing `.cc-md--chat` variant.
- Editable documents use Milkdown's scoped editor presentation, powered by the
  same CC semantic theme tokens but not by `.cc-md` selectors.

All current React Markdown rendering flows through the shared `Markdown`
component and therefore receives `.cc-md`, including task and activity surfaces.
Protect that shared reader output, not only the chat-specific variant.

- Keep the existing selectors and class names unchanged.
- Do not route Markdown output through the new generic HTML component APIs.
- Keep generic HTML defaults in `@layer base`; keep Markdown rules in the
  component layer so they win through the cascade without `!important`.
- Preserve the current theme-token values consumed by Markdown. If foundation
  tokens are renamed, provide aliases so Markdown's computed values do not
  change.
- Capture current chat Markdown screenshots for headings, paragraphs, nested
  lists, links, inline code, fenced code, blockquotes, tables, horizontal rules,
  and images in the current light and dark modes before enabling global element
  defaults.
- Add regression coverage that renders the same fixture as generic unclassed
  HTML and as `.cc-md`, proving the global fallback applies only to the generic
  case and Markdown retains its current presentation.
- Review narrow-width overflow and wrapping for code, tables, links, and long
  tokens without changing the established Markdown layout.

No Markdown visual change is accepted as an incidental consequence of token,
layer, or global-element work.

Milkdown follows a different preservation contract. Freeze document data and
editing behavior, including cursor and selection states, node controls, menus,
code blocks, tables, links, images, and narrow-width behavior. Capture its
current visual baseline, then deliberately migrate its scoped Crepe theme bridge
to the CC semantic token contract. Milkdown may visually converge with the new
design system, but only through reviewed changes; generic base-element rules
must not leak into or unexpectedly restyle the editor.

### 4. Preserve current classes as a compatibility API

Keep the established classes initially:

- `cc-panel`.
- `cc-button` and its current variants.
- `cc-input`.
- `cc-alert` and `cc-success`.
- `cc-badge`.
- `cc-nav-item`.
- `cc-tab`.
- `cc-empty-state`.
- `cc-eyebrow`.

First normalize their theme tokens, focus states, disabled states, contrast, and
variant naming. Then let new React primitives render these classes internally.
Existing call sites continue to work while screens migrate incrementally.

Do not create both a CSS-class variant system and a separate unrelated React
variant system. React primitives should be the typed entry point to the same
underlying visual contract.

### 5. Reuse the existing component hierarchy

Use these ownership boundaries:

- `components/ui/`: small, domain-neutral primitives.
- `components/common/`: reusable CC compositions such as `PageHeader`, page
  states, confirmation flows, and search/select patterns.
- Domain component folders: business-specific components assembled from UI and
  common components.
- Tailwind utilities at page level: layout and one-off composition.

Before creating a primitive, inventory existing common and domain components.
Reuse a component as-is when its API already fits. If reuse would require a
behavioral refactor, confirm that refactor separately rather than silently
expanding the design-system scope.

### 6. Make theme completeness measurable

Theme support should mean more than changing the page background.

Build an appearance coverage matrix for the `Default` theme in resolved light
and dark modes, plus behavioral coverage for the `system` preference:

- Base surfaces and typography.
- Buttons, fields, cards, tabs, statuses, and dialogs.
- Chat shell and composer, excluding changes to Markdown rendering.
- Milkdown.
- Monaco.
- xterm.
- File manager.
- Loading, empty, error, warning, success, disabled, selected, and focus states.

Audit and migrate hardcoded palette utilities, hardcoded hex values, fixed
editor themes, and inline SVG icons in focused batches. Treat terminal ANSI
colors and genuinely branded integration colors as explicit exceptions, not
accidental bypasses.

### 7. Verify through a component gallery and focused tests

Create a development/test-only component gallery using the existing app stack
instead of adding Storybook immediately. It should render each primitive and
state in the `Default` theme's light and dark modes at representative narrow and
wide widths.

Use the gallery for:

- Fast manual review.
- Playwright screenshots for visual regression coverage.
- Keyboard and focus-state verification.
- Contrast and overflow review.
- Confirming that every variant responds to theme and resolved color-mode
  changes.

Add focused unit tests for behavior and accessibility contracts. Do not test
Tailwind itself or static class aliases without observable behavior.

## Phased plan

Detailed execution plans live under [`plans/design-system/`](design-system/README.md).
Phases 0 and 1 have been decomposed so far; later phases must use the same task
format and record blockers on dependent tasks.

### Phase 0 — Inventory and freeze the contract

- [x] Complete
      [DS-0001 — Inventory the current design system](design-system/phase-0/01-current-system-inventory.md):
      catalogue theme tokens, `cc-*` classes, common components, raw palette
      uses, inline SVGs, and third-party theme overrides.
- [x] Complete
      [DS-0002 — Define the target appearance contract](design-system/phase-0/02-target-appearance-contract.md):
      specify the `Default` theme, light/dark/system color-mode behavior, token
      boundaries, persistence, migration, DOM selectors, and UI ownership.
- [x] Complete
      [DS-0003 — Classify components and approve Shadcn/Radix adoption](design-system/phase-0/03-component-disposition-and-adoption-matrix.md):
      classify current items as keep, normalize, wrap, migrate, or retire and
      approve the component adoption matrix.
- [x] Complete
      [DS-0004 — Capture application visual baselines](design-system/phase-0/04-application-visual-baselines.md):
      preserve the current light/dark visual inputs for the `Default` theme at
      narrow and wide viewport sizes and document `modern` as removal-only.
- [x] Complete
      [DS-0005 — Capture Markdown and Milkdown baselines](design-system/phase-0/05-markdown-and-milkdown-baselines.md):
      freeze the read-only Markdown contract and record Milkdown's visual and
      behavioral editing baseline.
- [x] Complete
      [DS-0006 — Inventory semantic HTML impact](design-system/phase-0/06-semantic-html-impact-inventory.md):
      find unclassed semantic elements and identify intended versus unintended
      changes from future global base styles.
- [x] Complete
      [DS-0007 — Approve exceptions, enrich later phases, and sign off Phase 0](design-system/phase-0/07-exceptions-and-phase-0-signoff.md):
      register justified visual exceptions, revise Phases 1–6 from Phase 0
      evidence, and verify all deliverables before implementation begins.

Verify: every proposed new primitive or token maps to at least one current use,
the target appearance contract and adoption matrix are approved, Phases 1–6 are
updated from the evidence, and the baselines make unintended visual changes
detectable.

### Phase 1 — Normalize foundations without redesigning screens

- [x] Decompose Phase 1 into the
      [detailed Phase 1 task plan](design-system/phase-1/README.md) before editing
      foundation code.
- [x] Complete
      [DS-0101 — Implement the appearance state contract](design-system/phase-1/01-appearance-state-contract.md):
      separate theme, preference, and resolved mode; migrate legacy values;
      initialize before paint; add header mode ownership and Default-only
      Profile presentation; remove Modern.
- [x] Complete
      [DS-0102 — Complete semantic tokens and normalize compatibility styles](design-system/phase-1/02-token-foundation.md):
      consolidate CSS/Tailwind mappings, add approved color/shape/emphasis
      roles, and repair foundation-level contrast and focus gaps.
- [x] Complete
      [DS-0103 — Add semantic base guardrails and inherited defaults](design-system/phase-1/03-semantic-base-guardrails.md):
      establish low-specificity base ownership, inheritance, protected-surface
      isolation, and utility/component precedence.
- [x] Complete
      [DS-0104 — Style headings, paragraphs, and document separators](design-system/phase-1/04-semantic-typography.md):
      introduce the first visible generic typography batch without changing
      component-owned or protected content.
- [x] Complete
      [DS-0105 — Style semantic lists](design-system/phase-1/05-semantic-lists.md):
      add generic list hierarchy while protecting navigation, menus, Markdown,
      and Milkdown.
- [x] Complete
      [DS-0106 — Style tables, code, and remaining semantic elements](design-system/phase-1/06-semantic-structures.md):
      complete element coverage and resolve the measured semantic-content
      overflow without enabling GFM tables.
- [x] Complete
      [DS-0107 — Correct narrow shell overflow](design-system/phase-1/07-responsive-shell.md):
      resolve the existing 512px shell width at a 390px viewport as a separate
      responsive task.
- [x] Complete
      [DS-0108 — Verify and sign off Phase 1](design-system/phase-1/08-phase-1-signoff.md):
      approve every visual difference, verify protected surfaces and production
      exclusion, and establish the Phase 2 gate.

Verify: the `Default` theme renders consistently in resolved light and dark
modes, `system` tracks operating-system changes, legacy values migrate safely,
existing screens remain visually stable, explicit utilities still override
defaults, and `.cc-md` retains its current rendering at narrow and wide viewport
sizes.

### Phase 2 — Establish typed UI primitives

- [x] Decompose Phase 2 into the
      [detailed Phase 2 task plan](design-system/phase-2/README.md) before adding
      Shadcn/Radix code or dependencies.
- [ ] Complete
      [DS-0201 — Freeze the first primitive-batch contract](design-system/phase-2/01-batch-contract.md):
      revalidate the approved files, APIs, dependencies, interaction behavior,
      exclusions, and Phase 3 consumer expectations against the stabilized
      Phase 1 repository.
- [ ] Complete
      [DS-0202 — Initialize the minimal Shadcn/Radix boundary and `cn`](design-system/phase-2/02-shadcn-radix-foundation.md):
      configure copy-owned Shadcn for the existing Vite/Tailwind v4 stack,
      explicitly use the Radix base, add only approved dependencies, reject the
      generated palette, and enforce the CC-owned import boundary.
- [ ] Complete
      [DS-0203 — Implement the typed Button primitive](design-system/phase-2/03-button-primitive.md):
      expose the existing primary, secondary, and danger compatibility contract
      through a small native-button API without speculative variants.
- [ ] Complete
      [DS-0204 — Implement the Dialog primitive](design-system/phase-2/04-dialog-primitive.md):
      use Radix for modal, portal, keyboard, outside-interaction, and focus
      behavior while CC owns semantic Tailwind styling and exported composition.
- [ ] Complete
      [DS-0205 — Implement the AlertDialog primitive](design-system/phase-2/05-alert-dialog-primitive.md):
      establish safe destructive focus and cancellation behavior while composing
      the CC Button visual contract.
- [ ] Complete
      [DS-0206 — Add the primitive gallery and visual baselines](design-system/phase-2/06-primitive-gallery.md):
      extend the existing development-only fixture with real primitive states,
      interactions, narrow/wide coverage, and Default light/dark screenshots.
- [ ] Complete
      [DS-0207 — Verify and sign off Phase 2](design-system/phase-2/07-phase-2-signoff.md):
      audit files, dependencies, import boundaries, behavior, appearance,
      protected surfaces, production exclusion, and the Phase 3 gate.

Verify: primitive behavior, keyboard interaction, focus states, disabled states,
and all theme variants have focused coverage; Shadcn/Radix adds no parallel
palette or visual contract. Phase 2 remains limited to `Button`, `Dialog`,
`AlertDialog`, and `cn`; `ConfirmDialog`, `DocumentCreateDialog`, and
`DocumentFolderDialog` migration begins in Phase 3 after sign-off.

### Phase 3 — Consolidate common compositions

- [ ] Update `PageHeader`, page states, tabs, confirmation dialogs, switches,
      password fields, and searchable selects to compose the primitives.
- [ ] Remove only duplication made obsolete by those conversions.
- [ ] Keep public component APIs stable where practical.
- [ ] Start dialog consolidation with `ConfirmDialog`,
      `DocumentCreateDialog`, and `DocumentFolderDialog`; focus entry/return,
      Escape, overlay, accessible naming, and safe destructive focus block their
      migration.

Verify: the common layer no longer reimplements primitive visual states and its
existing tests continue to pass.

### Phase 4 — Migrate domain UI incrementally

- [ ] Migrate high-repetition surfaces first: forms, page actions, status chips,
      modal shells, and icon buttons.
- [ ] Work by domain or user flow so each batch is reviewable and testable.
- [ ] Replace raw palette colors with semantic tokens where the meaning is
      theme-dependent.
- [ ] Replace inline SVG icons with Lucide where an equivalent exists.
- [ ] Do not refactor business logic during visual migrations.
- [ ] Ratchet the Phase 0 inventory of 179 raw palette matches across 25 files
      and 16 inline-SVG TSX files; retain only exceptions EX-001 through EX-003
      and separately controlled category/brand decisions.

Verify: each migrated flow is visually reviewed in the `Default` theme's light
and dark modes and retains its unit and E2E behavior.

### Phase 5 — Complete third-party theming

- [ ] Make Monaco respond to the active CC theme.
- [ ] Build xterm options from CC theme values while preserving intentional ANSI
      colors.
- [ ] Replace Milkdown's Crepe palette bridge with CC semantic theme tokens
      while keeping its editor-specific styles scoped to
      `.milkdown-editor-wrapper`.
- [ ] Verify Milkdown's document data, editing behavior, and reviewed visual
      baseline remain stable, and that global base-element rules do not leak
      into the editor.
- [ ] Add or normalize the file-manager theme bridge.
- [ ] Use one scoped task and stable fixture per third-party surface. Reuse the
      Milkdown editable/read-only/serialization/menu/selection/code/image/table
      baselines; add equivalent stable fixtures for Monaco and xterm before
      changing their fixed themes.
- [ ] Do not create speculative assistant-ui or SVAR bridges while those
      dependencies and consumers are absent.

Verify: changing the theme or resolved color mode updates every major frontend
surface without reloads, unreadable states, or fixed dark/light islands.

### Phase 6 — Document and enforce the system

- [ ] Document token naming, class compatibility, component selection, allowed
      Tailwind usage, and exception rules.
- [ ] Document how to add a theme without editing component implementations.
- [ ] Add a lightweight repository audit for new hardcoded palette colors,
      inline SVGs, and unapproved primitive duplication.
- [ ] Retire legacy classes only after all call sites have migrated and removal
      produces a clear simplification.
- [ ] Convert the Phase 0 reproduction commands and exception IDs into
      lightweight audits only after migration batches establish realistic
      count ratchets.

Verify: a contributor can choose the correct token, utility, primitive, or
composition without reading unrelated implementation files.

## Success criteria

- The `Default` theme supplies complete light and dark semantic color sets plus
  shared shape, typography/emphasis, and component-role tokens.
- `light`, `dark`, and `system` are color-mode preferences rather than themes;
  `system` resolves and reacts correctly.
- `modern` is removed and legacy stored selections migrate safely.
- Chat Markdown styles have no intentional visual changes.
- Read-only task and activity Markdown retain the shared `.cc-md` reader
  contract.
- Generic base-element rules never override `.cc-md` or `.cc-md--chat` styles.
- Milkdown uses CC semantic theme tokens through a scoped adapter without
  inheriting unintended global element styles.
- Every Shadcn/Radix migration is authorized by the approved adoption matrix.
- Common controls are implemented once and reused through typed components.
- Existing `cc-*` consumers remain functional throughout migration.
- Unclassed semantic HTML has a consistent, theme-aware CC appearance.
- Tailwind remains the default tool for layout and ordinary styling.
- Authored CSS is limited to tokens, base element rules, complex states,
  third-party bridges, and temporary compatibility definitions.
- Major application and third-party surfaces respond correctly to theme changes.
- The component gallery and automated checks catch visual, responsive, focus,
  and theme regressions.

## Explicit non-goals

- Redesigning the CC information architecture or page layouts.
- Changing the existing chat Markdown presentation.
- Adding the generated teal theme.
- Creating tokens for every Tailwind value.
- Replacing every utility class with a named CSS class.
- Building custom dialog, popover, dropdown, or tooltip behavior when an
  approved accessible primitive already solves it.
- Migrating every screen in one pull request.
