# Pending Interaction Rehydration + Cancel-from-Status-Dot

## Problem

1. **Lost interactive prompts.** Pending permissions, questions, and live requests exist only in
   in-memory React state (`use-conversation.ts`), populated exclusively by the per-conversation SSE
   stream. When the user navigates away from the chat page the SSE connection closes, so
   `question.asked` / `permission.asked` / `cc.live_request.opened` events fired while away are
   never received by the browser. On return, `HYDRATE` resets pending state to empty — the user has
   no way to answer or cancel, and the specialist blocks until timeout (live requests default to
   30 minutes, `DEFAULT_TIMEOUT_MS` in `packages/backend/src/services/live-request-service.ts`).

   The server, however, still holds all of this state the whole time:
   - OpenCode daemon: pending permissions/questions, queryable via
     `opencodeService.listPendingPermissions` / `listPendingQuestions`
     (`packages/backend/src/services/opencode-service.ts:555,575`). Already used for task runs via
     `listTaskRunPendingInteractions` (`packages/backend/src/services/conversation-service.ts:632`)
     — but never for regular chats.
   - `liveRequestService`: open live requests in an in-memory map, but only `get(id)` exists — no
     per-conversation listing.

   **Decision (confirmed with user):** backend rehydration, per-chat on open. No localStorage —
   the browser can't capture events that fire while the page is closed, and a client-side cache
   can go stale (prompt already answered/timed out server-side). The backend is the source of
   truth; the frontend re-fetches pending interactions whenever it (re)opens a conversation.

