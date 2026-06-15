# Phase 2 — Chat: Sending & Inspecting System Prompts

Wire the Phase 1 service into the message path so the composed `system` string is
sent with **every** chat and task-run message, persist per-conversation toggles,
and add the two UI surfaces: the right-sidebar **System Prompts** tab and the
per-message **Show system prompts** modal.

Depends on Phase 1 (`SystemPromptService.resolveAll` / `listResolved`, CRUD API).
Read [`00-overview.md`](00-overview.md) for the composition + toggle contract.

---

## Backend

### 2.1 — Thread `system` through OpenCode calls

- [ ] `opencode-service.ts`: add optional `system?: string` to the inputs of
      `promptSession` and `promptSessionAsync`, and include `system` in the
      request body when present (`/session/:id/message` and
      `/session/:id/prompt_async`). The field is already supported by OpenCode
      (`SessionPromptData.body.system`).

### 2.2 — Per-conversation toggle storage

- [ ] DB: add `system_prompt_overrides_json TEXT` (nullable) to the
      `conversations` table (`db/schema/conversations.ts`). Generate the drizzle
      SQL migration (`pnpm drizzle-kit generate`, → `db/migrations/00xx_*.sql`).
- [ ] Repository/service helpers to read/write the overrides map
      (`Record<promptId, boolean>`), parsed/validated with a shared Zod schema.
      `null` ⇒ all defaults.

### 2.3 — Compose & send

- [ ] `conversation-service.ts`:
  - Inject `systemPromptService` (from `RuntimeContext`).
  - Add a private `buildSystemContext(agent, conversation, taskRun?)` returning a
    `SystemPromptRenderContext` (specialist name/slug/role/instructions from the
    loaded agent; conversation id; task fields when `source === "task_run"`).
  - `sendPrompt` / `sendPromptAsync` (chat): call
    `systemPromptService.resolveAll("chat", ctx, overrides)`, pass `system` to
    `opencodeService.promptSession*`.
  - `sendTaskRunPrompt` (task): call `resolveAll("task", ctx)` (no overrides —
    task runs use defaults), pass `system`.
  - **Per-message snapshot:** persist the returned `prompts`
    (`{ id, title, renderedBody, enabled }[]`) on the user message so the modal
    can show exactly what was sent. Store as
    `messages.system_prompt_snapshot_json` (new nullable TEXT column; include in
    the same drizzle migration as 2.2). Populate during
    `syncConversation`/message persistence for the just-sent user message.
- [ ] New API for conversation-scoped resolution + toggles:
  - `GET  /api/conversations/:conversationId/system-prompts` → `listResolved`
    for the conversation's scope with its overrides applied: each
    `{ id, title, description, danger, optional, enabled, renderedBody }`. Powers
    the sidebar tab.
  - `PATCH /api/conversations/:conversationId/system-prompts/:id` →
    `{ enabled: boolean }`; updates the overrides map; returns updated list.
- [ ] Extend `conversationMessageSchema` (shared) with optional
      `systemPromptSnapshot?: ResolvedSystemPrompt[]` so the snapshot reaches the
      client with the message.

> **Scope nuance:** chat conversations resolve scope `chat` (→ identity +
> global-chat + additional); task runs resolve scope `task` (→ identity +
> global-task + additional). Toggles only exist for chat.

---

## Frontend

### 2.4 — Right-sidebar "System Prompts" tab

- [ ] Add a third tab to the chat `contextPane` in `WorkspaceChatPage.tsx`
      (alongside `files` / `media`), id `system-prompts`, label "System Prompts".
- [ ] New component `components/chat/SystemPromptsTab.tsx`:
  - Query `GET /api/conversations/:id/system-prompts` (TanStack Query;
    add `useConversationSystemPromptsQuery`).
  - Render one card per prompt: title + danger badge (if `danger`), a toggle
    (enabled), and an expandable (collapsed by default) **read-only** rendered
    body. Empty `additional` shows an "empty / not configured" hint.
  - Toggle calls `PATCH .../system-prompts/:id`; optimistic update + invalidate.
  - A small "Edit in Settings" link (routes to the Settings System Prompts tab —
    Phase 3) for editing the underlying template.
- [ ] Add API client fns in `lib/api.ts`:
      `getConversationSystemPrompts`, `setConversationSystemPromptEnabled`.

### 2.5 — Per-message "Show system prompts" action

- [ ] In `MessageTimeline.tsx`, for **user** messages, render a 3-dots
      (`MoreVertical` from lucide) button **after** `MessageCopyButton` (same
      button group at `MessageTimeline.tsx:88-96`). Match the existing
      opacity/hover/`group-hover` styling of `ConvertToTaskButton`.
- [ ] Button opens a small menu with one item: **Show system prompts** (build a
      tiny menu or reuse an existing popover/menu primitive in
      `components/common`). Only enabled when the message has a
      `systemPromptSnapshot`.
- [ ] New component `components/chat/SystemPromptsModal.tsx`: a modal listing the
      message's `systemPromptSnapshot` as expandable **read-only** sections
      (title + rendered body). Mirror the existing modal styling
      (`ConversationHistoryModal.tsx` is a good reference). Close on overlay
      click / Esc.
- [ ] "carry this info in a closed manner": the prompt content is **not** shown
      inline on the bubble — only reachable via the 3-dots → modal.

> If a message predates the snapshot column (`systemPromptSnapshot` undefined),
> the menu item falls back to the conversation's current resolved prompts (same
> data as the sidebar) and notes "current configuration (not captured at send
> time)".

---

## Files touched / added

**Backend**

- `services/opencode-service.ts` (add `system` to prompt bodies)
- `services/conversation-service.ts` (compose + send + snapshot + overrides)
- `db/schema/conversations.ts` + new `db/migrations/00xx_*.sql`
- `routes/conversations.ts` (GET/PATCH conversation system-prompts)
- `schemas/conversations.ts` (snapshot on message; overrides schema)

**Frontend**

- `pages/WorkspaceChatPage.tsx` (third context tab)
- `components/chat/SystemPromptsTab.tsx` _(new)_
- `components/chat/SystemPromptsModal.tsx` _(new)_
- `components/chat/MessageTimeline.tsx` (3-dots menu)
- `hooks/use-conversation-system-prompts-query.ts` _(new)_
- `lib/api.ts` (client fns)

---

## Tests

- Backend: `conversation-service` composes & forwards `system` for chat and task;
  snapshot persisted on the user message; overrides PATCH flips enabled and
  changes the next composed string; default (null overrides) uses
  `enabledByDefault`. `opencode-service` includes `system` in the body only when
  provided.
- Migration: column added, existing rows read as `null`/defaults.
- Frontend: `SystemPromptsTab` renders prompts, toggles call the API
  (optimistic); `MessageTimeline` shows the 3-dots only on user messages and
  opens the modal; `SystemPromptsModal` renders snapshot sections read-only.

---

## Exit criteria

- Every chat & task message sends the composed `system` (verifiable via the
  OpenCode request body / a service spy).
- Disabling a prompt in the sidebar removes it from the **next** message's
  `system` (and re-enabling restores it), persisted across reloads.
- The 3-dots → Show system prompts modal shows the exact prompts sent with that
  message.
- Lint, typecheck, backend + frontend tests green.
