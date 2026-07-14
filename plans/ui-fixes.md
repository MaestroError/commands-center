# UI fixes implementation plan

## Scope

Implement the following TickTick tasks on `codex/ui-fixes`:

- `6a552de6ebf291052131c133` — Hide add as artifact button in create task
- `6a550a16575a11052131a60b` — Add specialist in template tools
- `6a563e94fcd411c45aba4440` — Display filename after document title
- `b2d341579e2b945de457c5c9` — Display both reason and question in task review notification
- `272946ad92b2261b4865bdb5` — Remove DANGER badges from prompts tab and name it Prompts
- `6a43da752e7c11029e1e8b40` — Rename Retry to Rerun

These are presentation-only changes. They require no database or filesystem migration, no new dependency, and no portable workspace state change.

## Assumptions

- Template-tool rows should show the assigned specialist and the template cadence. Repeating templates use the existing repeat-summary formatter; non-repeating templates display `Manual`.
- “Filename” means the final filename segment such as `research.md`, not the full relative path.
- The prompts task applies to the conversation context-pane tab shown in the supplied screenshot. The Settings page keeps its existing `System Prompts` label and danger guidance because that surface edits workspace-wide prompt files.
- “Rerun” applies anywhere the operator starts an already-run task again, including failed/review board cards and the full task detail panel. Automatic retry diagnostics and subtask-specific actions keep their existing wording.

## Confirmed current behavior

- `WorkspaceFilesTab` renders an Add as artifact action whenever each tree node receives a callback. Its root nodes were always given an internal wrapper callback, even when `TaskFormPage` did not supply `onAddArtifact`, so the task form exposed a no-op action.
- API token template options are reduced to only `{ id, title }`, even though the existing task-template query includes `defaultAgentId` and `recurrence` and the page already loads specialists.
- The Documents editor header renders `selectedDoc.title` and an optional description. The response already includes `relativePath`, so the filename can be derived in the frontend without an API change.
- `ActivityCard` currently chooses the review question instead of `activity.body`, while task review activity creation already stores the reason in `body` and the question in the typed payload.
- The conversation context-pane tab is labelled `System Prompts`, and the chat-specific `SystemPromptsTab` renders a DANGER badge from `prompt.danger`.
- `TaskPanelPrimaryActions` labels failed/review queue actions `Retry`; the same word is also used on compact board cards.

## Implementation tasks

### 1. Protect the task form from artifact actions

- Add a focused task-form regression test in `packages/frontend/src/pages/TasksPage.test.tsx` (or a smaller `TaskFormPage.test.tsx` if isolation is cleaner) that selects a specialist, loads a file row, and asserts no `Add <filename> as artifact` control is present.
- Preserve the optional-callback design in `packages/frontend/src/components/workspace/WorkspaceFilesTab.tsx`, but only pass the internal wrapper to tree nodes when the caller supplied `onAddArtifact`. Chat supplies it; task create/edit does not.
- Retain the positive `WorkspaceChatPage` and `WorkspaceFilesTab` coverage proving the action still appears and works in chat.

Verification: create and edit task routes never expose the artifact action, while chat file rows still do.

### 2. Add specialist and cadence to API token template tools

- Expand the local `TemplateOption` in `packages/frontend/src/pages/ApiPage.tsx` to carry the resolved specialist name and a display cadence.
- Build each option from the existing task-template and specialist query results. Resolve `defaultAgentId` through the already loaded specialists, falling back to the ID if the specialist is unavailable.
- Reuse `readAgentName` and `formatRepeatSummary` from `packages/frontend/src/components/tasks/task-format.ts`; display `Manual` when `template.recurrence` is absent.
- Change each checkbox row into a small themed text stack: template title as the primary line and `Specialist name · cadence` as muted secondary text. Keep the label wrapping the checkbox so its hit target and accessible name remain intact.
- Extend `packages/frontend/src/pages/ApiPage.test.tsx` with separate assertions for specialist display, repeating cadence, and manual cadence while preserving token selection/submission coverage.

Verification: similarly named template tools can be distinguished by assigned specialist and schedule without changing token permission payloads.

### 3. Display the filename after the document title

- Update the editor header in `packages/frontend/src/pages/DocumentsPage.tsx` to derive the filename from `selectedDoc.relativePath` and render it immediately after the title using the existing small muted-note style (`text-xs` and theme text tokens).
- Keep the title as the semantic heading and make the filename visually secondary. Preserve truncation for long titles/filenames and leave the optional description on its own line.
- Extend `packages/frontend/src/pages/DocumentsPage.test.tsx` to assert a nested document shows its title and final filename segment together, without exposing the full relative path in the header.

Verification: a document titled `Quarterly Research` at `notes/research.md` shows `Quarterly Research` followed by `research.md` in the editor header.

### 4. Show both review reason and question in notifications

- Refactor the review content branch in `packages/frontend/src/components/activities/ActivityCard.tsx` so non-compact review cards render `activity.body` when present and the parsed review question when present; neither field suppresses the other.
- Reuse the current Markdown rendering for the reason and the existing accent question container. Avoid duplicating or moving payload parsing into the backend because both values already arrive through established fields.
- Preserve existing behavior for reason-only, question-only, non-review, compact, and read-only cards.
- Replace the test that expects the question to hide the reason in `packages/frontend/src/components/activities/ActivityCard.test.tsx` with focused cases for both-present, reason-only, and question-only rendering.