2. **No cancel affordance on tool rows.** Each tool row shows a colored status dot
   (`BasicTool.tsx`, `.tool-status--dot .sdot`). When a tool is blocked waiting on the user
   (permission/question), there is no way to cancel it from the tool row.

   **Decision (confirmed with user):** on hover the dot becomes a red "X" **only for tools blocked
   on user input** (matched via the pending interaction's `tool: { messageID, callID }`). Clicking
   it rejects the permission / rejects the question. Genuinely executing tools keep the plain
   pulsing dot (OpenCode has no per-tool-call cancel; the composer's Abort covers that).

---

## Part 1 — Backend: pending interactions endpoint for chat conversations

### 1.1 `live-request-service.ts`: add per-conversation listing — done

- [x] Added `listByConversation(conversationId: string): LiveRequest[]` — filters the `requests`
      map by `record.request.conversationId`.
- Verify: `live-request-service.test.ts` — create two requests in different conversations, list
  returns only matching, resolved/cancelled requests disappear. **8/8 → passing.**

### 1.2 `conversation-service.ts`: add `listPendingInteractions(conversationId)` — done

- [x] Added `mapPendingPermission` / `mapPendingQuestion` module-level helpers and refactored
      `listTaskRunPendingInteractions` to use them (no behavior change, removes duplication).
- [x] Added `listPendingInteractions(conversationId): Promise<PendingChatInteractions>` —
      `{ permissions: PendingChatPermission[]; question: PendingChatQuestion | null }`, filtered by
      `conversation.opencode_session_id`. `question` takes the first match (OpenCode serializes one
      active question per session).
- [x] `tool` (`{ messageID, callID }`) carried through on both permissions and the question.
- Verify: `conversation-service-methods.test.ts` — two new tests (filters by session, includes
  `tool`; returns `{ permissions: [], question: null }` when nothing pending). **7/7 passing.**

### 1.3 New route + shared schema — done

- [x] `packages/shared/src/schemas/chat-events.ts`: added `pendingPermissionSchema`,
      `pendingQuestionSchema`, `pendingInteractionsSchema` (`{ permissions, question, liveRequests }`,
      reusing `questionItemSchema` and `liveRequestSchema`), plus `PendingInteractions` /
      `PendingPermission` / `PendingQuestion` types. Exported from `schemas/index.ts`.
- [x] `packages/backend/src/routes/conversations.ts`: added
      `GET /api/conversations/:conversationId/pending-interactions` — calls
      `service.listPendingInteractions`, merges in
      `context.liveRequestService?.listByConversation(conversationId) ?? []` (mirrors how
      `routes/live-requests.ts` already accesses `context.liveRequestService` directly rather than
      threading it through the conversation service).
- Verify: `test/routes/conversations.test.ts` — two new tests (full rehydration incl. live
  request, and the no-live-request-service case returns `liveRequests: []`). **8/8 passing.**

### 1.4 Add `tool` to SSE event schemas (needed by Part 2) — done

- [x] `packages/shared/src/schemas/chat-events.ts`: added a shared `toolLinkSchema`
      (`{ messageID, callID }`, catchall-tolerant) and an optional `tool` field on
      `permissionAskedEventSchema` and `questionAskedEventSchema`.
- Verify: `conversation-events.schema.test.ts` — new tests parse events with and without `tool`,
  plus a `pendingInteractionsSchema` round-trip test. **8/8 passing.**

**Extra (folded into 1.4):** the schema accepting `tool` was inert for live SSE events until the
mapper that builds them was updated too. Added `sanitizeToolLink` to
`opencode-event-service.ts`'s `mapEvent` and forwarded `tool` on both `permission.asked` and
`question.asked` (only when it has string `messageID`/`callID`, otherwise omitted — same
defensive style as the rest of that mapper). Covered by a new test in
`opencode-event-mapping.test.ts` (well-formed tool forwarded, malformed tool dropped).

**Typecheck/lint/tests run for Part 1:** `pnpm --filter @cc/shared typecheck`,
`pnpm --filter @cc/backend typecheck`, `pnpm --filter @cc/frontend typecheck`,
`pnpm --filter @cc/shared lint`, `pnpm --filter @cc/backend lint` all clean.
`pnpm --filter @cc/backend test` → 118 files / 1056 tests passing.
`pnpm --filter @cc/shared test` → 9 files / 160 tests passing.

## Part 2 — Frontend: rehydrate pending interactions

### 2.1 API wrapper — done

- [x] `packages/frontend/src/lib/api/conversations.ts`: added
      `getPendingInteractions(conversationId): Promise<PendingInteractions>` using `requestJson` +
      `pendingInteractionsSchema`. Re-exported automatically via the `@/lib/api` barrel
      (`export * from "./api/conversations"` in `lib/api.ts`).

### 2.2 `use-conversation.ts`: fetch on conversation (re)open — done

- [x] Added `HYDRATE_PENDING` reducer action — replaces `pendingPermissions`, `pendingQuestion`,
      `liveRequests` wholesale from the fetched payload (not merged).
- [x] Extended local `PermissionRequest` / `QuestionRequest` types with optional
      `tool?: { messageID: string; callID: string }` (new `ToolLink` type alias).
- [x] In the SSE-connection effect, `getPendingInteractions` is now fired at the very top of the
      async IIFE, immediately before entering the `for await` loop that subscribes to the SSE
      stream — both requests go out on the same tick, so there's effectively no gap where an event
      could fire unobserved. Any overlap between the one-shot fetch and a live SSE event is
      harmless: `HYDRATE_PENDING` replaces wholesale, and the existing SSE_EVENT handlers
      (`permission.asked` / `cc.live_request.opened`) already upsert by id.
- [x] Auto-approve interplay: rehydrated permissions are auto-replied `"once"` and excluded from
      the dispatched `HYDRATE_PENDING` payload when `autoApproveRef.current` is true — mirrors the
      existing live-SSE auto-approve path exactly (never shown to the user).
- Verify:
  - `use-conversation.test.ts` (pure reducer) — new `HYDRATE_PENDING` (wholesale replace, clears to
    empty when nothing pending), `DISCARD_STALE_PERMISSION`, `DISCARD_STALE_QUESTION` describe
    blocks. **53/53 passing** (47 pre-existing + 6 new).
  - `use-conversation-hook.test.tsx` (rendered hook, mocked `@/lib/api`) — new
    "pending interaction rehydration" describe block: rehydrates permission/question/live-request
    on open, auto-approves rehydrated permissions without surfacing them, keeps a permission
    pending on a non-stale failure. **15/15 passing** (9 pre-existing + 6 new). Had to add
    `getPendingInteractions: vi.fn()` to the existing `vi.mock("@/lib/api", ...)` factory in this
    file — the 3 pre-existing tests that render the hook were failing without it (the new
    unconditional call threw synchronously inside the SSE effect's try block, silently aborting the
    whole effect before the `for await` loop ever started).

### 2.3 Page behavior — confirmed, no new test added

- `WorkspaceChatPage.tsx` was not touched; it only reads `conv.pendingPermission` /
  `conv.pendingQuestion` / `conv.liveRequests` off the hook's return value and has no logic that
  depends on where that state came from (SSE vs. rehydration). `WorkspaceChatPage.test.tsx` already
  mocks `useConversation` wholesale and already has tests asserting `PermissionDock`/`QuestionDock`
  render correctly when those fields are set — adding a page-level "mounts with a mocked
  pending-interactions response" test would mean unmocking the hook and re-mocking
  `getPendingInteractions`/`connectConversationEvents` at the page level, which is exactly what
  the new hook-level tests in 2.2 already cover. Skipped as redundant; full frontend suite
  (`pnpm --filter @cc/frontend test`) re-run clean with this file unchanged (110 files/1179 tests).

### 2.4 Handle stale replies gracefully — done, required a small backend addition

- **Backend gap found:** `replyPermission`/`replyQuestion`/`rejectQuestion` in
  `opencode-service.ts` forwarded straight to OpenCode's HTTP API via `requestOpenCodeJson`, which
  on any non-2xx threw a plain `Error` — not an `ApiError` subclass — so a stale/already-resolved
  request surfaced as a generic 500 "Internal server error", never an actual 404. The plan's
  "404/gone" premise didn't hold yet. Fixed as part of 2.4 rather than leaving it half-wired:
  - [x] Added `OpenCodeRequestError extends Error` (carries `status`) — thrown by
        `requestOpenCodeJson` instead of a plain `Error`.
  - [x] Added `withNotFoundRemap(requestId, run)` helper; wrapped `replyPermission`,
        `replyQuestion`, `rejectQuestion` with it — remaps a 404 from OpenCode to a proper
        `NotFoundError` (real 404 through the API), leaves every other status untouched.
  - Verify: `opencode-service.test.ts` — 2 new tests (404 → `NotFoundError` for all three calls;
    500 stays an unmapped `OpenCodeRequestError`). **38/38 passing.**
- [x] Frontend: added `ApiRequestError extends Error` (carries `status`) to `lib/api/client.ts`;
      `replyPermission`/`replyQuestion`/`rejectQuestion` in `lib/api/conversations.ts` now throw it
      instead of a plain `Error`.
- [x] `use-conversation.ts`: `replyPerm`/`replyQ`/`rejectQ` now catch and check
      `isStaleRequestError` (`ApiRequestError` with status 404 or 410) — on a stale error dispatch
      `DISCARD_STALE_PERMISSION` / `DISCARD_STALE_QUESTION`; any other error is left alone (the
      prompt stays, so the user can retry a transient failure instead of losing it).
- Verify: covered by the `use-conversation-hook.test.tsx` tests above (stale-permission,
  stale-question, and non-stale-keeps-pending cases).

**Typecheck/lint/tests run for Part 2:** `pnpm --filter @cc/shared typecheck`,
`pnpm --filter @cc/backend typecheck`, `pnpm --filter @cc/frontend typecheck` all clean.
`pnpm --filter @cc/backend test` → 118 files / 1058 tests passing.
`pnpm --filter @cc/frontend test` → 110 files / 1179 tests passing.

## Part 3 — Frontend: cancel from the status dot — done

### 3.1 Pending-interaction context (avoid prop drilling) — done

- [x] Context split into three files, matching this codebase's existing convention for contexts
      (`context/theme-context.ts` + `ThemeProvider.tsx` + `use-theme.ts`) rather than one combined
      file — a single file mixing the `createContext` call, the `Provider` component, and the
      `useCancellableTool` hook trips `react-refresh/only-export-components`:
  - `components/chat/tools/pending-interaction-context.ts` — `PendingToolInteraction` union,
    `PendingInteractionContextValue`, the `createContext` call.
  - `components/chat/tools/PendingInteractionProvider.tsx` — the provider component.
  - `components/chat/tools/use-cancellable-tool.ts` — `useCancellableTool(callId)`, returning a
    bound `() => void` cancel callback or `undefined` when the call isn't blocked / no provider is
    mounted.
- [x] `WorkspaceChatPage.tsx`: `pendingInteractionsByCallId` (`useMemo`, keyed off
      `conv.pendingPermissions` + `conv.pendingQuestion`) and `cancelPendingInteraction`
      (`useCallback`, dispatches `replyPermission(id, "reject")` / `rejectQuestion(id)`). Wrapped
      `<MessageTimeline>` in `<PendingInteractionProvider>`.
- [x] `useConversation` now returns `pendingPermissions: PermissionRequest[]` (the full queue)
      alongside the existing `pendingPermission` head + `pendingPermissionCount`. `PermissionRequest`,
      `QuestionRequest`, and `ToolLink` are now exported from `use-conversation.ts` for this.
- Regression caught: `WorkspaceChatPage.test.tsx` mocks `useConversation` wholesale, and its
  default fixture didn't include `pendingPermissions` — the new `for...of conv.pendingPermissions`
  in the memo threw `TypeError: ... is not iterable` across all 21 tests in that file until the
  fixture was updated to include `pendingPermissions: []`.

### 3.2 `BasicTool.tsx`: hoverable cancel dot — done

- [x] Added `getToolCallId(part)` to `tool-registry.ts` (`part["callID"]`) and threaded a new
      `callId` prop into `BasicTool` from `GenericTool`, `BashTool`, `TaskTool`.
  - **`ContextGroup` skipped, deliberately:** unlike the other three, it doesn't render via
    `BasicTool` and has no collapsed-row status dot at all (its per-item statuses — check/✗/spinner
    — only appear once already expanded, and read/glob/grep/list calls are the least likely tools
    to ever be permission-blocked). Retrofitting a dot it never had felt like scope creep for a
    renderer with no realistic reason to need it; can revisit if that assumption turns out wrong.
- [x] Restructured `BasicTool`: the status indicator moved from being nested _inside_ the
      `tool-trigger` `<button>` to a **sibling** in `.tool-row` (same approach the plan flagged as
      acceptable — avoids an invalid nested `<button>`, and `.tool-row`'s existing flex layout
      places it right after the trigger with no extra CSS needed, same as `CopyIdButton` already
      does). Net visual order shifts from [dot, chevron] to [chevron, dot] — a minor, acceptable
      trade-off for valid markup over pixel-identical placement.
  - When `status` is `pending`/`running` **and** `useCancellableTool(callId)` resolves to a cancel
    function, the dot renders as `<button class="tool-status ... tool-status--cancellable">`
    (`title="Cancel"`, `aria-label="Cancel tool call"`); otherwise it's the original non-interactive
    `<span>`.
  - Click handler calls `event.stopPropagation()` before `cancel()` so it can't also toggle the
    row's expand state (the trigger button is a sibling, not an ancestor, so this is now purely a
    safety net, not strictly required for correctness — but cheap insurance).
- [x] CSS added next to `.tool-status--dot` in `globals.css`: default state identical to the plain
      dot; `:hover`/`:focus-visible` swaps to a 14px red (`var(--danger)`) circle with a white
      `X` icon (wrapped in its own `.tool-status-cancel-icon` span so the circle's `width`/`height`
      don't collide with the icon's own Tailwind size classes); `:focus-visible` also gets a visible
      outline for keyboard users.
- Verify: new `BasicTool.test.tsx` (7 tests) — no cancel button with no provider mounted; none when
  the `callId` doesn't match a pending interaction; none for a `completed` tool even with a
  matching `callId`; renders + fires `cancel()` with the right interaction for a `pending`
  permission-blocked tool; clicking cancel does not also expand the row; the main trigger still
  toggles expansion normally. All existing tool-component tests (53) pass unmodified — the
  restructure didn't change any previously-asserted behavior.

### 3.3 SSE `tool` linkage — done (landed as part of Part 1)

- Already covered: `opencode-event-service.ts`'s `mapEvent` forwards `tool` on live
  `permission.asked`/`question.asked` events (added in Part 1 once the gap was found), and
  `use-conversation.ts`'s `applySseEvent` already stores whatever properties the event carries
  (`event.properties as unknown as PermissionRequest`), so `tool` flows through to
  `pendingPermissions`/`pendingQuestion` — and therefore to the context's `byCallId` map — without
  further changes.

**Typecheck/lint/tests run for Part 3:** `pnpm --filter @cc/frontend typecheck` clean; lint clean
(no errors; the one `react-refresh/only-export-components` warning from the first draft is gone
after splitting the context file). `pnpm --filter @cc/frontend test` → 111 files / 1186 tests
passing (was 110/1179 before Part 3: +1 file, +7 tests from `BasicTool.test.tsx`).

**Not done — manual/visual verification.** The CSS hover swap (dot → red circle + X) hasn't been
eyeballed in a live browser. Reaching a state with a real permission-blocked tool row requires the
full stack (claimed workspace, a specialist, a live OpenCode session, an actual tool call awaiting
permission) — a heavy setup relative to confirming a CSS `:hover` rule. The component tests do
verify every _behavioral_ aspect (when the button appears, what it's labeled, what it calls, that
it doesn't also expand the row); what's unverified is purely the visual treatment. Flagging this
per instructions rather than claiming a visual check that didn't happen — happy to spin up the dev
server and check this live if wanted, or the user can check with `Ctrl+Shift+D` (`DevDebugPanel`,
dev builds only) to inject a tool part + a matching `permission.asked` event once a chat is open.

## Part 4 — Wrap-up

- [x] `eslint --fix` (no errors on any touched file across all 3 parts), `pnpm typecheck` (shared,
      backend, frontend all clean), affected package tests
      (`pnpm --filter @cc/frontend test` → 111/1186, `pnpm --filter @cc/backend test` → 118/1058)
      all passing. Chat e2e suite not touched/run — no e2e specs reference pending-interaction
      rehydration or the tool cancel dot yet.
- [ ] Manual verification (see note above — not done): start a chat, trigger a question tool,
      navigate to another page, return → dock reappears; refresh mid-question → dock reappears;
      hover a permission-blocked tool's dot → red X, click → tool rejected and turn continues.

## Part 5 — Follow-up from live testing (done)

Manual testing surfaced three issues; all fixed.

### 5.1 Navigation froze while a live-request tab was open (the big one)

- **Root cause (pre-existing, unmasked by rehydration):** `WorkspaceChatPage`'s live-request →
  inspection-tab sync effect depended on the whole `inspection` object, which
  `useChatInspectionTabs` returns as a fresh object literal every render, so the effect ran every
  render. It calls `inspection.openLiveRequest(request)`, and the `open-live-request` reducer case
  for an _already-open_ tab always returned new state (`createLiveRequestTab` builds a fresh
  object). So with any live request pending: effect → dispatch → new state → re-render → new
  `inspection` → effect → ∞. The page never settled, so route changes and even sidebar toggles
  didn't render (URL changed via history, but React never committed) — exactly the reported freeze.
  **Confirmed empirically:** reverting just the reducer fix and running the new regression test
  pegged a vitest worker at ~97% CPU indefinitely.
- Fixes in `use-chat-inspection-tabs.ts` + `WorkspaceChatPage.tsx`:
  - [x] `open-live-request` reducer: return the **same state reference** when a tab for that request
        id already exists (live request content is immutable per id, so re-opening is a no-op). This
        alone breaks the loop.
  - [x] Stabilized the effect deps: destructure the useCallback-stable `openFile`/`openLiveRequest`/
        `removeLiveRequest` and `inspection.tabs` instead of depending on the whole `inspection`
        object, so the effect only runs when live requests or tabs actually change.
- Verify: new regression test in `WorkspaceChatPage.test.tsx` renders with a real (non-show-file)
  live request through the real `useChatInspectionTabs` hook and asserts the tab settles (has a
  `{ timeout: 5000 }` so a re-introduced loop fails fast instead of hanging). Reducer idempotency
  unit test in `use-chat-inspection-tabs.test.tsx` (repeat opens return the same tabs reference).

### 5.2 Tabs didn't reopen when returning to the chat (SPA navigation)

- Was a downstream symptom of 5.1: the render loop prevented the page from ever settling on the
  restored/rehydrated tabs, so only a full reload (which momentarily changed timing) showed them.
- [x] With the loop fixed, landing on the chat reopens tabs from Part 2 rehydration
      (`getPendingInteractions` → `conv.liveRequests` → sync effect opens the tabs) plus the existing
      sessionStorage seed — no reload needed. No new code beyond the loop fix.

### 5.3 Cancel-from-dot didn't work for live-request tools

- **Why it didn't work:** the blocking tools in the user's session (`cc_app_draft_task`,
  `cc_default_request_secret`) are **live-request** tools, not permission/question. Part 3 only
  keyed the cancel map by `tool.callID`, which live requests lack — the MCP tool that raises one
  never receives OpenCode's call id (confirmed: MCP `registerTool` handler only gets `(args)`, and
  OpenCode's callID isn't in the MCP request). So those dots weren't cancellable at all — rendered
  as plain spans, hence "no X on hover, click does nothing."
- [x] New `components/chat/tools/pending-interaction-map.ts` (`buildPendingInteractionMap`): keeps
      the exact callID match for permissions/questions, and **correlates live requests to the blocked
      tool rows by chronological order** — the most recent still-running tool calls line up with the
      open live requests sorted by `createdAt` (excludes ones already claimed by a permission/question,
      and `show_file_to_user` requests which auto-resolve). Exact in the common single-request case,
      order-preserving for concurrent ones.
- [x] `PendingToolInteraction` gained a `{ kind: "live-request"; requestId }` variant;
      `WorkspaceChatPage` uses the new builder and routes live-request cancels to
      `conv.cancelLiveRequest(id)` — identical to the tab's Cancel button (rejects the MCP tool's
      pending promise, same server path). Wrapped in `.catch(() => {})` since the request may already
      be gone when clicked.
