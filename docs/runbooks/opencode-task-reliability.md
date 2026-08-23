# OpenCode Task Reliability Runbook

Use this checklist when CommandsCenter task runs report local transport errors
such as `fetch failed`, when queued runs stop progressing, or when OpenCode
health looks unstable.

## Quick Triage

```bash
date
systemctl status commandscenter --no-pager
curl -sS -m 2 http://127.0.0.1:4100/global/health
ps -eo pid,ppid,etime,stat,%cpu,%mem,cmd | grep -E 'opencode|ccenter' | grep -v grep
ss -ltnp | grep ':4100'
```

Read recent OpenCode logs:

```bash
tail -n 300 /root/.local/share/opencode/log/opencode.log
grep -Ei 'level=Error|stream error|process|timeout|aborted|fetch|ECONN|session.id|messageID' \
  /root/.local/share/opencode/log/opencode.log | tail -n 200
```

Inspect recent task runs:

```bash
sqlite3 /root/.cc/data/cc.db \
  "select id,status,error_message,error_details_json,opencode_session_id,started_at,completed_at from task_runs order by created_at desc limit 10;"
```

Inspect recent CommandsCenter service logs:

```bash
journalctl -u commandscenter --since "10 minutes ago" -o cat --no-pager \
  | grep -Ei 'runtime drain|SIGTERM|opencode stopped|opencode exited|opencode engine is healthy|health check failed|ECONNREFUSED|request timed out|starting opencode|deferred queued task'
```

## Enable Richer OpenCode Logs

For richer OpenCode logs in `journalctl`, set these environment variables for
the CommandsCenter service:

```bash
OPENCODE_PRINT_LOGS=1
OPENCODE_LOG_LEVEL=DEBUG
```

Restart the service after changing its environment.

## What To Distinguish

Use the checks above to separate these cases:

- OpenCode process is missing.
- OpenCode process exists but is not listening on port `4100`.
- OpenCode is listening but `/global/health` hangs or reports unhealthy.
- OpenCode is still running a task after CommandsCenter lost a local HTTP
  request.
- CommandsCenter is draining or systemd is restarting it.
- The task failed on model/provider behavior rather than local transport.
- OpenCode's agent loop wedged mid-session: its log shows the session do a few
  `step=` entries and then go silent with **no** `message="exiting loop"`, while
  `/global/health` stays healthy. The session stops producing new messages even
  though it may still report `busy`.

## OpenAI Response Header Timeout

`Provider response headers timed out after 10000ms` means OpenAI did not return
response headers before its provider deadline. It does not establish that a PDF
export, tool call, or CommandsCenter failed. Long image- or tool-heavy chats can
need more provider processing time before OpenAI responds.

Switching OpenAI models does not change that provider timeout, and restarting
CommandsCenter or OpenCode alone reloads the same persisted chat context without
reducing it. Apply the managed workspace configuration update, then restart or
reload OpenCode so it reads the bounded 60-second header timeout. For a chat
already affected, compact the conversation if compaction can complete, or start
a fresh chat when preserving its current context is not required.

## Task Run Monitor Timeouts

A `running` task is finalized by the async monitor through one of:

- **No-progress (stall) timeout** — OpenCode produced no new messages within the
  window. The monitor best-effort aborts the wedged session and **cancels** the
  run (status `cancelled`) with a `cancellationReason` like
  `Automatically cancelled: OpenCode produced no new output for N minute(s) (stall
timeout); session ses_...`. This is the wedged agent-loop case above. If
  **requeue after stall** is enabled, a fresh run of the same task/subtask is
  queued automatically (the cancelled run is kept as history; the new run gets a
  clean session and carries `triggerMetadata.requeueReason = "stall_timeout"`).
- `stage: "monitor_timeout"` (`errorName: TaskRunMonitorTimeout`, status `error`)
  — the run exceeded the **max run lifetime** hard cap.

These are operator-configurable (no restart required), live under
**Settings → Tasks**, or via the API:

```bash
curl -sS http://127.0.0.1:3000/api/task-run-monitor/settings
curl -sS -X PUT http://127.0.0.1:3000/api/task-run-monitor/settings \
  -H 'Content-Type: application/json' \
  -d '{"taskRunMonitorNoProgressTimeoutMinutes":30,"taskRunMonitorMaxLifetimeMinutes":360,"taskRunMonitorRequeueAfterStall":false,"taskRunMonitorRequeueLimit":10}'
```

Defaults: no-progress `30` minutes (set `0` to disable stall detection), max
lifetime `360` minutes, requeue-after-stall `false`, requeue limit `10`.
Persisted in `<preferences>/task-run-monitor.json`. With requeue enabled, a task
that keeps stalling is requeued at most `taskRunMonitorRequeueLimit` times
(tracked via `triggerMetadata.requeueCount`); the final cancellation reason then
notes `Requeue limit (N) reached`.

## Expected CommandsCenter Behavior

- Long-running task prompts should be started asynchronously.
- Running tasks should be finalized by the monitor after OpenCode settles.
- A run whose OpenCode session stops making progress should be cancelled within
  the no-progress timeout (and optionally requeued), not held until the
  max-lifetime cap.
- Short local OpenCode transport failures should retry without duplicating an
  accepted prompt.
- Queued task runs should stay queued while OpenCode is unhealthy.
- `/api/health` should report `degraded` when OpenCode is unhealthy while the
  CommandsCenter API remains available.
