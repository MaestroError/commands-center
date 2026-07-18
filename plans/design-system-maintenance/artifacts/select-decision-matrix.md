# Select Decision Matrix

Status: Complete and verified.

## Frozen baseline

The post-DSM-002 tree contained 14 browser-native `<select>` consumers across
nine exact paths. The visual review established two product contracts:

- dynamic, potentially long, or search-worthy option sets reuse the existing
  `SearchableSelect` composition; and
- short fixed enumerations use a CC-owned Radix Select primitive.

## Exact disposition

| Exact path                                           | Count | Contract         | Behavior retained                                     |
| ---------------------------------------------------- | ----: | ---------------- | ----------------------------------------------------- |
| `components/documents/DocumentsSidebarSection.tsx`   |     1 | SearchableSelect | disabled/loading state and specialist slug callback   |
| `components/live-requests/LiveRequestReviewForm.tsx` |     1 | SearchableSelect | required/optional state, stale ID, and field callback |
| `components/dev/DesignSystemBaselinePage.tsx`        |     1 | Radix Select     | deterministic default gallery value                   |
| `pages/BuiltInSkillsPage.tsx`                        |     1 | SearchableSelect | optional specialist assignment                        |
| `pages/BuiltInSkillsPage.tsx`                        |     1 | Radix Select     | three-value source filter                             |
| `pages/CustomToolsPage.tsx`                          |     1 | SearchableSelect | optional specialist tool scope                        |
| `pages/ProviderConnectionsPage.tsx`                  |     1 | Radix Select     | provider-defined prompt value and conditional prompts |
| `pages/integrations/mcp-server-dialog.tsx`           |     2 | Radix Select     | transport/auth callbacks and disabled auth state      |
| `pages/tasks/TaskFormPage.tsx`                       |     1 | SearchableSelect | required specialist and reference-reset callback      |
| `pages/tasks/TaskTemplateFormPage.tsx`               |     2 | SearchableSelect | required specialist and searchable timezone/test ID   |
| `pages/tasks/TaskTemplateFormPage.tsx`               |     2 | Radix Select     | repeat preset and repeat-frequency typed callbacks    |

## Final disposition

- Production and gallery code contain zero native `<select>` consumers.
- Seven dynamic consumers use `SearchableSelect`; optional consumers retain an
  explicit clearing option and required consumers validate committed values.
- Seven fixed consumers use `@/components/ui/select`; Radix remains isolated in
  the copy-owned primitive.
- `cc-input` drops from 30 to 17 total production occurrences. Exactly 14
  compatibility-styled textareas remain as DSM-003 Textarea evidence; Select
  no longer contributes a compatibility handoff.
- The audit rejects new native selects, undefined/raw accent foregrounds, and
  growth in the remaining exact Textarea handoffs.
