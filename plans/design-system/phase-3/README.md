# Phase 3 — Consolidate Common Compositions

- Status: Complete

Parent plans:

- [Design-system task-plan index](../README.md)
- [CC Design System Foundation](../../design-system-foundation.md#phase-3--consolidate-common-compositions)

Required evidence:

- [Component adoption matrix](../phase-0/artifacts/component-adoption-matrix.md)
- [Downstream phase reassessment](../phase-0/artifacts/downstream-phase-reassessment.md)
- [Phase 2 task plan](../phase-2/README.md)
- Phase 2 sign-off artifact, produced by DS-0207 before implementation starts

## Goal

Move CC's reusable common compositions onto the proven UI primitive layer while
preserving their public APIs and domain behavior. Add support primitives only
when an approved common composition provides a concrete consumer, and keep
domain-wide visual migration in Phase 4.

## Delivery strategy

1. Accept the actual Phase 2 handoff and freeze the common-composition contract.
2. Start with the three previously approved dialog consumers.
3. Consolidate page structure and fields through small native/Tailwind
   primitives.
4. Migrate Switch, ordinary Tabs, and SearchableSelect in separate behavioral
   batches backed by Radix/Shadcn where approved.
5. Extend the existing design-system fixture with common-composition states.
6. Sign off API compatibility, accessibility, protected surfaces, and the Phase
   4 handoff.

Each task may add only the support primitive required by its named common
consumer. Radix imports remain inside `components/ui/`; common compositions own
CC-specific APIs and content. Existing domain code must not import Radix or
Shadcn registry code directly.

## Task sequence

| ID      | Task                                                                                           | Blocked by              | Status   |
| ------- | ---------------------------------------------------------------------------------------------- | ----------------------- | -------- |
| DS-0301 | [Accept the Phase 2 handoff and freeze the common-composition contract](01-phase-2-handoff.md) | Phase 2 sign-off        | Complete |
| DS-0302 | [Migrate `ConfirmDialog` to AlertDialog](02-confirm-dialog.md)                                 | DS-0301                 | Complete |
| DS-0303 | [Migrate the document dialogs to Dialog](03-document-dialogs.md)                               | DS-0301                 | Complete |
| DS-0304 | [Consolidate `PageHeader` and page states](04-page-structure.md)                               | DS-0301                 | Complete |
| DS-0305 | [Consolidate `PasswordInput` and field primitives](05-password-input.md)                       | DS-0301                 | Complete |
| DS-0306 | [Migrate the common Switch](06-switch.md)                                                      | DS-0301                 | Complete |
| DS-0307 | [Migrate ordinary common tabs](07-tabs.md)                                                     | DS-0301                 | Complete |
| DS-0308 | [Migrate `SearchableSelect` to the approved combobox composition](08-searchable-select.md)     | DS-0301                 | Complete |
| DS-0309 | [Add common-composition gallery coverage](09-common-gallery.md)                                | DS-0302 through DS-0308 | Complete |
| DS-0310 | [Verify and sign off Phase 3](10-phase-3-signoff.md)                                           | DS-0302 through DS-0309 | Complete |

DS-0302 through DS-0308 are separate reviewable batches and may proceed in
parallel after DS-0301 when they do not touch the same primitive or fixture.
DS-0309 owns the combined gallery and visual review after all composition
batches stabilize.

## Phase boundary

Phase 3 owns:

- `components/common` API-preserving composition refactors.
- The two existing document-dialog compositions approved in Phase 0.
- Minimal `components/ui` support primitives required by those exact
  compositions.
- Focused updates to direct consumers only when necessary to preserve behavior
  or provide correct trigger/focus relationships.

Phase 3 does not own:

- Broad replacement of `cc-*` classes across pages and domains.
- Raw-palette or inline-icon inventory ratchets beyond files changed by these
  composition migrations.
- Domain-specific terminal/editor tabs, composer suggestion popovers, global
  search, file pickers, lightboxes, or other audit-first surfaces.
- Markdown, Milkdown, Monaco, xterm, file-manager internals, or page layout
  redesign.
- Theme architecture changes or additional themes.

## Phase exit gate

Phase 3 is complete only when:

- The three first dialog consumers use CC-owned Phase 2 primitives with their
  public/domain behavior preserved.
- PageHeader, page states, PasswordInput, Switch, ordinary TabBar, and
  SearchableSelect no longer reimplement visual or accessibility behavior owned
  by an approved UI primitive.
- Every new support primitive has a named current consumer, focused tests, and
  gallery coverage.
- Public common-component APIs remain stable unless an approved artifact records
  a necessary migration and all consumers update atomically.
- Radix imports remain limited to `components/ui/`, semantic tokens drive all
  changed appearance, and existing `cc-*` compatibility remains available.
- Protected Markdown/Milkdown and excluded domain surfaces have no unexplained
  regression.
- Phase 4 receives a current list of remaining class-only domain consumers and
  explicitly excluded high-risk components.
