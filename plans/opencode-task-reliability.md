# Plan: OpenCode Task Reliability

## Goal

Make task execution reliable for long-running OpenCode sessions.

The confirmed failure mode is not VPS resource exhaustion and not a model/provider
error. CommandsCenter currently sends task prompts through OpenCode's synchronous
`POST /session/:id/message` endpoint. That local HTTP request remains open until
OpenCode finishes the whole agent loop. On the VPS, the request consistently dies
after about 300 seconds with `TypeError: fetch failed`, while OpenCode continues
running the session in the background.

The fix is to stop tying task success to one long-lived HTTP response. Task runs
should start OpenCode work asynchronously, monitor the session until it settles,
then finalize the task from the persisted OpenCode messages.

## Current Evidence

- Recent failing task runs all ended after roughly five minutes:
  - `1781773781893 - 1781773481170 = 300723ms`
  - `1781773481152 - 1781773179509 = 301643ms`
  - `1781769111508 - 1781768810326 = 301182ms`
  - earlier failures follow the same `~300s` pattern.
- Failing rows store:

  ```json
  {
    "errorName": "TypeError",
    "stage": "task_session_prompt"
  }
  ```

- OpenCode logs show the same session continued after CC had already marked the
  task failed. Example:
  - CC marked `ses_1260ae542ffeYmXtKWuv18qUMa` failed around `09:04:41`.
  - OpenCode continued logging loop steps for that session until
    `09:06:03 message="exiting loop"`.
  - A new task session started at `09:04:41`, overlapping the still-running
    previous session.
- A separate provider/model failure was captured correctly as `TaskRunPromptError`
  with details like `[Google AI Studio] Corrupted thought signature.` That path
  should remain separate from local transport failures.

## Current Code Path

- `packages/backend/src/services/task-execution-service.ts`
  - `runQueuedTask()` starts a queued run.
  - It creates a task-owned conversation.
  - It calls `conversationService.sendTaskRunPrompt(...)`.
  - It marks the task completed only after that call returns.
  - Any thrown error while a session id is linked becomes
    `stage: "task_session_prompt"`.
- `packages/backend/src/services/conversation-service.ts`
  - `sendTaskRunPrompt()` resolves the model and calls
    `opencodeService.promptSession(...)`.
  - `sendPromptAsync()` already exists for normal chat streaming and calls the
    async OpenCode endpoint, but task runs do not use it.
  - `syncConversation()` already knows how to pull OpenCode session messages into
    CC's SQLite conversation tables.
  - The session archive PR added archive hooks inside `syncConversation()`, so
    synced chat and task-run messages are mirrored into portable archive files.
- `packages/backend/src/services/opencode-service.ts`
  - `promptSession()` posts to `/session/:id/message` and waits for the assistant
    message.
  - `promptSessionAsync()` posts to `/session/:id/prompt_async` and returns after
    OpenCode accepts the prompt.
  - There is not yet a wrapper for OpenCode `GET /session/status`.
- `packages/backend/src/services/task-execution-service.ts`
  - The session archive PR added `finalizeRunArchive()`, called from
    `notifyRunTerminal()`.
  - This already flushes debounced archive messages, sets archive status, and
    materializes the task-run transcript when a run becomes terminal.
  - Async task monitoring should reuse this terminal path instead of inventing a
    separate archive finalization flow.
- OpenCode source confirms:
  - `POST /session/:id/message` awaits `promptSvc.prompt(...)` and responds only
    after the loop finishes.
  - `POST /session/:id/prompt_async` forks the same work and returns immediately.
  - `GET /session/status` returns a map of session ids to `idle`, `busy`, or
    `retry` state.
- OpenCode status omits idle sessions from the status map; for a known session,
  an absent entry should be treated as `idle` after the prompt is known to have
  been accepted.
- Normal chat UI already uses async prompts: the frontend posts to
  `/api/conversations/:conversationId/prompt?stream=true`, and the route returns
  `202` after `sendPromptAsync()`. The synchronous chat route remains available
  for non-stream callers/API compatibility.

## Non-Goals

- Do not retry or duplicate an in-flight long-running prompt.
- Do not retry model/provider errors returned inside an OpenCode assistant
  message beyond the existing fallback-model behavior.
- Do not introduce a separate external queue or worker.
- Do not change provider/model selection logic as part of this reliability work.
- Do not treat VPS size as the primary fix for this issue.
- Do not make OpenCode event streaming a blocker for the first reliable task
  implementation.

## Design Principles

- A task run may outlive any individual HTTP request between CC and OpenCode.
- Once a task prompt has been accepted by OpenCode, retries must inspect the
  existing session before starting another prompt.
