# Task panel artifact sharing and manual chat artifacts

## Goal

Let users share file artifacts directly from the task panel through the existing public render/download URL flow, and let users register any file shown in a chat page's Files tree as an artifact for that exact conversation (regular chat or task-run chat).

Chat Results uses a compact copy-only presentation for generated share links so long signed URLs do not expand the narrow sidebar. Task artifact cards continue showing the full URLs.

Copy confirmation is temporary: a copied button returns to its normal “Copy” label after 2.5 seconds.

## Assumptions and scope

- “Two types” of public URL means the existing render/display URL and download URL returned by the artifact share-link API.
- Sharing applies to file artifacts. URL artifacts already point to a public destination; document artifacts keep their current behavior unless product requirements later define document publishing.
- “Add as artifact” uses the selected conversation ID, not the specialist's current/active conversation. This is required for historical chats and task-run conversations to behave correctly.
- The file's name becomes the artifact title and its specialist-workspace-relative path becomes the file artifact link. No metadata dialog is added.
- Re-registering the same file is allowed unless the existing artifact service already enforces uniqueness; no new deduplication policy is introduced.

## Implementation plan

1. Add an explicit conversation artifact registration API.
   - Add `POST /api/conversations/:conversationId/artifacts` beside the existing list route.
   - Validate the body with the existing `addArtifactInputSchema`, call `artifactService.create` with the route conversation ID, and return `artifactSchema`.
   - Rely on the artifact service/conversation relationship for both normal and task-run chats; add an existence check if the service currently permits orphaned conversation IDs.
   - Add route tests for successful file registration, exact conversation anchoring, invalid input, and a missing conversation.
   - Verify: the created artifact is returned by `GET /api/conversations/:conversationId/artifacts` and is absent from another conversation.

2. Expose the registration operation in the frontend data layer.
   - Add a typed API client using the shared input/output schemas.
   - Add a focused mutation hook that invalidates `queryKeys.conversationArtifacts(conversationId)` after success so the Results panel updates immediately.
   - Add API-client and hook tests, including URL encoding and cache invalidation.
   - Verify: a successful mutation refreshes only the target conversation's artifact list.

3. Add the file-only “Add as artifact” action to the chat Files tree.
   - Pass the loaded `conv.conversation.id` from `WorkspaceChatPage` into `WorkspaceFilesTab`; the same page/layout covers regular conversations and task-run conversations.
   - Extend file tree rows with a themed, Lucide-based icon button shown only when `node.type !== "directory"`.
   - On click, register `{ title: node.name, type: "file", link: node.path }`, stop row propagation, show pending/disabled state per file, and surface success/failure accessibly without disturbing existing open/delete/drag actions.
   - Keep folders ineligible and preserve the file path in the specialist-relative form already used by chat artifact registration.
   - Extend `WorkspaceFilesTab` and `WorkspaceChatPage` tests for visibility, folder exclusion, payload/conversation ID, pending behavior, success refresh, errors, and both normal/task-run route contexts.
   - Verify: clicking the icon adds the file to the current chat's Results list without a page reload.

4. Preserve canonical artifact data through task-panel aggregation and reuse the existing share UI.
   - Update both task artifact aggregation helpers/surfaces currently used by `TaskDetailPanel` and `TaskDetailPage` so each aggregated entry retains the latest canonical `Artifact` (ID, conversation ID, file-manager path, and share links), not just the legacy display fields.
   - Render `ArtifactShareControls` on each eligible task-panel artifact card and pass the owning task ID so existing task-run queries are invalidated after create/revoke.
   - Continue grouping identical `type + link` artifacts across runs; sharing targets the newest canonical artifact represented by the aggregate.
   - Reuse the existing generated-link rows, which reveal both render and download URLs with individual copy buttons, plus existing active-link/revoke behavior.
   - Add/update helper and task-page tests for aggregation identity, share-button visibility, two generated URLs, copy actions, existing links, and URL-artifact exclusion.
   - Verify: the screenshot's task artifact card can create a public link and displays both copyable URL variants.

5. Run quality and regression checks.
   - Run ESLint with `--fix` for touched packages/files as required by the repository.
   - Run focused shared/backend/frontend Vitest suites, then the full test command, typecheck, and the new Playwright flows described below.
   - Confirm styling uses existing theme tokens/classes and no persistence migration is needed: artifacts remain conversation-anchored in SQLite and published file metadata remains in the existing portable workspace manifest.

## Long-term verification test matrix

These tests are part of the implementation, not optional manual checks. Prefer assertions against accessible roles/names and `data-testid` only where an interaction has no stable semantic selector.

### Backend contract and integration tests

- `POST /api/conversations/:conversationId/artifacts` returns `200` with the canonical artifact ID, requested metadata, conversation ID, created timestamp, file-manager path, and empty share-link collection.
- A manually added artifact appears in the target conversation's subsequent artifact list and never appears in another conversation's list.
- Registration works when the target conversation is attached to a task run, proving the route does not depend on an active normal-chat session.
- A nonexistent conversation returns the established not-found response and creates no artifact row.
- An empty title/link, unsupported type, or malformed URL artifact returns a validation error and creates no artifact row.
- File paths remain specialist-workspace-relative in the stored artifact while the response exposes the correct file-manager path.
- Existing share-link integration coverage is exercised through an artifact created by the new route: creation publishes the file, returns distinct render and download URLs, both public endpoints serve the expected content/disposition, revocation disables both URLs, and configured expiry remains honored.

