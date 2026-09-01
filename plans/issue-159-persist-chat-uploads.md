# Persist Direct-Chat Uploads Implementation Plan

**Goal:** Preserve every accepted direct-chat attachment as a private portable workspace file and let the calling specialist list the current chat's files through `cc_default_list_uploaded_files`.

**Architecture:** Add a backend `chat-upload-service` that decodes the existing inline data URLs, writes immutable server-named files beneath the owning chat archive directory, and atomically maintains a validated per-chat manifest. `ConversationService` wraps synchronous prompts, streaming prompts, and attachment-bearing commands in this persistence transaction while continuing to send the original inline attachment objects to OpenCode. A chat-only MCP tool resolves the specialist's current chat server-side and returns validated manifest entries with readable absolute paths.

**Tech Stack:** Node.js filesystem APIs, Zod, Fastify/Drizzle ownership lookup, MCP SDK tool definitions, Vitest.

**Source:** [GitHub issue #159](https://github.com/MaestroError/commands-center/issues/159)

## Global Constraints

- Keep the existing direct-chat attachment request schemas and inline OpenCode delivery unchanged.
- Store files at `sessions/specialists/<agent-id>/chats/<conversation-id>/uploads/<server-id>.<safe-extension>` with mode `0600`.
- Store portable metadata on the filesystem, not only in SQLite.
- Never derive directories or storage basenames from an original filename.
- Persist uploads independently of transcript archive preferences.
- Roll back uploads when OpenCode does not accept the prompt or command.
- Preserve task-context attachment handling, media previews, historical chats, Start Fresh, artifacts, and deletion restrictions.
- Do not add dependencies, migrations, public URLs, artifact registration, or historical-conversation enumeration.

## Task 1: Portable Chat Upload Storage

**Files:**

- Create: `packages/backend/src/services/chat-upload-service.ts`
- Create: `packages/backend/test/services/chat-upload-service.test.ts`

**Interfaces:**

- `createChatUploadService({ config, logger? })`
- `persist({ agentId, conversationId, attachments }): Promise<{ uploads, rollback }>`
- `list({ agentId, conversationId }): Promise<ChatUploadFile[]>`
- `ChatUploadFile` contains `id`, `filename`, `mimeType`, `sizeBytes`, `storageKey`, `createdAt`, and `absolutePath`.

- [ ] Write tests proving multiple same-name uploads produce distinct files with exact bytes and mode `0600`.
- [ ] Write tests proving unsafe or missing extensions use a safe generated extension without changing accepted MIME normalization.
- [ ] Write tests proving no-attachment sends create no directory or manifest.
- [ ] Write tests proving rollback removes new manifest records and files without affecting earlier uploads.
- [ ] Write tests proving corrupt manifests, missing files, traversal-shaped storage keys, and cross-chat paths fail safely.
- [ ] Implement strict data-URL decoding, effective MIME normalization, generated IDs, descendant checks, exclusive private file writes, atomic private manifest writes, deterministic newest-first listing, and serialized per-chat manifest mutation.
- [ ] Run `pnpm --filter @cc/backend test -- chat-upload-service.test.ts`.

## Task 2: Direct-Chat Send Transactions

**Files:**

- Modify: `packages/backend/src/services/conversation-service.ts`
- Modify: `packages/backend/test/services/conversation-service.test.ts`
- Modify: `packages/backend/test/services/conversation-service-methods.test.ts`

**Interfaces:**

- Inject optional `chatUploadService` into `createConversationService`, defaulting to the production filesystem service.
- Only `sendPrompt`, `sendPromptAsync`, and `sendCommand` call `persist`; task-run prompt methods remain unchanged.

- [ ] Add focused tests for synchronous prompt, asynchronous prompt, and command persistence before OpenCode delivery.
- [ ] Add focused tests that each OpenCode rejection invokes rollback and returns the original safe request failure.
- [ ] Add a no-attachment regression proving no storage call occurs.
- [ ] Persist immediately before the OpenCode request, pass the original parsed attachment array unchanged, and roll back on every thrown request failure.
- [ ] Verify Start Fresh retains old directories and existing archive removal deletes an owning chat's upload subtree only.
- [ ] Run the focused conversation service tests.

## Task 3: Current-Chat MCP Discovery

**Files:**

- Modify: `packages/backend/src/mcp/cc-managed/groups/cc-default/tools/artifact-tools.ts`
- Modify: `packages/backend/src/mcp/cc-managed/server-registry.ts`
- Modify: `packages/backend/src/system-prompts/definitions/global-chat.ts`
- Modify: `packages/backend/test/mcp/cc-managed/artifact-tools.test.ts`
- Modify: `packages/backend/test/services/task-permission-service.test.ts`
- Modify: `packages/backend/test/system-prompts/system-prompt-service.test.ts`

**Interfaces:**

- Tool name: `list_uploaded_files`
- Input: strict empty object
- Output: `{ files: ChatUploadFile[] }`
- Ownership: exact `agentSlug` to active specialist to current `source="chat"` conversation; no caller-supplied IDs.

- [ ] Add tool tests for newest-first current-chat results, empty results, another specialist, historical chat exclusion, invalid metadata, and no current chat.
- [ ] Register tool metadata as `context: "chat"` so task-run permission generation denies it.
- [ ] Add catalog and prompt guidance assertions.
- [ ] Implement tool registration and concise specialist guidance for operator-referenced uploads.
- [ ] Run the focused MCP, permission, catalog, and system-prompt tests.

## Task 4: Full Verification and Delivery

- [ ] Run `pnpm format:fix` and inspect formatting-only changes.
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm knip`, and `pnpm design-system:audit`.
- [ ] Detect Playwright's configured Chromium executable and system Chromium/Chrome before running `pnpm test:e2e`; skip locally if none is usable and rely on CI E2E.
- [ ] Run `git diff --check`, inspect the complete `origin/staging...HEAD` diff, and verify only issue #159 files are present.
- [ ] Commit intended files, push the new branch, and open one linked draft PR targeting `staging`.
- [ ] Remove `AI-in-progress` only after the push and draft PR both succeed; do not restore `AI-ready`.
- [ ] Record the branch and PR in `Activity/commands-center.md` and register issue/PR artifacts with the task run.
