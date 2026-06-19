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

## Expected CommandsCenter Behavior

- Long-running task prompts should be started asynchronously.
- Running tasks should be finalized by the monitor after OpenCode settles.
- Short local OpenCode transport failures should retry without duplicating an
  accepted prompt.
- Queued task runs should stay queued while OpenCode is unhealthy.
- `/api/health` should report `degraded` when OpenCode is unhealthy while the
  CommandsCenter API remains available.