Verification: a task review notification containing a reason and a question visibly shows both, while missing fields simply do not render.

### 5. Rename the chat tab to Prompts and remove its DANGER badges

- Change the conversation context-pane tab label from `System Prompts` to `Prompts` in `packages/frontend/src/pages/WorkspaceChatPage.tsx`.
- Remove the DANGER badge markup from `packages/frontend/src/components/chat/SystemPromptsTab.tsx`. Keep prompt toggles, expanded bodies, empty-state text, and Edit in Settings behavior unchanged.
- Do not remove `danger` from shared schemas or backend prompt definitions, and do not remove the Settings editor's danger note; those semantics remain useful on the workspace-wide editing surface.
- Update `packages/frontend/src/pages/WorkspaceChatPage.test.tsx` to expect `Prompts`, and update `packages/frontend/src/components/chat/SystemPromptsTab.test.tsx` to assert danger-tagged prompts render without a DANGER badge while retaining the empty prompt hint and toggle behavior.

Verification: the chat context pane reads `Files`, `Uploads`, `Tools`, `Prompts`, and no prompt row displays DANGER.

### 6. Rename task run-again actions from Retry to Rerun

- Change the failed and review labels in `TaskPanelPrimaryActions` within `packages/frontend/src/pages/tasks/TaskDetailPanel.tsx` from `Retry` to `Rerun`.
- Change the failed and review action labels in `TaskCardActions` within `packages/frontend/src/pages/tasks/TaskBoard.tsx` from `Retry` to `Rerun`.
- Keep the action handler and queue endpoint unchanged; this is copy only.
- Update focused board-card coverage and add panel coverage in `packages/frontend/src/pages/TasksPage.test.tsx` for both failed and review tasks, asserting `Rerun` is present and triggers the existing queue request.
- Leave automatic retry status text and subtask-specific retry wording unchanged.

Verification: failed/review board cards and their detail panels show `Rerun`, and clicking it queues the task exactly as before.

## Required verification

1. Run ESLint with fixes on every touched TypeScript/TSX file, for example `pnpm exec eslint --fix <touched files>`.
2. Run the focused Vitest files while implementing:
   - `packages/frontend/src/pages/ApiPage.test.tsx`
   - `packages/frontend/src/pages/DocumentsPage.test.tsx`
   - `packages/frontend/src/components/activities/ActivityCard.test.tsx`
   - `packages/frontend/src/components/chat/SystemPromptsTab.test.tsx`
   - `packages/frontend/src/pages/WorkspaceChatPage.test.tsx`
   - `packages/frontend/src/pages/TasksPage.test.tsx`
3. Run `pnpm typecheck`.
4. Run the full unit/integration suite with `pnpm test`.
5. Run `pnpm test:e2e` as required by repository instructions.
6. Run the repository formatting check/fix command and review the final diff for unrelated changes.

## Acceptance criteria

- Task create/edit file panels do not show Add as artifact, while chat file panels still do.
- API token template-tool choices show template title, assigned specialist, and repeating/manual cadence.
- The Documents editor header shows the document filename as muted secondary text after its title.
- Review notifications show both reason and question whenever both are provided.
- The conversation tab is named Prompts and its prompt rows show no DANGER badges; Settings danger guidance remains intact.
- Failed/review task board cards and detail panels say Rerun and retain the existing queue behavior.
- Lint, typecheck, unit/integration tests, and Playwright E2E tests pass.

## Delivery constraints

- Keep all styling on existing theme-backed classes and tokens.
- Do not add dependencies or persistence changes.
- Do not commit, push, or open a pull request without explicit user approval.

## Implementation status

- [x] Protect the task form from artifact actions.
- [x] Add specialist and cadence to API token template tools.
- [x] Display the filename after the document title.
- [x] Show both review reason and question in notifications.
- [x] Rename the chat tab to Prompts and remove its DANGER badges.
- [x] Rename task run-again actions from Retry to Rerun.
- [x] Pass focused tests, typecheck, lint, full unit/integration tests, and Playwright E2E tests.
- [x] Pass formatting checks for all files changed by this implementation. The repository-wide check also scans an unrelated ignored `.claude/worktrees` checkout containing a pre-existing formatting issue.

## Follow-up layout correction

- [x] Render review artifacts after the reason and before the question so the question remains adjacent to its suggested replies and reply form.
- [x] Add a DOM-order regression test covering reason → artifacts → question.
- [x] Rerun focused tests, ESLint with fixes, typecheck, and formatting checks.

## Review question section

- [x] Group the review question, suggested replies, reply input, and actions inside one themed section.
- [x] Prefix the question with `Q:` and increase it from extra-small to small emphasized text.
- [x] Keep the reason, artifacts, and acceptance criteria above the grouped question section.
- [x] Add regression coverage for section grouping, question emphasis, and preserved reply behavior.
- [x] Rerun focused tests, ESLint with fixes, typecheck, and formatting checks.

## Private activity artifact links

- [x] Preserve enriched activity artifact metadata such as `fileManagerPath` instead of stripping it to the legacy task-run shape.
- [x] Reuse the shared `buildArtifactHref` helper so private specialist files and documents follow the same routing rules as task details and chat results.
- [x] Add regression coverage for a private artifact resolving to `specialists/testing-agent/Documents/references/tools-list.md`.
- [x] Preserve fallback behavior for legacy activity artifacts that only contain `type`, `title`, and `link`.
- [x] Rerun focused tests, ESLint with fixes, typecheck, and formatting checks.
