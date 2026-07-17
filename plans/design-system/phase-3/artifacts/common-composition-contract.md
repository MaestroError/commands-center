# Phase 3 Common-Composition Contract

- Task: [DS-0301](../01-phase-2-handoff.md)
- Status: Approved
- Phase 2 input: [Phase 2 sign-off](../../phase-2/artifacts/phase-2-signoff.md)

## Implemented Phase 2 handoff

Phase 2 delivered `cn`, `Button`, `Dialog`, and `AlertDialog`, plus an ESLint
boundary that permits Radix imports only below `src/components/ui/`. The
primitive gallery and focused tests establish the behavior contract Phase 3
must preserve. Existing `cc-*` class consumers remain supported.

## Authorized batches

| Task    | Common consumer                                          | Implementation decision                                                                           | Support files                                            | Dependency decision |
| ------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------- |
| DS-0302 | `ConfirmDialog`                                          | Compose the existing AlertDialog and Button APIs; preserve all current props                      | None                                                     | None                |
| DS-0303 | `DocumentCreateDialog`, `DocumentFolderDialog`           | Compose the existing Dialog and Button APIs; keep each form/mutation independent                  | May consume DS-0305 Input after it lands                 | None                |
| DS-0304 | `PageHeader`, `LoadingState`, `ErrorState`, `EmptyState` | Add small visual-only Surface and Alert primitives; keep layout/content in common                 | `components/ui/surface.tsx`, `components/ui/alert.tsx`   | None                |
| DS-0305 | `PasswordInput`                                          | Add native Input and Button icon sizing; preserve native input props and visibility state         | `components/ui/input.tsx`, bounded Button `size` variant | None                |
| DS-0306 | Common `Switch`; `SpecialistForm` consumer               | Add copy-owned Radix Switch and keep the common controlled adapter                                | `components/ui/switch.tsx`                               | Existing `radix-ui` |
| DS-0307 | Ordinary `TabBar` consumers                              | Add copy-owned Radix Tabs; retain the controlled tab-ID adapter and external panels               | `components/ui/tabs.tsx`                                 | Existing `radix-ui` |
| DS-0308 | `SearchableSelect`                                       | Add Popover plus Command so Radix owns popup behavior and cmdk owns combobox filtering/navigation | `components/ui/popover.tsx`, `components/ui/command.tsx` | Add `cmdk`          |

`cmdk` is approved only for the concrete DS-0308 Command consumer. No other new
runtime dependency is authorized.

## Public API compatibility

| Component          | Public contract retained                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `ConfirmDialog`    | title, ReactNode description, confirm label/variant/disabled, cancel callback, optional secondary callback    |
| Document dialogs   | existing props, scope/owner/default folder or parent, close callback, mutation payloads                       |
| `PageHeader`       | eyebrow, title, description, actions                                                                          |
| Page states        | title, description, action, testId; LoadingState testId and six-card layout                                   |
| `PasswordInput`    | all native input props except caller-controlled type; className remains composable                            |
| Common `Switch`    | checked, onChange, label, aria-label; optional disabled is an additive native/Radix capability                |
| `TabBar`           | tabs, activeTabId, onTabChange, testIdPrefix, icon and icon-only behavior; optional panel IDs may be additive |
| `SearchableSelect` | value, onChange, options, placeholder, disabled, className, ariaLabel                                         |

## Current consumers and test ownership

- `ConfirmDialog`: Settings, activity archive, system prompt card, and the
  design-system fixture. `ConfirmDialog.test.tsx` owns prop/callback behavior;
  gallery Playwright owns focus, Escape, overlay, and return.
- Document dialogs: mounted by `DocumentsSidebarSection`. Their focused tests
  own path/validation/mutation behavior; sidebar tests own the real trigger and
  private-document flow.
- `PageHeader`: shared across dashboard, specialists, tasks, integrations,
  providers, API, settings, profile, and development fixtures. New common tests
  own the API; representative page tests own domain layout.
- Page states: used throughout activity, tasks, specialists, documents,
  settings, API, integrations, providers, chat, and custom tools. New common
  tests own semantics and structure; domain tests own copy/actions.
- `PasswordInput`: Claim, Login, Profile, Settings, providers, and integrations.
  Its focused test owns visibility/native behavior; consumer tests own auth and
  mutation rules.
- Common `Switch`: `SpecialistForm` plus the development fixture. A focused
  common test owns semantics and controlled behavior; SpecialistForm owns state.
- `TabBar`: ActivityPanel, API, Settings, Tasks, task detail, task templates,
  task-run detail, and ordinary WorkspaceLayout section selectors. The common
  test owns roving focus and selection. `TerminalTabBar` and `EditorTabBar` are
  separate controllers and remain excluded.
- `SearchableSelect`: `SpecialistForm` and `LiveRequestReviewForm`. Its focused
  test owns combobox behavior; consumers own option sources and form state.

## Behavior decisions

- ConfirmDialog uses the Phase 2 AlertDialog contract: safe Cancel receives
  initial focus, Escape cancels, overlay interaction does not dismiss, and
  focus returns to the real trigger.
- Ordinary document dialogs close on Escape/outside interaction and return
  focus. The first field receives initial focus.
- Radix Switch follows its rendered button contract: Space and Enter each
  activate once.
- Ordinary Tabs use horizontal automatic activation. Arrow keys and Home/End
  move focus and request the corresponding controlled tab value. External panel
  relationships are emitted only when an explicit panel ID is supplied.
- SearchableSelect retains an input-focused model. Opening the Popover must not
  move focus away from the Command input; cmdk owns filtering, active option,
  arrows, and Enter selection.

## Exclusions

- Terminal/editor tabs, composer suggestion popovers, GlobalSearchPalette,
  ModelSelector, file pickers, lightboxes, API tri-state checks, and all broad
  page/domain class migrations.
- `.cc-md`, `.cc-md--chat`, Milkdown, Monaco, xterm, and file-manager internals.
- New themes, theme branches in components, page layout redesign, and business
  logic refactors.

## Task ownership

Each DS-0302 through DS-0308 task owns only its named common/support files and
focused tests. DS-0309 alone owns the combined `common` fixture surface and its
Playwright snapshots. DS-0310 owns final inventories and the Phase 4 handoff.
