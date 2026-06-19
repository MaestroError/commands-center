# Plan: OpenCode Task Monitor — Stall Timeout + Configurable Timeouts

**Status:** Complete.

## Completion Audit

- Phase 1 (stall detection): `task-run-monitor-service.ts` tracks a per-poll
  progress signature (`messageCount|lastAssistantMessageId`) and detects a stall
  when it stays constant past the window. `noProgressMs <= 0` disables it.
- Phase 2 (configurable timeouts): `taskRunMonitorSettingsSchema`,
  `task-run-monitor-settings-service.ts`, and `GET`/`PUT
/api/task-run-monitor/settings`; the execution service feeds the monitor a
  cached (10s), error-safe runtime-config resolver so both timeouts apply live.
- Phase 3 (frontend): Settings → **Tasks** tab edits both timeouts.
- Phase 4 (docs): runbook documents the stall handling, the settings, and the
  silent-stall signature.

## Follow-up: cancel + optional requeue (implemented)

Stall handling was changed from a terminal `error` to a **cancellation** with a
clear reason, plus an opt-in auto-requeue:

- The monitor delegates stall finalization to a `finalizeStalledRun` hook. The
  execution service aborts the wedged session, sets the run `cancelled` with a
  `cancellationReason` naming the stall timeout and session id, then archives it.
- New setting `taskRunMonitorRequeueAfterStall` (default `false`, in Settings →
  Tasks). When enabled, a **fresh** run of the same task/subtask is queued
  (`triggerMetadata.requeueReason = "stall_timeout"`, `retryOfRunId` set) so it
  gets a clean OpenCode session instead of re-attaching to the wedged one.
- Caveat: a persistently stalling task will keep requeuing; intentional and
  operator-controlled via the checkbox.

## Problem

The async reliability work fixed the original `fetch failed`-at-300s false
failure: long task runs are now correctly held as `running` while the monitor
polls OpenCode. Production then surfaced a **second, separate** failure mode.

A task run sat in `running` for 30+ minutes with no progress. The OpenCode log
showed its session did two loop steps and then went completely silent — no more
steps, no stream, **no `exiting loop`** (every healthy session ends with
`exiting loop`). OpenCode's agent loop wedged mid-session (a provider/tool hang;
`ProviderHeaderTimeoutError` on the model was seen nearby).

Our monitor behaves correctly given what it sees, but it has only one escape
hatch for a session that never settles: the 6-hour `monitor_timeout`. So a
wedged session keeps the run `running` for up to 6 hours. There is no detection
of "OpenCode stopped making progress", and neither the 6h cap nor the new
no-progress window is operator-configurable.

## Goal

1. Detect a stalled OpenCode session quickly via a **no-progress timeout**
   (default **30 minutes**) and finalize the run instead of waiting 6 hours.
2. Make **both** the max monitor lifetime (default **6h**) and the no-progress
   timeout **configurable from settings** (file + API, surfaced in the Settings
   UI), changeable at runtime without a restart.

## Non-Goals

