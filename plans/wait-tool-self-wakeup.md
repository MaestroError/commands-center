# Wait tool — schedule a self-wakeup that re-prompts the same session

**Source:** TickTick task "Wait tool: Prompt self in X minutes" (priority high) —
*"For cases when it needs to wait something, just prompt 'X minutes passed, Waiting has
finished, please continue'."*

## Summary

Give a specialist a `wait` tool: when it needs to pause for an external condition (a build,
a deploy, a rate-limit window, a timed event), it schedules a **durable wakeup**, ends its
turn, and is **automatically re-prompted** in the same session after X minutes with a
continuation message. This is the pattern the Claude Code harness itself uses
(`ScheduleWakeup` / self-pacing).

## Locked decisions

1. **Mechanism:** durable schedule + re-prompt — NOT in-turn `sleep`. The tool records a
   wakeup, returns, and the turn ends; a scheduler tick re-prompts the session when due.
   Survives restarts, frees the opencode engine.
2. **Session identity:** the model passes an id as a tool argument (matches the existing
   `taskRunId` "from `<TaskRun>`" convention in the notification tools). The tool
   **validates the id maps to an active task run** for the board/run features. Chosen over
   per-session MCP tokens because the `cc-managed` MCP is per-agent and stateless
   (`sessionIdGenerator: undefined`, `execute` gets only `{ agentSlug }` —
   `mcp/cc-managed/service.ts:187`). Per-session identity (threading the HTTP request
   context / a per-session bearer token into `execute`) is the **later hardening step** for
   robustness under concurrent sessions.

   **Identity model (verified):** every conversation — chat AND task run — has one
   `opencode_session_id` and a `source`; only task-run conversations also carry `taskId` +
   `taskRunId` (`conversation-service.ts:241`). The re-prompt ALWAYS fires on
   `opencode_session_id` (`promptSessionAsync({ sessionID })`), so `taskRunId` and the
   session id are just different keys into the same conversation row — the firing path is
   identical for chat and task runs. Resolution chain: `taskRunId → conversation → session`
   (task runs) or `conversationId → session` (chat).

   **One tool, generic internals, task-run-only surface in v1.** The tool takes a generic
   `sessionRef` resolved to a conversation → session; the ref type (taskRunId vs
   conversationId) only changes the lookup, not the firing. **No separate chat tool is
   needed.** v1 only surfaces `<TaskRun>` / accepts `taskRunId`, so **chat is gated by
   absence** (a chat model has no id to pass). Enabling chat later is additive — (a) add a
   `<Conversation>` id tag using the existing `conversationId` system-prompt variable
   (`variables.ts:56`), (b) accept `conversationId` in the tool, (c) build the chat waiting
   UX — no tool rewrite.
3. **Availability:** no hard gating. Set `context: "task_run"` so `withContextRecommendation`
   (`service.ts:183`) recommends it for task runs; the description steers chat usage to
   "only when the operator explicitly asked to wait/resume later."
4. **Interruption UX (chat):** hybrid. Show a waiting banner with a **live countdown** and a
   **"Cancel / take over" button**; keep the composer enabled, but **Send opens a
   confirmation** ("AI Specialist is waiting, resumes in X min. Sending now cancels the
   pending wakeup. Send anyway?"). On confirm or cancel → the pending wakeup is cancelled.
5. **Max wait:** always expressed in **minutes**, **configurable in CC settings (UI)**,
   **default max 12 hours (720 min)**. Reject values above the configured cap.
6. **Self-wait loop:** a resumed turn **may** immediately `wait` again (allowed). Log each
   wakeup for observability; no hard loop cap in v1.
7. **Task/board visibility:** **derived runtime sub-state**, not a new persisted status.

## Waiting state on the board (decision 7, detail)

The run stays `running` while paused (opencode session alive, idle until wakeup), so we model
it as a **derived runtime sub-state**, mirroring the existing `waiting_for_opencode` precedent
(`taskRunRuntimeStateSchema`, `task-service/status.ts:165`, `mappers.ts:212`).

- Add `paused_waiting` to `taskRunRuntimeStateSchema`, derived from the active
  `conversation_wakeups` row and carrying **`reason` + `resumeAt`**.
- Card **stays in its column**; render a **"Paused · resumes in 6:12 · <reason>"** badge with
  countdown on: the **board card**, the **run monitor**, and the **task detail panel**.
- The waiting **reason is stored** on the wakeup row and surfaced through the task mapper so
  the detail panel can show the message.

**Deferred:** a first-class persisted `waiting` board status. Approval gates (a task paused
*between* runs, indefinitely, awaiting a human) are the case that actually justifies a
persisted status; design that status contract *with* the approval-gate requirements in hand.
X→Y is additive because both share the reason-storage seam.

## Architecture

### Data model — new table `conversation_wakeups`
```
id
agent_id
conversation_id
opencode_session_id
task_id            (nullable — set when the caller is an active task run)
task_run_id        (nullable)
due_at
prompt_text        default: "X minutes passed, waiting has finished, please continue."
reason             human-readable, shown in the paused badge/panel
status             pending | fired | cancelled | superseded
created_at, fired_at, cancelled_at
cancel_reason      user_message | manual | superseded
```
Enforce **one pending wakeup per conversation** — a new `wait` supersedes the prior one.

### Tool — `wait` (cc-default group)
- Input: `{ minutes (>=1, <= configured cap), reason, sessionRef, message? }`.
- `execute`: validate `sessionRef` → resolve conversation + opencode session (and active task
  run, if any); insert/supersede the wakeup row; return "waiting scheduled — ending turn,
  will resume in X min." Turn ends naturally after the tool result.

### Firing
Mirror `task-scheduler-service`'s DB-tick pattern (its own small `wakeup-scheduler-service`
or folded into the same loop). On due pending rows → `opencodeService.promptSessionAsync({
sessionID, text: prompt_text })`, mark `fired`. Reuse the scheduler's **catch-up** semantics so
a wakeup that came due during downtime fires on next boot.

### Cancellation
Hook the conversation send-path (`conversation-service` prompt path) to cancel any pending
wakeup for that conversation (`cancel_reason: "user_message"`) before/with the send.

### Settings
Add a **max-wait-minutes** setting (default 720) to the settings service + a CC settings UI
control. The tool reads it to validate the cap.

### Frontend
- **Chat:** waiting banner + countdown + Cancel button; Send-confirmation modal (decision 4).
- **Board / run monitor / task detail:** "Paused" badge + countdown + reason (decision 7).
- Expose the pending wakeup (due_at, reason) on conversation status + task/run read models so
  the UI can render live countdowns.

## Open implementation details / risks

- **Session-id surfacing (option 2):** confirm what context tag carries the current
  conversation/opencode session id to the model in chat (task runs have `<TaskRun>`; chat may
  need an equivalent). The tool must validate "active task run" for the board features.
- **Turn end:** ensure the model reliably stops after scheduling (description guidance;
  verify the orchestrator doesn't keep the turn open).
- **Concurrency & restart:** catch-up firing; superseding races; multiple sessions per agent.
- **Reason plumbing:** single source (wakeup row) consumed by both chat banner and the
  derived `paused_waiting` sub-state.

## Later / follow-ups
- Per-session MCP identity (hardening for decision 2).
- Persisted `waiting` board status, co-designed with **approval gates** (reuses the reason
  store and the paused UX).
