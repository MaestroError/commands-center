# Phase 4 — Migrate Domain UI Incrementally

- Status: In progress

Parent plans:

- [Design-system task-plan index](../README.md)
- [CC Design System Foundation](../../design-system-foundation.md#phase-4--migrate-domain-ui-incrementally)

Required evidence:

- [Current-system inventory](../phase-0/artifacts/current-system-inventory.md)
- [Component adoption matrix](../phase-0/artifacts/component-adoption-matrix.md)
- [Exception register](../phase-0/artifacts/exceptions-and-phase-0-signoff.md)
- [Downstream phase reassessment](../phase-0/artifacts/downstream-phase-reassessment.md)
- [Phase 3 task plan](../phase-3/README.md)
- Phase 3 sign-off and Phase 4 handoff artifacts, produced by DS-0310

## Goal

Migrate CC's production domain surfaces onto the established primitives,
common compositions, semantic tokens, and Lucide icon set in small user-flow
batches, without changing business logic or protected/third-party behavior.

## Delivery strategy

1. Accept the actual Phase 3 handoff and refresh the historical palette, icon,
   class, modal, and component inventories.
2. Migrate shell/global interactions first because they frame every domain.
3. Work domain-by-domain: specialists, task authoring, task operation,
   integrations/providers, settings/API/tools, chat/media, and
   workspace/documents/file-manager chrome.
4. Replace only theme-dependent raw palette roles and equivalent UI glyphs;
   preserve approved brand/product/third-party exceptions.
5. Close with a repository-wide residual audit, integrated domain baselines,
   and an explicit Phase 5 bridge handoff.

Each task owns one coherent user flow and must preserve domain state, API calls,
query keys, mutations, navigation, keyboard behavior, and persistence. Visual
migration is not permission to refactor business logic.

## Task sequence

| ID      | Task                                                                                     | Blocked by              | Status      |
| ------- | ---------------------------------------------------------------------------------------- | ----------------------- | ----------- |
| DS-0401 | [Accept the Phase 3 handoff and refresh migration inventories](01-phase-3-handoff.md)    | Phase 3 sign-off        | Complete    |
| DS-0402 | [Migrate shell and global interaction surfaces](02-shell-global-ui.md)                   | DS-0401                 | In progress |
| DS-0403 | [Migrate specialist management flows](03-specialists.md)                                 | DS-0401                 | Planned     |
| DS-0404 | [Migrate task authoring and template flows](04-task-authoring.md)                        | DS-0401                 | Planned     |
| DS-0405 | [Migrate task board, detail, and run flows](05-task-operations.md)                       | DS-0401, DS-0404        | Planned     |
| DS-0406 | [Migrate integrations and provider flows](06-integrations-providers.md)                  | DS-0401                 | Planned     |
| DS-0407 | [Migrate settings, API, and custom-tool flows](07-settings-api-tools.md)                 | DS-0401                 | Planned     |
| DS-0408 | [Migrate chat and media chrome](08-chat-media.md)                                        | DS-0401                 | Planned     |
| DS-0409 | [Migrate workspace, Documents, and file-manager chrome](09-workspace-documents-files.md) | DS-0401                 | Planned     |
| DS-0410 | [Close palette, icon, component, and compatibility inventories](10-inventory-ratchet.md) | DS-0402 through DS-0409 | Planned     |
| DS-0411 | [Add integrated domain migration baselines](11-domain-baselines.md)                      | DS-0402 through DS-0410 | Planned     |
| DS-0412 | [Verify and sign off Phase 4](12-phase-4-signoff.md)                                     | DS-0402 through DS-0411 | Planned     |

DS-0402, DS-0403, DS-0404, and DS-0406 through DS-0409 may proceed in parallel
after DS-0401 when their file sets do not overlap. DS-0405 follows task
authoring because task helpers and shared task UI cross both flows.

## Historical baseline and live ratchets

Phase 0 recorded 179 raw Tailwind palette matches across 25 files, 16 TSX files
with inline SVG, 52 Lucide-import files, and extensive `cc-*` class usage. Those
numbers are historical evidence, not Phase 4's starting counts. DS-0401 must
re-run the documented searches after Phase 3 and assign every live match to a
domain task, an approved exception, Phase 5, or a separate product decision.

No task may reduce a count by hiding values in arbitrary CSS, inventing vague
tokens, or replacing an accessible component with an untested abstraction.

## Protected and deferred boundaries

- `.cc-md` and `.cc-md--chat` remain frozen.
- Milkdown, Monaco theme mapping, xterm theme/ANSI, and file-manager third-party
  bridges remain Phase 5 work.
- Composer mention/slash/file suggestion behavior remains domain-specific and
  is not replaced by focus-moving Radix Popover behavior.
- Terminal/editor tab controllers remain domain-specific.
- Native select, checkbox, and radio controls remain native unless the adoption
  matrix explicitly approves custom behavior.
- EX-001 AppLogo, EX-002 provider brand artwork, and EX-003 Milkdown SVG-string
  format remain approved. EX-004/EX-005 belong to Phase 5.

## Phase exit gate

Phase 4 is complete only when:

- Every live raw palette and inline-SVG match is migrated, assigned to Phase 5,
  retained under a stable exception, or documented as a separately controlled
  category/brand decision.
- High-repetition buttons, fields, statuses, modal shells, and icon actions use
  the approved primitive/common layer in each migrated domain.
- Domain logic and public API behavior remain unchanged and covered.
- Radix imports remain inside `components/ui/`; domain code consumes CC-owned
  APIs.
- Default light/dark and narrow/wide reviews pass for each domain batch.
- Protected Markdown and excluded editor/terminal/composer behavior remain
  stable.
- Phase 5 receives exact remaining third-party bridge locations and fixtures.
