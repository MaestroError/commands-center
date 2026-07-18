# Button and Input Adoption Matrix

Status: Complete. Baseline frozen from commit `e3aa858b` on 2026-07-18.

## Reproducible baseline

The post-DSM-001 TypeScript/TSX inventory contained:

- 200 JSX `<button>` consumers with a targeted compatibility class: 182
  explicit `type="button"` and 18 explicit `type="submit"`;
- 64 ordinary domain `<input>` consumers of `cc-input`, plus the one
  primitive-owned `<input>` inside `Input`;
- 38 link-like consumers (`Link`, `NavLink`, `a`, or upload `label`) of the
  button compatibility family;
- two dynamic `<button>` consumers whose four compatibility-token selections
  came from `live-request-helpers.ts`;
- 28 `select`/`textarea` consumers of `cc-input`, deferred with exact path
  ratchets to DSM-003; and
- primitive-owned definitions in `button-variants.ts`, `input.tsx`, and
  `command.tsx`.

All 200 class-bearing buttons declared their native type before migration. The
migration retains those declarations, all native props, callbacks, refs,
accessible names, form associations, test IDs, and layout modifiers.

## Classification key

- **B** — ordinary action: migrate to `Button`; preserve explicit type and
  behavior. The compact activity action remains a native button because one
  mode is deliberately link-like, but obtains its non-compact appearance from
  `buttonVariants`.
- **I** — ordinary text-like input: migrate to `Input`; preserve every native
  prop and ref.
- **L** — semantic link/label action: retain its element and use
  `buttonVariants` rather than invalid button semantics.
- **D** — concrete `Select`/`Textarea` demand handed to DSM-003; retain
  `cc-input` only at the exact ratcheted path.
- **P** — primitive definition or composition; compatibility ownership remains
  inside `components/ui`.
- **Y** — dynamic domain styling: replace token-returning helpers with typed
  Button props and migrate both runtime consumers to `Button`.

Each row's directory identifies its domain owner. Every occurrence in a row
inherits the category's behavior-preservation contract: B/Y retain their
explicit native type, callback order, disabled state, accessible name, form
association, and test ID; I retains its input type, ref, name/value,
autocomplete, validation, focus, and label contract; L retains the original
navigation or file-upload element and callback; D retains its existing native
select/textarea behavior until DSM-003 supplies the typed replacement. The
inventory found no reset button and no targeted occurrence without an explicit
classification.

## Migration batch order

1. Primitive ownership: extract `buttonVariants`, prove semantic-element use,
   and keep `Button` as the typed button owner.
2. Shared shell and component domains: migrate reusable application surfaces
   before page consumers so their tests exercise the new ownership boundary.
3. Page domains: migrate ordinary actions and inputs while retaining all
   domain callbacks, form wiring, native types, and data-test IDs.
4. Semantic and dynamic cases: retain link/label/native semantics through
   `buttonVariants` and replace live-request token helpers with typed props.
5. Deferred controls and enforcement: freeze the 28 exact Select/Textarea
   handoffs and make all other direct compatibility consumption fail audit.

## Exact path disposition

Counts are element counts at the frozen baseline. A dash means zero.

