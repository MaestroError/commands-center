# Sub-Epic 5 — Chat Feature Test Coverage

Systematic test coverage for the direct-chat feature (sub-epics 1–3). Tasks are ordered by risk and complexity; each maps to one PR / commit.

---

## Status legend

- [ ] Not started
- [x] Done

---

## 1. ✔️ Reducer unit tests — `use-conversation.ts`

**File created:** `src/hooks/use-conversation.test.ts`

The reducer (`applySseEvent` + non-SSE actions) is the highest-risk untested code. All cases are pure functions and can be tested without mounting React.

- [x] `message.part.updated` — appends a new part to an empty parts map entry
- [x] `message.part.updated` — updates an existing part in-place (matching by `part.id`)
- [x] `message.part.delta` — concatenates `delta` onto the correct `field` of the matching part
- [x] `message.part.delta` — no-op when `messageID` not in parts map
- [x] `message.part.removed` — removes the matching part from the array
- [x] `message.part.removed` — no-op when `messageID` not in parts map
- [x] `message.removed` — removes the message from `conversation.messages` and its entry from the `parts` map
- [x] `message.updated` (user role, no optimistic) — adds new message to the messages array
- [x] `message.updated` (user role, with optimistic) — purges all `optimistic-*` messages before inserting
- [x] `message.updated` (assistant role) — adds/updates assistant message
- [x] `session.status` — sets `agentStatus` to the correct value
- [x] `permission.asked` — populates `pendingPermission`
- [x] `permission.replied` — clears `pendingPermission` to null
- [x] `question.asked` — populates `pendingQuestion`
- [x] `question.replied` / `question.rejected` — clears `pendingQuestion` to null
- [x] `todo.updated` — replaces full todos array
- [x] `OPTIMISTIC_USER_MESSAGE` — appends message to `conversation.messages` when conversation exists
- [x] `OPTIMISTIC_USER_MESSAGE` — no-op when `state.conversation` is null
- [x] `HYDRATE` — sets conversation and previous, resets pending state and todos, rebuilds parts map
- [x] `HYDRATE_DETAIL` — sets conversation, resets pending state and todos, rebuilds parts map

---

## 2. ✔️ Pure-function unit tests — `UserMessage.tsx`

**File created:** `src/components/chat/UserMessage.test.ts`
_(test the exported `parseUserMessage` function directly)_

- [x] Extracts skill reference from `Use skill "slug".` prefix
- [x] Extracts multiple `#path` file references at the start of remaining text
- [x] Distinguishes folder paths (ends with `/`) from file paths
- [x] Returns plain text remainder after skill prefix and file mentions are stripped
- [x] Handles message with no prefix (only plain text)
- [x] Handles empty string input
- [x] Handles message with only file mentions and no trailing text

---

## 3. ✔️ Pure-function unit tests — `MessageTimeline.tsx`

**File to create:** `src/components/chat/MessageTimeline.test.ts`
_(test exported utility functions)_

- [x] `isHiddenUserMessage` — returns true for each string in `HIDDEN_USER_MESSAGES`
- [x] `isHiddenUserMessage` — returns false for arbitrary user text
- [x] `isInterruptedMessage` — returns true when parts contain `step-start` but no `step-finish`
- [x] `isInterruptedMessage` — returns true when `step-finish` has reason `"interrupted"` / `"aborted"` / `"error"`
- [x] `isInterruptedMessage` — returns false for a normal completed message

---

## 4. ✔️ Pure-function unit tests — `api.ts` SSE parser

**File to create:** `src/lib/api.test.ts`

Uses a mocked `fetch` returning a `ReadableStream`.

- [x] `connectConversationEvents` — yields parsed events from well-formed `data:` blocks
- [x] `connectConversationEvents` — handles `\n\n` block splitting with leftover buffer remainder
- [x] `connectConversationEvents` — skips blocks with no `data:` line
- [x] `connectConversationEvents` — skips and warns on blocks that fail `chatEventSchema` validation
- [x] `connectConversationEvents` — joins multi-line `data:` fields with `\n`
- [x] `connectConversationEvents` — throws on non-OK HTTP response
- [x] `connectConversationEvents` — throws when response body is null
- [x] `deleteConversation` — treats HTTP 204 as success (no throw)
- [x] `sendCommand` — sends `arguments: ""` when `args` is undefined
- [x] `readApiError` — reads `message` from JSON response body; falls back to status text

---

## 5. ✔️ Pure-function unit tests — `routes.tsx`

**File to create:** `src/app/routes.test.ts`

- [x] `matchesRoute` — returns false when segment counts differ
- [x] `matchesRoute` — matches `:param` wildcard segments
- [x] `matchesRoute` — exact match for root `/`
- [x] `getRouteTitle` — returns `"Direct Chat"` for `/chat/:agentId` shape
- [x] `getRouteTitle` — returns `"Direct Chat"` for `/chat/:agentId/:conversationId` shape
- [x] `getRouteTitle` — returns fallback for unknown paths

---

## 6. ✔️ Component tests — `PermissionDock`

**File to create:** `src/components/chat/PermissionDock.test.tsx`

- [x] Renders `permission.permission` name
- [x] Renders patterns list when `permission.patterns` is non-empty
- [x] Hides patterns list when `permission.patterns` is empty
- [x] "Deny" button calls `onReply(id, "reject")`
- [x] "Allow Once" button calls `onReply(id, "once")`
- [x] "Always Allow" button calls `onReply(id, "always")`

