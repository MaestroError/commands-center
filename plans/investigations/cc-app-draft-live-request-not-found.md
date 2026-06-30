# Investigation: `cc_app_draft_*` tool fails with "Tool execution aborted" / "Live request not found"

**Status:** Open — awaiting next occurrence to capture logs.
**First reported:** 2026-06-30 (operator: revaz). Failed twice in a row on a VPS deployment.
**Tools involved:** `cc_app_draft_specialist_update` (also a `Review task template` draft form was visible in the same session — likely `cc_app_draft_task_update` / a self-task draft).

## Symptoms (from operator screenshots)

- Operator opens a draft review form (e.g. "Review specialist update", "Review task template") and clicks **Apply**.
- Form shows **"Live request not found."**
- Returning to chat shows the tool call `cc_app_draft_specialist_update` with **Status: Error**, body **"Tool execution aborted"**, the turn marked **"Interrupted"**, and the assistant message **"Message failed to send / Aborted"**.
- Reproduced **twice in a row**, **only on the VPS** (not seen locally).

## Code facts established

- **Live requests are in-memory only.** `createLiveRequestService` stores them in a plain `Map` with no persistence — `packages/backend/src/services/live-request-service.ts:30`. They do not survive a backend restart (`dispose()` rejects all in-flight, `:113`).
- **"Live request not found" is thrown in exactly these situations** (`getRequest`, `:123-128`): the record is absent, or `record.request.conversationId !== conversationId`.
- **The Map record is removed only by:**
  1. Operator cancel (cancel route) — `packages/backend/src/routes/live-requests.ts:62`.
  2. `dispose()` on server shutdown — `packages/backend/src/lib/start-server-runtime.ts:298`.
  3. The **30-minute timeout** — `live-request-service.ts:25` (`DEFAULT_TIMEOUT_MS = 30 * 60 * 1000`), fires at `:44-51`, deletes the record and publishes `cc.live_request.cancelled`.
  4. A successful `resolve()`.
- **Nothing tears down a live request when the agent turn is interrupted/aborted.** Grepped all `cancel()`/`dispose()` callers — there is no "turn aborted → cancel its forms" path. So **"Tool execution aborted" did not delete the request**; the abort and the not-found are independent symptoms.
- **The MCP tool call is loopback** (`http://127.0.0.1:<port>/...`) — `packages/backend/src/mcp/cc-managed/workspace-entry-service.ts:106`. A public reverse proxy therefore does **not** sit on the agent↔backend path, but **does** sit on the browser↔backend **SSE** stream.
- **The frontend resolves with `state.conversation.id`, not the live request's own `conversationId`** — `packages/frontend/src/hooks/use-conversation.ts:603-606`. A divergence here yields a deterministic "not found" (causes #4 above). In the reported case the form _did_ appear in the chat, implying the ids matched at open time, so this is a secondary suspect.
- **Timeout settings are NOT the cause.** `cc_app` has no explicit `toolCallTimeoutMs`; being `interactive` it resolves to the 30-min interactive window (`workspace-entry-service.ts:13,94-104`), matching the live-request TTL. Both are 30 min.

## Leading hypothesis

A **stale / zombie form**: the operator's browser SSE connection dropped (reverse-proxy idle timeout, network blip, laptop sleep), so the tab never received the `cc.live_request.cancelled` event and kept showing the form after the backend had already removed the request (via the 30-min timeout or a restart). Clicking Apply then 404s. This reproduces reliably and is VPS-only (no proxy locally) without requiring a literal double crash.

The separate **"Tool execution aborted"** on the agent side is still unexplained from code alone (the loopback MCP call is not behind the proxy, and turn-abort does not clean up live requests) — needs runtime logs to confirm what aborted the opencode turn.

## Disambiguating question (ask operator next time)

**How long was the form open before Apply was clicked?**

- Tens of minutes / stepped away → the 30-minute live-request timeout. Mundane, expected.
- A minute or two → the record vanished early → points to a backend restart/crash → get process logs.

## What to capture on next occurrence

- Wall-clock time of the failure, then check backend restart history in that window: `journalctl -u <backend-service>`, `pm2 describe <app>` (restart count/uptime), or `docker inspect <container> --format '{{.RestartCount}}'` + logs for OOMKilled.
- Reverse-proxy config for SSE-hostile defaults: nginx `proxy_read_timeout` (default 60s), `proxy_buffering off` on the SSE route, Cloudflare's ~100s cap.
- Browser devtools Network tab: whether the SSE/EventStream connection shows failed/closed while the form is up.

## Potential fixes (deferred until root cause confirmed)

1. Stabilize the VPS backend process if it is crash/OOM-looping.
2. Frontend: on a resolve 404, show "this review expired — ask the agent to re-draft" instead of leaving an Apply button that silently fails.
3. Persist live requests (or detect restart and proactively cancel orphaned forms) so a bounce does not strand an operator mid-review.
4. Reconnecting SSE should re-fetch active live requests so a dropped stream cannot leave a zombie form on screen.