- Once a dot is cancellable it renders as the `<button>`, so the existing hover CSS (red circle +
  X, `cursor: pointer`) now applies — addressing "make it red on hover + pointer."
- Verify: `pending-interaction-map.test.ts` (7 cases: permission/question callID match, single +
  multi live-request chronological alignment, tail-selection when more running tools than requests,
  completed/show_file exclusion, no double-mapping a permission-claimed call).

**Heuristic caveat (5.3):** live-request correlation is positional, not a hard link. If a
non-live-request tool were also running at the same instant as an open live request (uncommon,
since the turn is paused waiting on the request), the tail alignment could map a dot to the wrong
request. The precise fix would require OpenCode to expose the tool call id to MCP servers. Flagging
rather than hiding it.

**Tests/checks for Part 5:** `pnpm --filter @cc/frontend typecheck` + lint clean; full frontend
suite `pnpm --filter @cc/frontend test` → 112 files / 1195 tests passing.

## Part 6 — Second round of live-testing fixes (done)

### 6.1 Flaky tab reopening on return (intermittent)

- **Root cause:** live-request tabs were both seeded from `sessionStorage` _and_ driven by the
  Part 2 rehydration, and the two raced. `useChatInspectionTabs`'s `seed` action replaces the whole
  tab state on conversation-id change; depending on whether the seed or the async rehydration
  landed last (and the sync effect's removal-on-empty pass), the tab sometimes showed, sometimes
  not — "once opens, once doesn't."
- [x] Stopped persisting/restoring live-request tabs in `sessionStorage` (`toStoredState` +
      `createInitialState` now skip them). Live requests are ephemeral backend state, so they're now
      driven _solely_ by rehydration (`conv.liveRequests` → the sync effect) — deterministic, no race,
      and no risk of resurrecting a stale/resolved request from storage. File/media tabs still persist.
- This also explains "when tabs don't open, hovering the dot shows no cancel": both the tab and the
  cancellable dot derive from `conv.liveRequests`, so they're now consistent — reliably present
  together once rehydration lands. (The "events request cancelled" the user saw is the prior
  mount's SSE stream being aborted on nav/StrictMode — benign, not the cause.)

### 6.2 Hover cancel icon too big

- [x] `globals.css`: the hover state was a 14px filled red circle (clearly bigger than the 8px
      dot). Replaced with a compact bare red `X` (~10px, `var(--danger)`, no filled background) that
      matches the dot's footprint; added a small `padding`/negative-`margin` to enlarge the click
      target without shifting layout. Keeps `cursor: pointer` and the focus outline.

### 6.3 Cancel from the dot didn't take effect — real correlation bug found

- **Root cause:** `buildPendingInteractionMap` aligned the tail of running tool calls to the
  live requests **from the start** of the request list. When there were _more open requests than
  running tools_ — e.g. a completed tool's live request lingering in the in-memory service — a
  pending tool got mapped to the **oldest/stale** request instead of its own. Clicking cancel then
  cancelled the wrong request and left the tool blocked. (Wiring itself is fine: dot-cancel calls
  the identical `conv.cancelLiveRequest(id)` the tab's Cancel button uses.)
- [x] Fixed the alignment to zip both lists **from the end** (`requestOffset =
requests.length - tail.length`): the newest running tool ↔ the newest request. New test
      ("maps the running tool call to the newest request when a stale request lingers") covers it.
- **Known limit (interrupted sessions):** if the turn was already _interrupted_ (the user's
  screenshot shows an "Interrupted" divider), OpenCode has abandoned those tool calls and will not
  update their part state no matter what — cancelling the (orphaned) live request unblocks the
  backend and closes the tab, but the tool row stays visually "pending" because that frozen state
  lives in OpenCode's message, not ours. On a **live** (actively-blocked) turn, cancelling makes
  the MCP tool throw → OpenCode marks the tool errored → the dot updates. So dot-cancel is best
  re-tested by triggering a form tool and cancelling it _before_ interrupting the turn.

**Tests/checks for Part 6:** `pnpm --filter @cc/frontend typecheck` + lint clean; full frontend
suite → 112 files / 1196 tests passing (+1 alignment test).

## Out of scope (explicitly deferred)

- Global cross-chat indicator of specialists waiting on input (user chose per-chat scope).
- Aborting genuinely-running tools from the dot (no per-tool cancel in OpenCode; composer Abort
  remains the tool for that).
- Precise (non-positional) tool→live-request linkage — blocked on OpenCode exposing the tool call
  id to MCP tool handlers (see 5.3 caveat).
- localStorage mirroring.

## Notes / constraints

- **Portable Workspace Rule:** no new persisted state — pending interactions remain runtime state
  owned by the OpenCode daemon and the in-memory live-request service; we only add read paths.
- Live requests are lost on backend restart (in-memory map); rehydration honestly reflects that —
  the fetch simply returns none and the MCP tool call has already been rejected by `dispose()`.
- `QuestionTool.tsx` renders `null` while pending/running, so the question tool itself shows no
  dot; its cancel affordance is the existing Dismiss in `QuestionDock`. The dot-cancel mainly
  serves permission-blocked tools — but keep the question mapping in the context anyway in case a
  question-linked tool row is visible (e.g. inside a context group).