---

## 7. ✔️ Component tests — `QuestionDock`

**File to create:** `src/components/chat/QuestionDock.test.tsx`

- [x] Renders all question texts
- [x] Single-select: selecting option B after option A replaces A
- [x] Multi-select: selecting A then B accumulates both; deselecting B removes it
- [x] Submit button calls `onReply(id, answers)` with correct `string[][]` shape
- [x] Dismiss button calls `onReject(id)`
- [x] Optional `header` field rendered when present

---

## 8. ✔️ Component tests — `TodoDock`

**File to create:** `src/components/chat/TodoDock.test.tsx`

- [x] Returns null / renders nothing when `todos` is empty
- [x] Renders collapsed by default; expand button shows todo items
- [x] `pending` status: correct icon rendered, `content` text shown
- [x] `in_progress` status: correct icon rendered, `activeForm` shown when defined
- [x] `in_progress` status: falls back to `content` when `activeForm` is absent
- [x] `completed` status: correct icon rendered, text has `line-through` style

---

## 9. ✔️ Component tests — `AttachmentBar`

**File to create:** `src/components/chat/AttachmentBar.test.tsx`

- [x] Returns null for empty attachments array
- [x] Renders image thumbnail for image MIME types
- [x] Renders file icon for non-image MIME types
- [x] Remove button calls `onRemove` with the correct index

---

## 10. ✔️ Component tests — `ChatHeader`

**File to create:** `src/components/chat/ChatHeader.test.tsx`

- [x] Renders `agentName` as the primary label
- [x] Renders `agentRole` as the subtitle
- [x] History button click opens `ConversationHistoryModal`
- [x] Closing the modal hides it (modal unmounted / not in DOM)
- [x] Start-fresh button calls `onStartFresh`

---

## 11. ✔️ Component tests — `GenericTool`

**File to create:** `src/components/chat/tools/GenericTool.test.tsx`
_(extend or co-locate with `tool-renderers.test.tsx`)_

- [x] Renders tool name in the card header
- [x] Renders status label
- [x] Expand button reveals input block

---

## 12. ✔️ Component tests — `MessageTimeline` (render behaviour)

**File to create:** `src/components/chat/MessageTimeline.test.tsx`

- [x] User messages rendered right-aligned; assistant messages left-aligned
- [x] Shows "Thinking..." when `agentStatus === "busy"` and last message role is `"user"`
- [x] Shows "Thinking..." when `agentStatus === "busy"` and `messages` is empty
- [x] Does not show "Thinking..." when `agentStatus === "idle"`
- [x] Does not show "Thinking..." when last message role is `"assistant"`
- [x] Hidden user messages (from `HIDDEN_USER_MESSAGES`) not rendered
- [x] `InterruptedDivider` rendered after an interrupted assistant message
- [x] `InterruptedDivider` not rendered for a normal completed message

---

## 13. ✔️ Component tests — `WorkspaceFilesTab`

**File to create:** `src/components/workspace/WorkspaceFilesTab.test.tsx`

- [x] Shows loading state while initial fetch is in progress
- [x] Shows error state when initial fetch fails
- [x] Shows empty state when root returns no nodes
- [x] Renders file and directory nodes from the API response
- [x] Clicking a file node calls `onSelect(path)` (or highlights it)
- [x] Clicking a directory triggers a child `getWorkspaceTree` call
- [x] Second expand of same directory does not re-fetch (children cached)
- [x] Directory collapses on second click

---

## 14. ✔️ Feature test — `ChatComposer` send paths

**File to create:** `src/components/chat/ChatComposer.test.tsx`

Render with mocked callback props; no real API calls needed.

- [x] Typing text and clicking Send calls `onSend` with that text
- [x] Send button is disabled when textarea is empty and no attachments/skill
- [x] Stop button shown (Send hidden) when `agentStatus === "busy"`; clicking it calls `onAbort`
- [x] Typing `!` as first character switches to shell mode; Enter calls `onShell`
- [x] Escape in shell mode exits back to normal mode
- [x] Typing `/compact` and selecting from popover calls `onSummarize`
- [x] Typing `/new` and selecting from popover calls `onStartFresh`
- [x] Selecting a skill with no text calls `onCommand(slug)`
- [x] Selecting a skill with text calls `onSend` with skill-prefixed text

---

## 15. ✔️ Feature test — `WorkspaceChatPage` URL sync

**File to create:** `src/pages/WorkspaceChatPage.test.tsx`

Mock `useConversation` and `useNavigate`; no real network needed.

- [x] Navigates to `/chat/:slug/:id` with `replace: true` on initial load (no `conversationId` in URL)
- [x] Navigates to `/chat/:slug/:newId` with `replace: false` when conversation switches
- [x] Does not navigate when `conv.conversation.id === urlConversationId`
- [x] Renders `LoadingState` when `conv.status === "loading"`
- [x] Renders `ErrorState` when `conv.status === "error"`
- [x] Renders `PermissionDock` when `conv.pendingPermission` is set (hides composer)
- [x] Renders `QuestionDock` when `conv.pendingQuestion` is set and no permission pending
- [x] Renders `TodoDock` only when `conv.todos.length > 0`

---

## Implementation order

```
1  → 2 → 3 → 4 → 5     (pure-function unit tests — no DOM, fastest to write)
6 → 7 → 8 → 9 → 10     (small component tests)
11 → 12 → 13            (medium component tests)
14 → 15                 (feature/integration tests — write last)
```
