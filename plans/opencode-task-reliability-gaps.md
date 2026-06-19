# Plan: OpenCode Task Reliability — Follow-up Gaps

**Status:** Complete.

Follow-up to `plans/opencode-task-reliability.md`. The 9-phase reliability work is
complete and the goal (decoupling task success from a single long-lived HTTP
request) is reached. This plan closes the remaining minor gaps found during the
implementation audit. None of these affect the reliability guarantee; they
reconcile the implementation with decisions recorded in the original plan's
resolved Open Questions.

## Completion Audit

- Gap 1 (split monitor): the async monitor/finalizer is now its own
  `task-run-monitor-service.ts`, with shared pure helpers + the local-transport
  retry factory in `task-run-support.ts`. `task-execution-service.ts` keeps
  queueing/drain/cancel and drives the monitor through injected hooks
  (`handleTerminalRun`, `queueFallbackRun`). No behavior change; all existing
  monitor tests stayed green against the new seam.
- Gap 2 (`waiting_for_opencode` substate): `taskRunSchema` gained an optional
  `runtimeState` enum, derived at read time in `task-service.mapTaskRun` from a
  `running` status plus persisted `opencodeMonitor` metadata. No migration, no
  monitor lifecycle changes, no stale-state risk.

## Gap 1: Split the monitor into its own service

**Decision of record:** Open Question #1 ("keep monitors in
`task-execution-service.ts` or split into `task-run-monitor-service.ts`?") was
resolved **"Split"**. The implementation kept everything in
`task-execution-service.ts`, which is now ~1.8k lines.

### Implementation

- Extract the async monitor/finalizer into
  `packages/backend/src/services/task-run-monitor-service.ts`:
  - the monitor registry (`Map<runId, monitorHandle>`), lifecycle
    (`startTaskRunMonitor`, `stopTaskRunMonitor`, `dispose`), polling loop, and
    the finalizers (`finalizeTaskRunCompletion`, `finalizeTaskRunModelError`,
    `finalizeTaskRunMonitorTimeout`, `ensureOpencodeMonitorMetadata`).
  - the local-transport retry helper (`retryLocalOpenCodeCall` and its
    classifier) if it is only used by monitor/start paths, or keep it shared.
- Inject the collaborators the monitor needs (taskService, conversationService,
  logger, monitor config, terminal-completion callback) rather than reaching back
  into the execution service.
- `task-execution-service.ts` keeps queueing/drain/cancel and calls into the
  monitor service through a small interface.
- Keep the monitor metadata helpers (`readOptionalOpencodeMonitorMetadata`,
  `mergeOpencodeMonitorMetadata`) wherever both services can share them.

### Verification

- Move the monitor-focused tests into a `task-run-monitor-service.test.ts` (or
  keep them green against the new seam) — no behavior change expected.
- Confirm `dispose()` wiring in `server.ts` and `start-server-runtime.ts` still
  stops monitor timers.
- `typecheck`, `lint`, full backend suite stay green.

### Non-Goals

- No behavior change. This is a structural refactor only.

## Gap 2: Expose a `waiting_for_opencode` running substate

**Decision of record:** Open Question #2 ("show a running substate like
`waiting_for_opencode`, or are logs enough?") was resolved
**"waiting_for_opencode"**. The implementation surfaces monitor progress through
logs only.

### Implementation

- Add an optional substate field for running task runs (e.g.
  `runtimeState: "waiting_for_opencode" | "monitoring_opencode"`), stored in
  `triggerMetadata.opencodeMonitor` to avoid a migration, or as a first-class
  column only if it needs querying.
- Set it when the async prompt is accepted and the monitor begins polling; clear
  it on terminal completion.
- Surface it through the existing task-run read/serialization path so the UI can
  distinguish "queued" from "running but waiting on OpenCode".

### Verification

- Unit test: a run with an accepted prompt and an active monitor reports the
  substate while `running`, and the substate is absent once terminal.
- Confirm existing task-run public fields are unchanged for non-async callers.

## Already closed in the audit session

- **Monitor metadata recovery:** `pollTaskRunMonitor` no longer throws when a run
  reaches the monitor without persisted `opencodeMonitor` metadata (startup
  resume / duplicate-start). It reconstructs conservative metadata via
  `ensureOpencodeMonitorMetadata`. Covered by a new regression test.
- **Status-unavailable settle guard:** when an OpenCode status read fails, the
  monitor no longer advances idle-settle detection; it keeps polling with backoff
  so a stale assistant message cannot prematurely complete a still-busy run.
- **Accurate attempted model on recovery:** `resumeAcceptedPromptRun` stores an
  explicit `"unknown"` sentinel instead of guessing `run.model`, keeping later
  provider-error fallback selection accurate.
- **Resume coverage:** added `resumeRunningTaskRuns` tests for both the
  resume-with-session and requeue-without-session branches.
