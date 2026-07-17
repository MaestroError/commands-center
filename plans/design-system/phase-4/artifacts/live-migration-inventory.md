# Live Migration Inventory (DS-0401)

- Task: [DS-0401](../01-phase-3-handoff.md)
- Phase: [Phase 4](../README.md)
- Inventory date: 2026-07-18
- Tree: post-Phase-3 `packages/frontend/src` (commit `08e83c7`)
- Baseline for: [phase-4-ratchets.md](phase-4-ratchets.md)

## Reproduction commands

Run from `packages/frontend/src`, excluding `.test.` files. Palette pattern:

```
(bg|text|border|ring|from|to|via|fill|stroke|divide|outline|decoration|shadow|accent|caret|placeholder)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}
```

## Live counts vs history

| Concern                                      | Phase 0 | Phase 3 handoff | DS-0401 live | Note                                                                         |
| -------------------------------------------- | ------: | --------------: | -----------: | ---------------------------------------------------------------------------- |
| Raw palette matches (strict)                 |     179 |             178 |       **72** | Handoff used a broader pattern; this is the strict `prefix-color-NNN` count. |
| Files with raw palette                       |      25 |              24 |       **23** |                                                                              |
| TSX files with inline `<svg>`                |      16 |              16 |       **16** | Unchanged.                                                                   |
| Files importing `lucide-react`               |      52 |              52 |       **53** | +1 from Phase 3 field/icon work.                                             |
| Direct Radix/`cmdk` outside `components/ui/` |       0 |               0 |        **0** | Boundary holds.                                                              |

## Raw-palette disposition by file → domain owner

| File                                             | Matches | Disposition / owner                                                              |
| ------------------------------------------------ | ------: | -------------------------------------------------------------------------------- |
| `components/shell/AppShell.tsx`                  |   4 → 0 | **DS-0402 (done this batch)** — status dots + active-runs pill → semantic tokens |
| `components/specialists/SpecialistForm.tsx`      |      11 | DS-0403 — validation/status roles                                                |
| `pages/tasks/task-helpers.ts`                    |      10 | DS-0404/0405 — **category/status semantics; classify product meaning first**     |
| `pages/integrations/integration-helpers.ts`      |       7 | DS-0406 — **category/brand semantics; classify before tokenizing**               |
| `pages/SettingsPage.tsx`                         |       6 | DS-0407                                                                          |
| `pages/IntegrationsPage.tsx`                     |       5 | DS-0406                                                                          |
| `pages/CustomToolsPage.tsx`                      |       5 | DS-0407 (incl. API tri-state exception review)                                   |
| `components/tasks/TaskPromptComposer.tsx`        |       4 | DS-0404                                                                          |
| `components/workspace/MonacoFileEditor.tsx`      |       3 | DS-0409 chrome only; **editor theme mapping is Phase 5**                         |
| `components/chat/ChatComposer.tsx`               |       3 | DS-0408 (chrome only; composer suggestion behavior excluded)                     |
| `components/chat/UserMessage.tsx`                |       2 | DS-0408                                                                          |
| `pages/tasks/TaskBoard.tsx`                      |       1 | DS-0405                                                                          |
| `pages/TaskDetailPage.tsx`                       |       1 | DS-0405                                                                          |
| `components/tasks/task-ui.tsx`                   |       1 | DS-0404/0405                                                                     |
| `pages/integrations/mcp-server-dialog.tsx`       |       1 | DS-0406                                                                          |
| `pages/file-manager/file-manager-panels.tsx`     |       1 | DS-0409                                                                          |
| `pages/FileManagerPage.tsx`                      |       1 | DS-0409                                                                          |
| `components/workspace/QuickInspectorSurface.tsx` |       1 | DS-0409                                                                          |
| `components/workspace/EditorTabBar.tsx`          |       1 | DS-0409 — domain tab controller stays native; token the color only               |
| `components/chat/SlashCommandPopover.tsx`        |       1 | DS-0408 — **audit-first composer surface; token color only, keep behavior**      |
| `components/chat/MessageTimeline.tsx`            |       1 | DS-0408                                                                          |
| `components/chat/CopyIdButton.tsx`               |       1 | DS-0408                                                                          |
| `components/chat/AutoApproveToggle.tsx`          |       1 | DS-0408                                                                          |

After the DS-0402 slice: **68 matches / 22 files**.

## Category / product-semantic colors (classify before tokenizing)

`task-helpers.ts` and `integration-helpers.ts` hold color maps keyed by product
meaning (task status, integration category). Per DS-0401 acceptance, these are
**not** mechanically mapped to state tokens: their owning domain task (DS-0404/5,
DS-0406) must decide category-token vs registered-exception before change. No new
generic category palette is proposed here.

## Inline-SVG disposition (16 files)

- Keep under exception: `AppLogo` (EX-001), `pages/integrations/integration-icons`
  (EX-002 brand), `MilkdownDocumentEditor` (EX-003 SVG-string / Phase 5),
  `chat/Markdown` (protected `.cc-md`).
- DS-0408 (equivalent glyph → Lucide, audit-first where noted): `AttachmentBar`,
  `AutoApproveToggle`, `ChatComposer`, `ChatHeader`, `ConversationHistoryModal`,
  `CopyIdButton`, `FileMentionPopover` (audit-first), `MediaTab`,
  `ModelSelector` (audit-first), `UserMessage`.
- DS-0409: `layout/WorkspaceLayout`, `workspace/WorkspaceFilesTab`.

## Exceptions reconciled

EX-001 (AppLogo), EX-002 (provider brand artwork), EX-003 (Milkdown SVG string)
remain approved and unchanged. EX-004/EX-005 remain Phase 5. No exception was
reclassified by this inventory.

## Coverage note

Critical shell/domain flows retain their existing unit + E2E coverage
(`AppShell`, `ThemeMenu`, task/integration/settings pages, chat). No uncovered
behavior required a new pre-migration test for the DS-0402 shell token slice; the
change is class-only and covered by the application visual baseline.