- The task run remains the CC source of truth for operator-facing status, but
  OpenCode session messages are the source of truth for prompt progress/results.
- Local transport failures during monitoring should delay finalization, not mark
  the task failed immediately.
- Monitors must be bounded: a stuck OpenCode session should eventually become a
  distinct task error instead of being polled forever.
- Monitor start must be idempotent per task run id. Every entry point that starts
  or resumes monitoring must go through one in-memory registry of active monitor
  handles.
- Provider/model errors are semantic task failures and should continue to produce
  `TaskRunPromptError` details and fallback model runs where eligible.
- The session archive is a durable mirror of synced messages, not the monitor
  source. Monitoring should still read OpenCode status/messages, then let the
  existing archive hooks persist the final synced state.
- Ship polling first. It is simpler, stateless, and survives missed events. Keep
  the settle-detection logic isolated so OpenCode events can drive the same
  finalizer later without changing task semantics.

## Verified Assumptions

- `task_runs.trigger_metadata_json` is persisted in SQLite and mapped back to
  `TaskRun.triggerMetadata` through `task-service`, so monitor metadata stored
  there survives process restart.
- A stale `running` run without an `opencodeSessionId` has no known accepted
  OpenCode prompt. That invariant makes it safe to move the run back to
  `queued` during startup recovery instead of assuming OpenCode is still doing
  work.

## Tactical Timeout Mitigation

Raising the local HTTP timeout to 15 minutes is possible as a short-term
operator mitigation if the actual failing boundary is configurable in the
runtime that owns the `fetch()` call. It would reduce failures for tasks that
finish within that longer window.

It is not the architectural fix:

- some tasks can legitimately run longer than 15 minutes
- a timeout still marks the CC run failed while OpenCode may continue editing
  files in the background
- retries after timeout can duplicate in-flight task work
- process restarts, proxy timeouts, socket closes, and network hiccups can still
  break a long-lived request

If used before the async fix lands, treat it as a stopgap and pair it with
manual inspection of the OpenCode session before retrying failed task runs.

## Phase 1: Improve Diagnostics

### Implementation

- Extend `buildTaskRunErrorDetails()` in
  `packages/backend/src/services/task-execution-service.ts`.
- Capture structured transport details for ordinary `Error` values:
  - error name
  - message
  - cause name
  - cause message
  - cause code, if present
  - stage
  - `opencodeSessionId`, when available
  - elapsed run time, if available
- Keep the existing `TaskRunPromptError` shape for model/provider errors.
- Avoid storing secrets, request bodies, rendered prompts, or headers.

### Verification

- Add tests that simulate `TypeError("fetch failed", { cause })`.
- Assert the task run stores `causeCode` and `causeMessage`.
- Assert provider/model `TaskRunPromptError` details remain unchanged.

## Phase 2: Add OpenCode Session Status Support

### Implementation

- Add an `opencodeService.listSessionStatuses(directory)` wrapper around
  `GET /session/status`.
- Add a small schema for the status map:
  - `idle`
  - `busy`
  - `retry` with attempt/message/next fields preserved when present
- Add a helper that resolves a specific session id to status, treating an absent
  map entry as `idle`.
- Keep this wrapper independent from task execution so chat, diagnostics, and
  health surfaces can reuse it later.

### Verification

- Add `opencode-service` tests for status parsing.
- Add a malformed response test to ensure invalid status payloads fail clearly.

## Phase 3: Start Task Prompts Asynchronously

### Implementation

- Add a task-specific conversation method, for example
  `startTaskRunPrompt(...)`, that:
  - resolves the model using the same logic as `sendTaskRunPrompt()`
  - returns or persists the exact attempted model after fallback-to-agent-default
    resolution; the later monitor needs this for `TaskRunPromptError` fallback
    model selection
  - calls `opencodeService.promptSessionAsync(...)`
  - does not wait for the assistant response
  - returns the conversation id, OpenCode session id, and attempted model
- Update `runQueuedTask()` to call this async starter after the task-owned
  conversation is created and linked.
- Record enough start metadata to make monitor resumption deterministic:
  - attempted model
  - baseline message count before the async prompt
  - prompt accepted timestamp
- Prefer existing task-run JSON fields for monitor metadata instead of adding a
  migration:
  - use `triggerMetadata` for runtime monitor metadata such as attempted model,
    baseline message count, and prompt accepted timestamp
  - use `result` only for terminal/result data already exposed as the run result
  - add a schema/migration only if the metadata needs first-class querying
