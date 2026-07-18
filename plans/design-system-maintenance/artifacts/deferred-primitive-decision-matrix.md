# Deferred Primitive Decision Matrix

Status: Complete and verified from the live tree on 2026-07-18.

## Decisions

| Candidate | Decision    | Live evidence                                                                                                      | Immediate scope                                                                                                                   |
| --------- | ----------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Textarea  | Add         | 14 `cc-input` textareas share the Input field contract across 10 exact paths                                       | Add a typed native wrapper and migrate all 14 consumers plus the gallery                                                          |
| Select    | Reuse       | The completed Select matrix records seven searchable and seven fixed consumers                                     | Retain `SearchableSelect` and the copy-owned Radix Select; add no new API                                                         |
| Badge     | Add         | Provider and MCP surfaces repeat the same compact label contract with neutral, success, warning, and danger roles  | Add a typed semantic Badge and migrate every `cc-badge` consumer plus the gallery                                                 |
| Pill      | Defer       | Rounded metadata, filters, counters, and actions differ in interaction, sizing, and meaning                        | Activate only when two consumers share role, variants, sizing, and accessibility behavior                                         |
| Status    | Reuse/defer | Task status already has the domain-owned `StatusBadge`; other states are readable text labels                      | Keep domain status mapping explicit; activate a generic status abstraction only when two domains share announcements and variants |
| Tooltip   | Add         | `TaskBoard.tsx` hand-rolls five hover/focus tooltip compositions with repeated positioning and visibility behavior | Add the copy-owned Radix Tooltip and migrate all task-board compositions                                                          |

## Textarea disposition

The typed Textarea owns the existing field surface, theme roles, ref forwarding,
and native textarea attributes. The 14 immediate consumers are:

- `components/chat/QuestionDock.tsx` (1)
- `components/documents/DocumentCreateDialog.tsx` (1)
- `components/specialists/SpecialistForm.tsx` (1)
- `components/tasks/RunTaskContextDialog.tsx` (1)
- `components/tasks/task-feedback-section.tsx` (2)
- `pages/DocumentsPage.tsx` (1)
- `pages/integrations/mcp-server-dialog.tsx` (2)
- `pages/tasks/TaskDetailSections.tsx` (2)
- `pages/tasks/TaskFormPage.tsx` (1)
- `pages/tasks/TaskTemplateFormPage.tsx` (2)

Five specialized native textareas remain intentionally domain-owned:
`ActivityActions`, `ChatComposer`, `LiveRequestPane`, `LiveRequestReviewForm`,
and `TaskPromptComposer`. They integrate bespoke surfaces, sizing, keyboard or
mention behavior and do not consume the compatibility field class.

## Badge disposition

Badge is a non-interactive compact text label. Its variants communicate
neutral, success, warning, or danger meaning through readable text as well as
theme color. Immediate consumers are provider connection state, MCP runtime
state, MCP suggestion authentication type, and the design-system gallery.
Rounded buttons, counters, task timing metadata, tags, and task-domain
`StatusBadge` remain outside this primitive.

## Tooltip disposition

Tooltip owns supplementary hover/focus content, portal placement, delay, Escape
dismissal, and pointer behavior. It never supplies the trigger's accessible
name. The immediate task-board consumers are column descriptions, latest result
previews, subtask previews, assignee names, and icon-action labels.
