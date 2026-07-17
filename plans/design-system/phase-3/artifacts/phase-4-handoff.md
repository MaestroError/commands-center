# Phase 4 Handoff

- Produced by: [DS-0310](../10-phase-3-signoff.md)
- Consumed by: [DS-0401](../../phase-4/01-phase-3-handoff.md)
- Inventory date: 2026-07-17
- Scope: post-Phase-3 `packages/frontend/src`

## Current inventory

| Concern                        |                 Phase 0 |   Post-Phase 3 | Disposition                                                                                                                                   |
| ------------------------------ | ----------------------: | -------------: | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw Tailwind palette matches   |          179 / 25 files | 178 / 24 files | Phase 3 removed the common Switch's raw emerald state; DS-0401 must assign all remaining matches.                                             |
| Hex/RGB/HSL literals           |            82 / 3 files |  127 / 3 files | The increase comes from Phase 1's explicit Default light/dark semantic token sets, not new Phase 3 component literals.                        |
| TSX files with inline `<svg>`  |                      16 |             16 | Unchanged; assign to domain work, EX-001–EX-003, or Phase 5.                                                                                  |
| Files importing `lucide-react` |                      52 |             52 | Unchanged.                                                                                                                                    |
| `cc-*` matches                 | not recorded as a total |            846 | Includes definitions, tests, storage/test IDs, and visual consumers.                                                                          |
| Unique `cc-*` names            |                      38 |             43 | Includes new typed compatibility names such as `cc-button-icon` and `cc-password-toggle`; DS-0401 must separate visual classes from keys/IDs. |

The reproduction patterns remain those in the Phase 0 inventory. DS-0401 owns
the authoritative per-file/per-role classification and ratchets; these counts
must not be copied forward without rerunning them.

Direct `radix-ui` imports currently occur only in these UI modules:

- `alert-dialog.tsx`
- `alert.tsx`
- `dialog.tsx`
- `popover.tsx`
- `surface.tsx`
- `switch.tsx`
- `tabs.tsx`

`cmdk` occurs only in `components/ui/command.tsx`. Common/UI searches find no
component-local `dark:`, `data-theme`, or `data-color-mode` branch.

## Retained common adapters

Domain work should consume these CC-owned APIs instead of importing Radix or
`cmdk` directly:

- `ConfirmDialog`
- `PageHeader` and `LoadingState` / `ErrorState` / `EmptyState`
- `PasswordInput`
- Common `Switch`
- Ordinary `TabBar`
- `SearchableSelect`

The UI layer now provides Button, Input, Surface, Alert, Dialog, AlertDialog,
Popover, Command, Switch, and Tabs building blocks. A domain batch may add a
primitive only for a concrete approved consumer and must preserve the
components/ui import boundary.

## Remaining domain batches

| Recommended order | Phase 4 owner                     | High-repetition scope                                                                                                                       |
| ----------------: | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
|                 1 | DS-0402 shell/global              | Header/sidebar actions, global menus/search, tooltips, overlays, statuses, responsive shell controls.                                       |
|                 2 | DS-0403 specialists               | Specialist cards/forms/editors, semantic validation/status states, avatar controls, and common-adapter consumers.                           |
|                 3 | DS-0404 task authoring            | Task/template forms, context controls, fields, actions, badges, and shared task authoring helpers.                                          |
|                 4 | DS-0405 task operations           | Board/detail/run cards, progress/status roles, confirmation/actions, and operational overlays after DS-0404.                                |
|                 5 | DS-0406 integrations/providers    | Connection dialogs, provider/integration cards, brand exceptions, category semantics, fields, and statuses.                                 |
|                 6 | DS-0407 settings/API/tools        | Dense forms, token/tool controls, tri-state exception review, badges, page states, and dialogs.                                             |
|                 7 | DS-0408 chat/media                | Chat chrome, media/action controls, equivalent UI SVGs, and domain-specific overlays without touching protected Markdown/composer behavior. |
|                 8 | DS-0409 workspace/documents/files | Workspace/document/file-manager chrome, dialogs/actions, editor-adjacent controls, and the Phase 5 bridge boundary.                         |

DS-0402 is the recommended first visual batch after DS-0401 because shell
controls frame every domain. DS-0403, DS-0404, and DS-0406 through DS-0409 may
then proceed independently when their file ownership does not overlap.

## Inline-SVG handoff

The 16 current files are:

- `components/common/AppLogo.tsx`
- `components/documents/MilkdownDocumentEditor.tsx`
- `components/layout/WorkspaceLayout.tsx`
- `components/workspace/WorkspaceFilesTab.tsx`
- `components/chat/AttachmentBar.tsx`
- `components/chat/AutoApproveToggle.tsx`
- `components/chat/ChatComposer.tsx`
- `components/chat/ChatHeader.tsx`
- `components/chat/ConversationHistoryModal.tsx`
- `components/chat/CopyIdButton.tsx`
- `components/chat/FileMentionPopover.tsx`
- `components/chat/Markdown.tsx`
- `components/chat/MediaTab.tsx`
- `components/chat/ModelSelector.tsx`
- `components/chat/UserMessage.tsx`
- `pages/integrations/integration-icons.tsx`

`AppLogo`, provider/integration brand artwork, and Milkdown's required SVG-string
format must be reconciled with EX-001–EX-003 instead of mechanically replaced.

## Protected and deferred boundaries

- `.cc-md` and `.cc-md--chat` remain frozen.
- Milkdown/Crepe, Monaco, xterm, and third-party appearance bridges remain Phase
  5 unless a Phase 4 task touches only surrounding CC-owned chrome.
- Terminal and editor tab controllers remain domain-specific; ordinary TabBar
  is not a replacement for close/dirty/drag/pane/session lifecycle.
- Composer mention/slash/file suggestions, `GlobalSearchPalette`,
  `ModelSelector`, file pickers, lightboxes, and API tri-state controls remain
  audit-first exclusions from the generic Phase 3 compositions.
- Native select/checkbox/radio behavior remains native unless its adoption
  record explicitly approves a custom primitive.
- Domain migration is visual/compositional work, not authorization to refactor
  API calls, query keys, mutations, navigation, persistence, or business logic.

## DS-0401 entry condition

There is no unresolved Phase 3 blocker. DS-0401 is authorized to refresh and
classify inventories only. DS-0402 through DS-0412 remain blocked until DS-0401
produces its live inventory, domain-batch contract, and ratchets.