| Exact path                                                        | B   | I   | L   | D   | Final disposition         |
| ----------------------------------------------------------------- | --- | --- | --- | --- | ------------------------- |
| `components/activities/ArchiveAllActivitiesButton.tsx`            | 1   | —   | —   | —   | native + `buttonVariants` |
| `components/chat/ChatComposer.tsx`                                | 2   | —   | —   | —   | B                         |
| `components/chat/ImageLightbox.tsx`                               | 2   | —   | —   | —   | B                         |
| `components/chat/PermissionDock.tsx`                              | 3   | —   | —   | —   | B                         |
| `components/chat/QuestionDock.tsx`                                | 2   | —   | —   | 1   | B; D                      |
| `components/dev/DesignSystemBaselinePage.tsx`                     | 7   | 1   | —   | 2   | B; I; D                   |
| `components/documents/DocumentCreateDialog.tsx`                   | —   | 2   | —   | 1   | I; D                      |
| `components/documents/DocumentFolderDialog.tsx`                   | —   | 1   | —   | —   | I                         |
| `components/documents/DocumentsSidebarSection.tsx`                | 2   | —   | —   | 1   | B; D                      |
| `components/layout/WorkspaceLayout.tsx`                           | 5   | —   | —   | —   | B                         |
| `components/live-requests/live-request-helpers.ts`                | —   | —   | —   | —   | Y: typed props            |
| `components/live-requests/LiveRequestPane.tsx`                    | 1Y  | —   | —   | —   | B                         |
| `components/live-requests/LiveRequestReviewForm.tsx`              | 1Y  | —   | —   | —   | B                         |
| `components/settings/SystemPromptCard.tsx`                        | 1   | —   | —   | —   | B                         |
| `components/shell/AppShell.tsx`                                   | 2   | —   | 1   | —   | B; L                      |
| `components/specialists/SpecialistAvatarPicker.tsx`               | —   | 3   | —   | —   | I                         |
| `components/specialists/SpecialistForm.tsx`                       | 1   | 4   | 4   | 1   | B; I; L; D                |
| `components/tasks/ArtifactGeneratedUrls.tsx`                      | 1   | —   | —   | —   | B                         |
| `components/tasks/ArtifactShareControls.tsx`                      | 3   | —   | —   | —   | B                         |
| `components/tasks/RunTaskContextDialog.tsx`                       | 2   | —   | 1   | 1   | B; L; D                   |
| `components/tasks/task-feedback-section.tsx`                      | 6   | —   | —   | 2   | B; D                      |
| `components/terminal/TerminalTabsSurface.tsx`                     | 1   | —   | —   | —   | B                         |
| `components/ui/button.tsx` and `components/ui/button-variants.ts` | —   | —   | —   | —   | P                         |
| `components/ui/command.tsx`                                       | —   | —   | —   | —   | P                         |
| `components/ui/input.tsx`                                         | —   | 1P  | —   | —   | P                         |
| `components/workspace/MonacoFileEditor.tsx`                       | 2   | —   | —   | —   | B                         |
| `components/workspace/QuickInspectorSurface.tsx`                  | —   | —   | 2   | —   | L                         |
| `components/workspace/WorkspaceFileSurface.tsx`                   | 1   | —   | —   | —   | B                         |
| `pages/ApiPage.tsx`                                               | 13  | 2   | —   | —   | B; I                      |
| `pages/BuiltInSkillsPage.tsx`                                     | 8   | 5   | 2   | 2   | B; I; L; D                |
| `pages/ClaimPage.tsx`                                             | 1   | 1   | —   | —   | B; I                      |
| `pages/CustomToolsPage.tsx`                                       | 15  | 4   | 3   | 1   | B; I; L; D                |
| `pages/DocumentsPage.tsx`                                         | 4   | 2   | 1   | 1   | B; I; L; D                |
| `pages/IntegrationsPage.tsx`                                      | 15  | 1   | —   | —   | B; I                      |
| `pages/LoginPage.tsx`                                             | 1   | —   | —   | —   | B                         |
| `pages/ProfilePage.tsx`                                           | 2   | —   | —   | —   | B                         |
| `pages/ProviderConnectionsPage.tsx`                               | 10  | 4   | —   | 1   | B; I; D                   |
| `pages/SettingsPage.tsx`                                          | 11  | 12  | —   | —   | B; I                      |
| `pages/SpecialistEditorPage.tsx`                                  | 1   | —   | 2   | —   | B; L                      |
| `pages/SpecialistsPage.tsx`                                       | 4   | 1   | 5   | —   | B; I; L                   |
| `pages/TaskDetailPage.tsx`                                        | 2   | 1   | 2   | —   | B; I; L                   |
| `pages/WorkspaceChatPage.tsx`                                     | 2   | —   | —   | —   | B                         |
| `pages/file-manager/file-manager-dialogs.tsx`                     | 8   | 3   | —   | —   | B; I                      |
| `pages/file-manager/file-manager-panels.tsx`                      | 8   | —   | —   | —   | B                         |
| `pages/integrations/integration-dialogs.tsx`                      | 6   | 1   | —   | —   | B; I                      |
| `pages/integrations/mcp-server-dialog.tsx`                        | 5   | 4   | —   | 4   | B; I; D                   |
| `pages/task-detail/task-run-detail.tsx`                           | 2   | —   | 2   | —   | B; L                      |
| `pages/tasks/TaskArchiveView.tsx`                                 | 2   | —   | —   | —   | B                         |
| `pages/tasks/TaskBoard.tsx`                                       | 2   | 1   | —   | —   | B; I                      |
| `pages/tasks/TaskDetailPanel.tsx`                                 | 16  | 1   | 3   | —   | B; I; L                   |
| `pages/tasks/TaskDetailSections.tsx`                              | 5   | —   | 2   | 2   | B; L; D                   |
| `pages/tasks/TaskFormPage.tsx`                                    | 2   | 3   | 2   | 2   | B; I; L; D                |
| `pages/tasks/TaskListPage.tsx`                                    | 3   | 1   | 2   | —   | B; I; L                   |
| `pages/tasks/TaskTemplateFormPage.tsx`                            | 2   | 6   | 2   | 6   | B; I; L; D                |
| `pages/tasks/TaskTemplatesView.tsx`                               | 6   | —   | 2   | —   | B; L                      |

## Final compatibility disposition

- `cc-button`, `cc-button-secondary`, `cc-button-danger`, and
  `cc-button-icon` remain implementation details of `buttonVariants`; domain
  code has zero direct consumers.
- `cc-input` remains owned by `Input` and `Command`, plus exactly 28
  `select`/`textarea` handoffs. Domain text-like inputs have zero direct
  consumers.
- The audit fails any new domain button token, any ordinary domain `cc-input`,
  or growth beyond an exact deferred path count. Global compatibility ratchets
  are reduced to the post-migration totals as a secondary guard.