- Namespace monitor metadata inside `triggerMetadata`, for example under
  `opencodeMonitor`, so original trigger provenance is not overwritten.
- Keep the task run status as `running` after OpenCode accepts the prompt.
- Do not call `sendTaskRunPrompt()` for task execution anymore.
- Keep existing synchronous chat methods unchanged unless a separate chat bug is
  proven.

### Verification

- Update task execution tests to assert task runs call `promptSessionAsync`.
- Add a test where `promptSessionAsync` returns quickly and the task remains
  `running` until the monitor finalizes it.
- Add a regression test showing a prompt that takes longer than five minutes does
  not produce `fetch failed` from the task starter. Use fake timers or a
  controllable deferred, not a real five-minute test.

## Phase 4: Monitor And Finalize Async Task Sessions

### Implementation

- Add a task session monitor/finalizer inside task execution service, or a small
  focused service if the implementation would otherwise make
  `task-execution-service.ts` too large.
- The monitor should:
  - periodically fetch `GET /session/status`
  - call `syncConversation()` or a task-specific sync helper for the conversation
    so the merged session archive hooks append messages while monitoring
  - catch errors inside each poll iteration so one monitor exception cannot
    escape as an unhandled rejection or leak the registry handle forever
  - prefer an explicit OpenCode terminal signal when one is exposed by status,
    events, or message metadata
  - otherwise use debounced idle settle-detection:
    - prompt acceptance must be recorded first
    - the session must have at least one assistant message after the baseline
      message count, or an explicit terminal error
    - the session must be absent/`idle` for at least N consecutive polls after a
      post-idle sync
    - any observed `busy` or `retry` status resets the idle counter
    - finalization reads messages again immediately before marking the run
      terminal
  - identify when the target OpenCode session is no longer `busy` or `retry`
  - read the latest synced assistant message
  - if `message.info.error` exists, map it through the existing
    `TaskRunPromptError`/fallback-model path
  - otherwise summarize the conversation with `summarizeTaskRunConversation()`
    and mark the run completed
  - let `notifyRunTerminal()` call the existing archive finalization path after
    setting the terminal task status
  - call the existing per-agent queue drain path after terminal completion so the
    next queued task for that specialist can start
- Suggested polling:
  - initial interval: 2s
  - back off to 10s while still busy
  - keep cancellation checks responsive
- Persist enough runtime state to recover after CC restarts:
  - the run is already `running`
  - `opencodeSessionId` is already stored
  - the task-owned conversation already stores the OpenCode session id
  - attempted model/baseline message count are stored or derivable
  - on scheduler/service startup, existing `running` task runs with an
    `opencodeSessionId` should be eligible for monitor resumption.
- Add an explicit monitor lifecycle:
  - start monitoring after async prompt acceptance
  - expose a separate monitor entry point such as `resumeRunningTaskRun(runId)`
    or `startTaskRunMonitor(runId)`; do not reuse `runQueuedTask()` for resumed
    runs because it is intentionally limited to `queued` runs
  - resume monitors for eligible `running` runs during server startup
  - stop timers/listeners on server shutdown
  - store active monitor handles in one `Map<runId, monitorHandle>`
  - make `startTaskRunMonitor(runId)` return the existing handle when the map
    already has one
  - remove the handle in a `finally` block after terminal completion,
    cancellation, timeout, or fatal setup failure
  - guard terminal writes by reloading the run and confirming it is still
    `running`, so duplicate/final-late monitors cannot overwrite cancellation
- Add a max monitor lifetime constant, initially 6 hours unless product needs a
  different value before implementation:
  - when exceeded, sync messages one final time
  - mark the run `error`
  - use `errorDetails.stage: "monitor_timeout"`
  - include `opencodeSessionId`, elapsed time, last observed status, and last
    assistant/message ids if known
- If OpenCode status is unavailable but the process is healthy enough to answer
  message/session reads, fall back to message inspection.
- If OpenCode is temporarily unreachable during monitoring, keep the task
  `running` and retry monitoring with backoff instead of failing immediately.

### Verification

- Add tests where status transitions from `busy` to `idle` and the run completes.
- Add tests where a task runs longer than five minutes and completes successfully
  through the async starter plus monitor path.
- Add tests where status is `retry` and the run stays running.
- Add tests where an idle blip appears between busy/retry polls and the monitor
  does not finalize early.
- Add tests where the monitor sees idle for only one poll and waits for the
  configured debounce count.
- Add tests where monitor lifetime exceeds the max and the run errors with
  `stage: "monitor_timeout"`.
- Add tests where a poll iteration throws and the monitor continues or records a
  controlled terminal error without leaking the monitor handle.