- No auto-retry of a stalled run. A stalled session may have already edited
  workspace files; auto-retrying risks duplicate work (consistent with the
  original plan's non-goals). A stall is a terminal `error` the operator sees.
  (Could be revisited later.)
- No change to provider/model fallback behavior. Stalls are not
  `TaskRunPromptError`s, so they do not feed the fallback-model path.
- No change to the existing busy/idle settle-detection for healthy sessions.

## Design

### What counts as "progress"

Progress = the synced session actually produced new content. Signature per poll:

```
`${conversation.messageCount}|${latestAssistant?.id ?? ""}`
```

Deliberately **excludes** session status. A wedged-but-`busy` session (the exact
observed case) produces no new messages, so its signature stays constant and it
trips the no-progress timeout. Status flapping (`idle`↔`busy`) without new
messages is not progress and must not reset the timer.

Tradeoff: a legitimately long single LLM turn (no new messages for >30m) would
also look stalled. OpenCode normally emits loop steps every few seconds, so this
is rare — and the timeout is configurable for the workloads where it isn't.

### Monitor changes (`task-run-monitor-service.ts`)

- Extend the monitor handle with `lastProgressAtMs` and `lastSignature`.
  Initialize `lastProgressAtMs` at monitor start.
- Resolve runtime timeouts once per poll via an injected, defensively-cached
  resolver (falls back to static defaults if it throws), so settings changes
  apply to in-flight monitors without a restart.
- New `poll()` ordering (additions in **bold**):
  1. load run; bail if not `running`
  2. bail if no conversation service / session id
  3. **resolve `{ maxLifetimeMs, noProgressMs }`**
  4. max-lifetime timeout check (`run.startedAt`-based) → `finalizeTimeout`
  5. read session status (`statusType`, `statusKnown`)
  6. sync conversation, ensure metadata, find latest assistant
  7. **compute progress signature; if changed, update `lastProgressAtMs`**
  8. assistant `message.error` → `finalizeModelError` (real errors win over stall)
  9. **no-progress check: `now - lastProgressAtMs >= noProgressMs` (and enabled)
     → `finalizeStalled`**
  10. existing busy/retry → reset idle + backoff
  11. existing status-unknown guard → keep polling with backoff
  12. existing `!latestAssistant` → keep polling
  13. existing idle debounce → `finalizeCompletion`
- New `finalizeStalled(handle, run, noProgressMs)`:
  - best-effort abort the wedged OpenCode session (new `hooks.abortSession(run)`),
    so it stops consuming the engine
  - guard-reload the run; bail if no longer `running`
  - set status `error` with `errorDetails`:
    ```
    { errorName: "TaskRunMonitorStalled", stage: "monitor_stalled",
      opencodeSessionId, elapsedRunMs, noProgressMs,
      lastStatus, lastAssistantMessageId }
    ```
  - call `hooks.handleTerminalRun(errored)` (archive finalize + queue next
    subtask + drain), same terminal path as the other finalizers
- `noProgressMs <= 0` disables stall detection (still bounded by max lifetime).

### Settings plumbing (mirror the session-archive settings pattern)

- **Shared schema** (`packages/shared/src/schemas/task-run-monitor.ts`, re-exported
  from `index.ts`):
  ```ts
  taskRunMonitorSettingsSchema = z.object({
    taskRunMonitorMaxLifetimeMinutes: z.number().int().positive().default(360), // 6h
    taskRunMonitorNoProgressTimeoutMinutes: z.number().int().nonnegative().default(30), // 0 = disabled
  });
  ```
- **Settings service** (`task-run-monitor-settings-service.ts`): file-backed in
  the `preferences` subdir (`task-run-monitor.json`) via `readConfigFile` /
  `writeConfigFileAtomic`, exactly like `session-archive-settings-service.ts`.
- **Route** (`routes/task-run-monitor.ts`, registered in `routes/index.ts`):
  `GET` + `PUT /api/task-run-monitor/settings` with a partial patch body merged
  over current settings (mirrors `session-archive.ts`).
- **Runtime wiring** (`start-server-runtime.ts`): construct the settings service;
  pass it to `createTaskExecutionService`; expose on `RuntimeContext` for the
  route.
- **Execution service** (`task-execution-service.ts`): build a cached resolver
  (~10s TTL, error-safe) over the settings service and pass it to
  `createTaskRunMonitorService`; add the `abortSession` hook (wrapping the
  existing best-effort `abortTaskRunConversation`).

### Frontend (`SettingsPage.tsx`)

- Add a "Task execution" section with two numeric (minutes) inputs bound to
  `GET`/`PUT /api/task-run-monitor/settings`, following the existing
  File-Manager/Artifact-Sharing section pattern (query + save + error state).
- Brief helper text: max lifetime is the hard cap; no-progress is the stall
  cutoff (0 disables).

### Docs

- Update `docs/runbooks/opencode-task-reliability.md`: document the
  `monitor_stalled` error stage, the two settings, and the silent-OpenCode-stall
  signature (loop stops, no `exiting loop`).

## Phases

1. **Monitor stall detection** — handle fields, progress signature,
   `finalizeStalled`, `abortSession` hook, static `noProgressMs` config default.
   Tests: stall fires after no-progress window; new messages reset the timer;
   `monitor_stalled` shape; cancelled/terminal runs not overwritten; abort
   invoked; `0` disables.
2. **Configurable timeouts** — shared schema, settings service, route, runtime
   wiring, cached resolver feeding the monitor. Tests: service round-trip, route
   GET/PUT patch-merge, resolver maps minutes→ms and survives read errors,
   monitor honors updated values at runtime.
3. **Frontend settings section** — Settings UI + test.
4. **Docs** — runbook update.

## Verification

- `pnpm --filter @cc/backend typecheck && lint && vitest` green; full suite green.
- New backend tests above. Frontend `SettingsPage.test.tsx` updated.
- Manual: set no-progress to 1 min, start a task, confirm a wedged/quiet session
  finalizes as `monitor_stalled` (not after 6h), and a healthy task still
  completes normally.

## Rollout

- Default no-progress 30m, max lifetime 6h preserve current behavior except for
  the new, faster stall cutoff. Operators can tune both live from Settings; set
  no-progress to 0 to disable stall detection for unusually long silent tasks.
