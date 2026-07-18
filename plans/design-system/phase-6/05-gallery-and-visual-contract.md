# DS-0605 — Consolidate the Development Gallery and Visual Contract

- Status: Complete
- Phase: [Phase 6](README.md)
- Foundation reference:
  [Verification strategy](../../design-system-foundation.md#verification-strategy)
- Upstream gate: DS-0601 fixture and API inventory

## Goal

Make the development-only design-system gallery a reliable living contract for
approved reusable APIs, semantic content, protected surfaces, and important UI
states without turning it into production code or an unmaintainable snapshot set.

## Context

Earlier phases use `/__design-system-baseline` for application, semantic HTML,
Markdown, Milkdown, and primitive/common/bridge fixtures. Phase 6 should
consolidate these inputs, remove obsolete duplication, and ensure contributors
can visually inspect the supported system in Default light/dark and relevant
responsive/focus states.

## Scope

- Inventory and reconcile Phase 1–5 fixture routes, surfaces, query contracts,
  appearance assertions, and helper APIs.
- Present semantic HTML, approved primitives, common compositions, statuses,
  forms, dialogs/menus/tooltips, protected Markdown/Milkdown, and third-party
  bridge representatives with deterministic data.
- Cover normal, hover where deterministic, focus-visible, active, selected,
  disabled, loading, empty, success, warning, danger, error, and overflow states
  only where the API supports them.
- Keep behavior-rich fixtures focused and stable; use semantic, computed-style,
  containment, and interaction assertions instead of screenshot baselines.
- Preserve keyboard/accessibility assertions alongside visual coverage.
- Keep all gallery code, routes, data, and assets excluded from production.

## Required deliverables

- Consolidated development gallery/baseline surface using final exported APIs.
- A documented fixture manifest mapping each state to its owner and test.
- Focused light/dark wide/narrow visual tests and keyboard/focus assertions.
- Removal of only obsolete fixture code/assertions made redundant by the final
  contract.

## Blockers and dependencies

- Blocked by: DS-0601.
- Blocks: DS-0609.

## Acceptance criteria

- [x] Every approved primitive/common composition and semantic content category
      has a representative deterministic gallery state or a documented reason
      for behavior-only coverage.
- [x] Protected Markdown/Milkdown and third-party bridges retain their scoped
      fixtures rather than being approximated by generic HTML.
- [x] Default light/dark and narrow/wide reviews cover the important states
      without blanket page or combinatorial fixture growth.
- [x] Keyboard order, accessible names/roles, focus-visible, escape/outside-
      interaction, and modal focus behavior remain covered where applicable.
- [x] Gallery consumers import the same public APIs production uses.
- [x] Fixture changes do not mutate product data, require live services, or
      depend on timing/network nondeterminism.
- [x] Production build contains no executable gallery route, marker, fixture data, or asset.
- [x] Two consecutive deterministic appearance runs pass.

## Verification tests

- Run focused gallery unit/E2E/accessibility tests in Default light and dark at
  frozen wide/narrow viewports.
- Run the design-system Playwright project twice.
- Build production and search output/routes for gallery markers and fixture data.
- Compare fixture imports with approved source APIs and final exception scopes.

## Out of scope

- Adding Storybook or another documentation/gallery dependency.
- Reintroducing committed screenshot baselines or covering every prop
  combination.
- Redesigning components to make the gallery visually uniform.