- Add tests where monitoring sees a provider error message and queues fallback
  models exactly like the current sync path.
- Add tests where the requested run model is unavailable, the async starter uses
  the agent default, and a later provider error records/uses that actual
  attempted model.
- Add tests where monitoring has transient local transport failures and later
  completes without duplicating the prompt.
- Add restart-resume tests for an existing `running` run with an
  `opencodeSessionId`.
- Add tests proving monitor metadata survives through `triggerMetadata` without
  changing existing task-run public fields unexpectedly.
- Add cancellation tests proving a cancelled run is not completed later by the
  monitor.
- Add archive assertions proving monitored completion flushes and materializes
  the task-run archive through the existing terminal path.
- Add queue tests proving the next queued run for the same agent starts only
  after monitor finalization of the current running run.
- Add shutdown/dispose tests if the monitor owns timers.

## Phase 5: Prevent Duplicate In-Flight Prompts

### Implementation

- Introduce one task monitor registry, `Map<runId, monitorHandle>`, owned by the
  task execution/monitor service. Queue drain, restart-resume, duplicate
  prevention, and manual retry paths must all start monitors through this
  registry.
- Before starting a task prompt, inspect the task-owned conversation and
  `opencodeSessionId`.
- If the run already has an OpenCode session and there are messages or session
  status indicates `busy`/`retry`, resume monitoring instead of sending another
  prompt.
- If a previous monitor attempt failed after the prompt was accepted, never queue
  a fallback/retry run until the original session is known to be terminal.
- Log duplicate-prevention decisions with:
  - task id
  - task run id
  - OpenCode session id
  - observed status/message count

### Verification

- Add tests where `runQueuedTask()` is called twice for the same run and only one
  async prompt is sent.
- Add tests where queue drain and startup resume both attempt to monitor the
  same run, and only one monitor handle is created.
- Add tests where the first monitor attempt loses OpenCode connectivity and the
  resumed monitor finalizes the same session.

## Phase 6: Abort OpenCode Work On Task Cancellation

### Implementation

- Extend task cancellation to abort the linked OpenCode session when a running
  task has an `opencodeSessionId`.
- Reuse the existing OpenCode abort endpoint through conversation/opencode
  service rather than only changing CC task state.
- Treat abort as best-effort:
  - CC should still mark the task cancelled if OpenCode abort fails
  - log abort failures with task id, run id, and OpenCode session id
  - the monitor must ignore cancelled runs and must not later mark them completed
- After cancellation, keep the existing queue drain behavior so the next queued
  run for the same specialist can start.

### Verification

- Add tests where cancelling a running async task calls OpenCode session abort.
- Add tests where abort fails but the task remains cancelled.
- Add tests where the monitor later sees assistant messages for the cancelled
  session and does not overwrite the cancelled status.

## Phase 7: Retry Short Local Transport Failures

### Implementation

- Add a small internal classifier for local OpenCode transport errors.
- Retry only short local calls:
  - create session
  - start async prompt
  - session status
  - sync/list session messages
- `promptSessionAsync()` retry depends on duplicate-prevention:
  - retry directly only when the request clearly failed before acceptance
  - if the failure is ambiguous, inspect the run's OpenCode session status and
    messages first
  - if there is any evidence the prompt was accepted, start/resume the monitor
    instead of sending another prompt
  - only send another async prompt when there is no accepted-prompt evidence
- Do not retry the old synchronous `/session/:id/message` task call because task
  execution should no longer use it.
- Retryable local transport failures include:
  - `TypeError` from `fetch()` where the message or cause includes:
    - `fetch failed`
    - `ECONNREFUSED`
    - `ECONNRESET`
    - `EPIPE`
    - `UND_ERR_SOCKET`
    - timeout/header timeout/socket closed wording
  - abort or timeout errors from local OpenCode requests
  - non-2xx responses only if the response indicates temporary local engine
    unavailability, such as `502`, `503`, or `504`
- Use conservative exponential backoff with jitter:
  - initial delay: 500ms
  - max delay: 10s
  - max elapsed time: 2 minutes
- Log each retry with task id, run id, stage, attempt number, error name, and
  cause code/message when available.

### Verification

- Add tests where `createTaskRunConversation()` fails once with `ECONNREFUSED`
  and then succeeds.
- Add tests where `promptSessionAsync()` fails once before acceptance and then
  succeeds.
- Add tests where `promptSessionAsync()` loses the response after acceptance and
  retry logic resumes monitoring instead of double-prompting.