### Frontend API and query tests

- The API client URL-encodes conversation IDs and parses both request and response with shared schemas.
- A successful add-artifact mutation invalidates only `conversationArtifacts(targetConversationId)`.
- A rejected mutation does not invalidate artifact data and exposes the backend error to the caller.
- Existing create/revoke share mutations continue invalidating both the owning conversation and, when supplied, the owning task's runs.

### File-tree component regression tests

- Each file row exposes an accessible `Add <filename> as artifact` icon button; directory rows never expose it, including nested directories.
- Clicking the action sends exactly the current conversation ID and `{ title: filename, type: "file", link: specialistRelativePath }`.
- Clicking the action neither selects/opens the file nor triggers the row's drag, delete, or file-manager actions.
- Only the clicked file action is disabled while pending, preventing duplicate submission without blocking unrelated file rows.
- Success is announced accessibly and the action remains usable afterward; failure displays an accessible error and permits retry.
- Existing tree behaviors—expand/collapse, quick open, show location, move, upload, and delete—retain their current tests after the new action is inserted.

### Task artifact component and helper regression tests

- Aggregation still groups by `type + link`, counts distinct runs once, and selects the newest run using completion/update time.
- The aggregate retains the newest canonical artifact's ID, conversation ID, file-manager path, and active share links; the share mutation receives that exact ID.
- File artifacts display the share action in both `TaskDetailPanel` and `TaskDetailPage`; URL artifacts do not display it, and document behavior matches the stated scope.
- Creating a share renders both returned values under stable labels (`Render URL` and `Download URL`) with separate copy buttons.
- Each copy button writes its own full URL and reports copied state independently; clipboard failure leaves the URLs visible and usable.
- Existing active share links remain listed after rerender/refetch and can be revoked; backend errors remain visible without removing existing links.
- Passing the task ID causes task-run data to refresh so regenerated share state is not lost when navigating between task sections.
- Chat Results hides the generated render/download URL text while retaining labeled copy buttons that copy the complete values; task artifact surfaces retain the full URL presentation.
- Copy feedback resets after 2.5 seconds and switching between render/download copy actions does not leave stale confirmation state.

### Playwright end-to-end tests

- Regular chat: create/open a chat, create a workspace file, click its Files-tab artifact action, observe it in Results without reloading, create a share, and verify both copyable public URLs are displayed.
- Task-run chat: open a task-run conversation, add a workspace file as an artifact, verify it belongs to that run conversation and appears in both chat Results and the parent task artifact panel.
- Task panel: create a public share from the aggregated artifact card, verify the render URL displays the file and the download URL downloads the same bytes, then revoke and verify public access is rejected.
- Isolation: add similarly named files to two conversations and verify neither chat's Results list leaks the other conversation's artifact.
- Persistence: reload the browser after registration/share creation and verify the artifact and active share-link state are restored from backend data.

### Required verification commands

- `pnpm eslint --fix <touched files>` (or the repository's equivalent filtered lint command)
- Focused Vitest commands for every changed backend/frontend test file
- `pnpm typecheck`
- `pnpm test`
- The focused Playwright spec(s) covering the regular-chat, task-run-chat, and task-panel flows

Any test that discovers a regression must remain as a permanent test with the fix; do not rely on a one-time manual verification for these behaviors.

## Expected touch points

- `packages/backend/src/routes/conversations.ts` and route tests
- `packages/backend/src/services/artifact-service.ts` and service tests if conversation validation belongs there
- `packages/frontend/src/lib/api/tasks.ts` and API tests
- `packages/frontend/src/hooks/use-tasks-query.ts` and hook tests
- `packages/frontend/src/pages/WorkspaceChatPage.tsx` and tests
- `packages/frontend/src/components/workspace/WorkspaceFilesTab.tsx` and tests
- `packages/frontend/src/pages/tasks/TaskDetailPanel.tsx`
- `packages/frontend/src/pages/tasks/task-helpers.ts`
- `packages/frontend/src/pages/TaskDetailPage.tsx`
- `packages/frontend/src/pages/task-detail/task-detail-helpers.ts`
- Existing `ArtifactShareControls` tests, with component changes only if a compact task-card presentation is necessary

## Acceptance criteria

- Every file artifact card in the task panel offers the existing share action.
- Creating a share exposes both public render and download URLs, each with a working copy button.
- Existing active links remain visible/revocable and generated links honor the configured expiry policy.
- Every file row, and no folder row, in a chat page's Files tab has an “Add as artifact” icon button.
- Manual registration attaches to the exact open conversation for both regular chats and task-run chats and appears promptly in Results.
- Existing artifact opening, file-tree editing/dragging/deletion, task aggregation, and artifact sharing flows remain covered and passing.
