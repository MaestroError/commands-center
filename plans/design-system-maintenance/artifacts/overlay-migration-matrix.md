# Overlay Migration Matrix

Status: Completed on 2026-07-18. The original contracts below were frozen before
implementation and then verified against the final dispositions.

| Owner path                                           | Frozen dismissal contract                                | Final disposition                                                      | Focused verification                                      |
| ---------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| `components/chat/ConversationHistoryModal.tsx`       | backdrop and explicit controls; no Escape                | controlled `Dialog`; search autofocus and inline confirmation retained | history modal tests cover outside/Escape and domain flows |
| `components/chat/ImageLightbox.tsx`                  | backdrop, Escape, and Close                              | controlled `Dialog`; global key listener removed                       | dedicated lightbox tests plus MediaTab integration        |
| `components/chat/SystemPromptsModal.tsx`             | backdrop, Escape, and Close                              | controlled `Dialog`; global key listener removed                       | system-prompts tests cover both dismissal paths           |
| `components/documents/DocumentsSidebarSection.tsx`   | backdrop and Cancel; no Escape                           | controlled `Dialog`; selection workflow retained                       | sidebar tests cover outside/Escape and selection flows    |
| `components/documents/WorkspaceFilePickerDialog.tsx` | backdrop and Escape from the autofocused search field    | controlled `Dialog`; autofocus retained; overlay stacking preserved    | picker tests cover search and both dismissal paths        |
| `components/search/GlobalSearchPalette.tsx`          | backdrop and Escape from the autofocused search field    | controlled `Dialog` containing unchanged domain search UI              | search tests cover naming, search, outside, and Escape    |
| `components/shell/AppShell.tsx`                      | explicit “I saved it” only                               | controlled `Dialog`; outside/Escape prevented; stacking preserved      | app-shell tests retain the explicit persistence flow      |
| `components/tasks/RunTaskContextDialog.tsx`          | explicit Cancel or Run only                              | controlled `Dialog`; outside/Escape prevented                          | dedicated tests cover payload, Cancel, and safe dismissal |
| `pages/WorkspaceChatPage.tsx`                        | Escape or explicit Cancel/Continue; no outside dismissal | controlled `AlertDialog`; manual focus loop and semantics removed      | chat-page tests cover focus, Escape, Cancel, and Continue |
| `pages/file-manager/file-manager-dialogs.tsx`        | backdrop or explicit Cancel/action; no Escape            | shared controlled `Dialog` frame; form state and callbacks retained    | file-manager tests cover dismissal and domain flows       |

## Frozen functional invariants

- Conversation selection, deletion, search, clear-all, and query invalidation do
  not change.
- Image download and media rendering do not change.
- Prompt expansion/fallback content does not change.
- Document owner/file selection callbacks and async search do not change.
- Global search queries, grouping, navigation, and result actions do not change.
- The first-run notice persists dismissal only through “I saved it”.
- Run-task context text, uploads, busy state, and submitted payload do not change.
- Attachment-warning Cancel/Continue behavior and task-prefill state do not
  change.
- File-manager create, move, rename, delete, async directory search, and form
  submission do not change.

Radix may improve modal semantics, background inertness, focus containment, and
focus return. Those are the intended accessibility ownership changes; they must
not introduce new business actions or new dismissal paths.