- Add tests where retries are exhausted before prompt acceptance and the run ends
  in `error` with improved diagnostics.
- Add tests proving model/provider `TaskRunPromptError` does not retry through
  this local transport path.

## Phase 8: Defer Runs When OpenCode Is Unhealthy

### Implementation

- Before starting queued task work, check whether the OpenCode engine is healthy
  when an orchestrator is available.
- If OpenCode is unhealthy:
  - leave the run queued, or move it back to queued after a failed start
  - record a lightweight defer reason in runtime logs
  - schedule another drain attempt for the same specialist after a short delay
- Avoid spinning with backoff and a max defer interval.
- Keep cancellation responsive while a run is deferred.

### Verification

- Add tests where OpenCode is unhealthy and the task remains queued.
- Add tests where the engine later becomes healthy and the queued run proceeds.
- Add tests that cancellation still works while a run is waiting for OpenCode.

## Phase 9: Decouple CC Uptime From OpenCode Startup

This is the natural cut line for a follow-up PR if the core async reliability fix
needs to ship sooner. It is related operational hardening, but it has a larger
blast radius than the task monitor change.

### Implementation

- Change startup behavior so the CC web/API server can remain up when OpenCode
  fails to become healthy.
- Keep the orchestrator state as `unhealthy` and continue background restart
  attempts within the existing restart budget.
- Expose engine status clearly through existing health/system status surfaces.
- Ensure task execution defers while OpenCode is unhealthy instead of failing
  immediately.

### Verification

- Add orchestrator/startup tests where OpenCode startup times out but the CC
  server still starts.
- Add route/status tests that expose the unhealthy OpenCode state.
- Add task tests proving queued runs do not fail merely because OpenCode is
  temporarily down.

## Operational Diagnostics

Document a short operator checklist for the next incident. Keep this in the plan
for implementation, then extract it into a runbook doc before the reliability PR
is considered complete:

```bash
date
systemctl status commandscenter --no-pager
curl -sS -m 2 http://127.0.0.1:4100/global/health
ps -eo pid,ppid,etime,stat,%cpu,%mem,cmd | grep -E 'opencode|ccenter' | grep -v grep
ss -ltnp | grep ':4100'
tail -n 300 /root/.local/share/opencode/log/opencode.log
grep -Ei 'level=Error|stream error|process|timeout|aborted|fetch|ECONN|session.id|messageID' \
  /root/.local/share/opencode/log/opencode.log | tail -n 200
sqlite3 /root/.cc/data/cc.db \
  "select id,status,error_message,error_details_json,opencode_session_id,started_at,completed_at from task_runs order by created_at desc limit 10;"
journalctl -u commandscenter --since "10 minutes ago" -o cat --no-pager \
  | grep -Ei 'runtime drain|SIGTERM|opencode stopped|opencode exited|opencode engine is healthy|health check failed|ECONNREFUSED|request timed out|starting opencode'
```

For richer OpenCode logs in `journalctl`, set:

```bash
OPENCODE_PRINT_LOGS=1
OPENCODE_LOG_LEVEL=DEBUG
```

This distinguishes:

- OpenCode process is missing
- OpenCode process exists but is not listening
- OpenCode is listening but `/global/health` hangs
- OpenCode is still running a task after CC lost a local HTTP request
- CC is draining or systemd is restarting it
- the task failed on model/provider behavior rather than local transport

## Rollout Order

1. Improve diagnostics first so any remaining failures expose the real transport
   cause.
2. Add session status support.
3. Switch task starts to `promptSessionAsync`.
4. Add monitor/finalizer and resume support for running task sessions.
5. Add duplicate in-flight prompt protection.
6. Abort linked OpenCode work on task cancellation.
7. Add retries for short local OpenCode calls.
8. Defer queued runs while OpenCode is unhealthy.
9. Decouple CC server uptime from OpenCode startup health.

Do not spend implementation effort on extending the synchronous task prompt
timeout unless production needs a temporary mitigation before the async monitor
ships.

## Open Questions

- Should async task monitors be kept in `task-execution-service.ts`, or split
  into a `task-run-monitor-service.ts` once implemented? - Split
- Should a running task display a substate like `waiting_for_opencode` or
  `monitoring_opencode`, or are logs enough for the first fix? - waiting_for_opencode
- Should monitor polling use OpenCode events later, or is status/message polling
  acceptable for the first reliable implementation? - Polling first; design the
  monitor finalizer so events can drive the same state machine later.
- Should stale `running` task runs without an `opencodeSessionId` be marked error
  on startup, or moved back to queued? - Move back to queued, because no session
  id means no accepted prompt is known.
