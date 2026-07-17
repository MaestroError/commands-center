# Live Migration Inventory (DS-0401)

- Task: [DS-0401](../01-phase-3-handoff.md)
- Phase: [Phase 4](../README.md)
- Inventory date: 2026-07-18
- Tree: post-Phase-3 `packages/frontend/src` (commit `08e83c7`)
- Baseline for: [phase-4-ratchets.md](phase-4-ratchets.md)

## Reproduction commands

Run from the repository root, excluding `.test.` files. Palette occurrence pattern:

```
(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}
```

## Live counts vs history

| Concern                                      | Phase 0 | Phase 3 handoff | DS-0401 live | Note                                                                      |
| -------------------------------------------- | ------: | --------------: | -----------: | ------------------------------------------------------------------------- |
| Raw palette occurrences                      |     179 |             178 |      **178** | Counted with `rg -o`; matching-line counts are not a safe ratchet.        |
| Files with raw palette                       |      25 |              24 |       **23** | The handoff's 24 included a test file; the live source scope excludes it. |
| Hex/RGB/HSL occurrences                      |      82 |             136 |      **136** | Theme definitions plus the xterm bridge; counted by occurrence.           |
| `cc-*` occurrences                           |       — |             776 |      **776** | Includes visual compatibility classes and nonvisual keys.                 |
| TSX files with inline `<svg>`                |      16 |              16 |       **16** | Unchanged.                                                                |
| Files importing `lucide-react`               |      52 |              52 |       **53** | +1 from Phase 3 field/icon work.                                          |
| Direct Radix/`cmdk` outside `components/ui/` |       0 |               0 |        **0** | Boundary holds.                                                           |

## Raw-palette disposition by file → domain owner

| File                                             | Matches | Disposition / owner                                                              |
| ------------------------------------------------ | ------: | -------------------------------------------------------------------------------- |
| `components/shell/AppShell.tsx`                  |   7 → 0 | **DS-0402 (done this batch)** — status dots + active-runs pill → semantic tokens |
| `components/specialists/SpecialistForm.tsx`      |      34 | DS-0403 — permission/drift/runtime status roles                                  |
| `pages/tasks/task-helpers.ts`                    |      32 | DS-0404/0405 — task-state semantics                                              |
| `pages/CustomToolsPage.tsx`                      |      20 | DS-0407                                                                          |
| `pages/integrations/integration-helpers.ts`      |      14 | DS-0406 — category/brand semantics                                               |
| `pages/IntegrationsPage.tsx`                     |      10 | DS-0406                                                                          |
| `components/workspace/MonacoFileEditor.tsx`      |       8 | DS-0409 chrome only; editor theme mapping is Phase 5                             |
| `pages/SettingsPage.tsx`                         |       7 | DS-0407                                                                          |
| `components/tasks/TaskPromptComposer.tsx`        |       6 | DS-0404                                                                          |
| `components/chat/ChatComposer.tsx`               |       5 | DS-0408 (chrome only; composer suggestion behavior excluded)                     |
| `components/chat/UserMessage.tsx`                |       5 | DS-0408                                                                          |
| `pages/tasks/TaskBoard.tsx`                      |       4 | DS-0405                                                                          |
| `pages/file-manager/file-manager-panels.tsx`     |       4 | DS-0409                                                                          |
| `pages/FileManagerPage.tsx`                      |       4 | DS-0409                                                                          |
| `pages/integrations/mcp-server-dialog.tsx`       |       3 | DS-0406                                                                          |
| `components/tasks/task-ui.tsx`                   |       3 | DS-0404/0405                                                                     |
| `components/chat/AutoApproveToggle.tsx`          |       3 | DS-0408                                                                          |
| `pages/TaskDetailPage.tsx`                       |       2 | DS-0405                                                                          |
| `components/chat/SlashCommandPopover.tsx`        |       2 | DS-0408 — audit-first composer surface; token color only                         |
| `components/chat/CopyIdButton.tsx`               |       2 | DS-0408                                                                          |
| `components/workspace/QuickInspectorSurface.tsx` |       1 | DS-0409                                                                          |
| `components/workspace/EditorTabBar.tsx`          |       1 | DS-0409 — domain tab controller stays native; token the color only               |
| `components/chat/MessageTimeline.tsx`            |       1 | DS-0408                                                                          |

After the DS-0402 slice: **171 occurrences / 22 files**.

## Category / product-semantic colors (classify before tokenizing)

`task-helpers.ts` and `integration-helpers.ts` hold color maps keyed by product
meaning (task status, integration category). Per DS-0401 acceptance, these are
**not** mechanically mapped to state tokens: their owning domain task (DS-0404/5,
DS-0406) must decide category-token vs registered-exception before change. No new
generic category palette is proposed here.

## Inline-SVG disposition (16 files)

- Keep under exception: `AppLogo` (EX-001), `pages/integrations/integration-icons`
  (EX-002 brand), and `MilkdownDocumentEditor` (EX-003 SVG-string / Phase 5).
- DS-0408 owns `chat/Markdown`'s equivalent copy glyph while its `.cc-md`
  markup and CSS contract remain frozen.
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
