# Interactive template creation times out after a successful Apply

**Reported:** `cc_default_interactive_draft_self_task_template` reports failure even
though the template is created.

- Operator opens the review form, clicks **Apply**; the template is created and the
  tab closes.
- The tool keeps running and eventually returns `MCP error -32001: Request timed out`.
- A later attempt instead returns
  `MCP error -32602: Structured content does not match the tool's output schema:
data must have required property 'id' … data must NOT have additional properties`.
- Retrying after either failure creates duplicate templates, because the underlying
  operation already succeeded.

## Root cause

Two independent defects, both visible in the report.

### 1. The review form outlives the caller, and nothing tells the tool

While `draft_self_task_template` waits, two clocks run:

| Clock                                                                                                            | Value before this change |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------ |
| MCP tool-call timeout for `cc_default_interactive` (published as `timeout` in the specialist's `opencode.jsonc`) | 10 min                   |
| Live-request TTL (`DEFAULT_TIMEOUT_MS`, `live-request-service.ts`)                                               | 30 min                   |

Nothing reconciled them. When the client's timeout expires it rejects the call with
`-32001` and sends `notifications/cancelled` — but that notification is a **new HTTP
request**, and `cc-managed/service.ts` builds a fresh stateless `McpServer` +
transport per request, so the cancellation lands on an instance that knows nothing
about the in-flight call. The handler keeps waiting on a form that is still live for
another 20 minutes.

A late Apply therefore does the real work — `createTemplate` runs, the operator sees
the template, the tab closes — and the result is written to a stream nobody is
reading. The agent only ever sees the timeout, so a retry creates a duplicate. This
is the reported symptom exactly.

The same mismatch applied to every operator-blocking tool (`draft_self_task*`, the
`cc_app` `draft_*` tools, the specialist removal confirmation, and the custom-tool
copy conflict prompt).

### 2. Error results violate the tool's own output schema

`executeTool` returned `structuredContent: { error: { message } }` on failure while the
tool declares `outputSchema: mcpTaskTemplateSchema`. The MCP **client** validates
`structuredContent` against the cached output schema even when `isError` is set
(`client/index.js`: it skips only the "missing structuredContent" check for errors),
so the payload is rejected with `-32602 … must have required property 'id' … must NOT
have additional properties`, and the real message never reaches the specialist. Any
error from these tools surfaced as that opaque schema complaint. `show_file_to_user`
already had the correct shape (text content only).

### 3. The review form could stay invisible until a page reload

Two independent ways the operator lost sight of a form the specialist was blocking on
— which then burned the wait budget from defect 1:

- **A missed publish was never recovered.** `liveRequestService.publish` delivers to
  whoever is subscribed at that instant; there is no replay log. A stream that connects
  afterwards — the first load after the form opened, or any reconnect — never learned
  about it. The client's `getPendingInteractions` fetch covered part of this, but it
  runs _before_ the server registers the subscription, so anything opened in between
  fell through both.
- **A conversation refetch wiped it.** `HYDRATE`/`HYDRATE_DETAIL` reset
  `pendingPermissions`, `pendingQuestion`, `liveRequests`, and `todos` to empty. Those
  are live backend state keyed by the conversation, not part of the detail payload, so
  re-fetching the _same_ conversation dropped an open form (or a permission prompt)
  from the UI with nothing to bring it back but a reload.

### 4. The caller's HTTP client hangs up on a silent stream after 5 minutes

This one was listed as an unverified suspicion; it is now measured, and it is real.

opencode ships as a Bun binary, and `BUN_BE_BUN=1 <opencode> script.js` runs it as the
plain Bun runtime — so the exact client can be tested. Against a server that sends SSE
headers and then nothing (what our transport does while a tool blocks — hono flushes the
headers when the stream has produced no data yet), Bun 1.3.14 as shipped by opencode
1.17.20 aborts the fetch at **300.1 s**, identically whether or not the headers were
flushed first:

```
[B flushed ] [client] RESULT: FAILED at 300.1s — TimeoutError: The operation timed out. (code=23)
[A no-flush] [client] RESULT: FAILED at 300.1s — TimeoutError: The operation timed out. (code=23)
```

Nothing tells the server. It keeps waiting, the operator clicks Apply, the template is
created, and the result is written to a socket the client abandoned minutes earlier —
the specialist sees only `-32001` once its own tool-call timeout expires. That is the
reported bug end to end, and it means the 9-minute review budget from defect 1 was not
by itself enough: **any review that took longer than five minutes still failed.**

The MCP path is loopback (`127.0.0.1`), so no reverse proxy is involved — this is the
client's own limit.

### Contributing: workspace sync could leave a stale timeout

`isConfigUpToDate` compared only `url`, `enabled`, and the `Authorization` header, so a
changed (or missing) `timeout` never triggered a rewrite. A workspace left without it
falls back to the MCP SDK's 60 s default, which cuts these tools off long before the
operator can finish reviewing.

## Fix

- **`mcp/cc-managed/live-request-timeouts.ts` (new)** — single source of truth for the
  interactive tool-call timeouts plus `blockingWaitBudgetMs()`, which subtracts a
  1-minute margin so a blocking wait always ends before its caller gives up.
- **Every operator review is now bounded by that budget**: 9 min for
  `cc_default_interactive`, 29 min for `cc_app`. When it expires the form is cancelled
  in the UI, the tool returns "the operator did not submit the review form in time, so
  nothing was created or changed", and a late Apply gets a plain "not found" instead of
  silently creating a second template. `run_self_task`'s poll deadline uses the same
  budget instead of a hardcoded 9 min.
- **Error results carry no `structuredContent`** in the cc-managed tool groups and in
  the public MCP registry, so the actual message reaches the caller.
- **`isConfigUpToDate` compares `timeout`**, so a workspace can no longer sit on a stale
  or missing tool-call timeout.
- **The conversation event stream replays open live requests on connect**
  (`routes/conversation-events.ts`), and subscribes _before_ announcing `connected` so
  nothing published in between is dropped. Delivery is at-least-once; the client applies
  by id, so a duplicate is a no-op. Any stream — first load or reconnect — now sees every
  open form without depending on a client-side fetch winning a race.
- **`HYDRATE`/`HYDRATE_DETAIL` keep pending interactions when the conversation id is
  unchanged** (`liveInteractionState`), and clear them only on a real switch. This covers
  permission prompts and questions too, which had the same disappearing-prompt failure.
- **Every tool call now beats on its own response stream every 30 s**
  (`mcp/cc-managed/stream-keepalive.ts`, wired once at the `registerTool` boundary in
  `service.ts`). The SDK routes `extra.sendNotification` to this request's stream via
  `relatedRequestId`, so the body never goes idle long enough for the 300 s cap; a client
  with no handler for `notifications/message` drops it silently. The server declares the
  `logging` capability, which the SDK requires before it will send one. Beats are
  best-effort: once the stream is gone the send throws and the heartbeat stands down
  without disturbing the call. Quick tools never emit one — they finish long before the
  first beat is due.

## Verification

**Defect 2 is reproduced and proven fixed.** `test/routes/cc-managed-mcp.test.ts` now
drives a real MCP SDK `Client` over HTTP against the real route (not `server.inject`,
because the failure is client-side). With the old error shape restored, the test fails
with the reported error verbatim:

```
MCP error -32602: Structured content does not match the tool's output schema:
data must have required property 'id', … data must NOT have additional properties
```

With the fix it returns `isError: true` and the actual message ("Task not found.").

**Defect 1 is covered at the unit level only.** Tests assert that each review form is
created with a `timeoutMs` strictly below its group's tool-call timeout
(`cc_default_interactive` and `cc_app`), that an expired form creates nothing and says
so, and that workspace sync rewrites a config whose `timeout` went stale. The causal
chain (client abandons at its timeout → cancellation is discarded → late Apply writes
into a dead stream) is established from the SDK and transport source, **not** from an
observed live failure. Nothing here reproduces a real `-32001`.

**Defect 3 is reproduced and proven fixed, both halves.** `test/routes/sse-events.test.ts`
opens a live request with nobody listening, then connects a real SSE client over a real
socket and reads until `cc.live_request.opened`; before the replay it times out after
5 s. `use-conversation.test.ts` asserts a same-conversation `HYDRATE_DETAIL` keeps the
live request, permission, and question (it dropped them before), and that a switch to a
different conversation still clears them.

**Defect 4 is measured, and the fix is verified three ways.** The 300 s cap above came from
driving the shipped runtime directly. Re-running that same client against a server that
beats every 30 s, the connection that previously died at 300.1 s instead sailed past it
and took delivery at 600 s:

```
[client] CHUNK at 300.0s: … notifications/message …
[client] CHUNK at 600.0s: data: {"jsonrpc":"2.0","id":1,"result":{"late":true}}
[client] RESULT: survived the silent body
```

For the fix in this codebase,
`test/mcp/cc-managed/stream-keepalive.test.ts` stands up the real service on a real
socket, connects a real MCP `Client`, and asserts `notifications/message` arrive **while
the tool call is still outstanding** — bytes after the result would not have kept the
socket alive. Removing the keepalive from `service.ts` makes that test time out. Fake-timer
unit tests cover the heartbeat stopping when the call settles and standing down (without
failing the call) once the stream is gone.

Whole suite: 1367 backend + 1496 frontend tests, plus typecheck, eslint, knip, prettier.

## Remaining work

1. **Confirm in a live deployment.** Run the reported flow and check that Apply returns
   the template id promptly. Also check the specialist's `opencode.jsonc` really carries
   `mcp.cc_default_interactive.timeout === 600000` — a restart is needed for the sync
   fix to take effect, since opencode reads that config at startup.
2. **A form still goes to the specialist's _current_ chat conversation**
   (`resolveCurrent`). An operator reading an older conversation from history sees no
   tab, and no reload helps, because the form belongs to a conversation they are not
   viewing. Surfacing "a review is waiting in <conversation>" globally would close that
   gap; not attempted here.
3. **Client cancellation still cannot reach a running tool**: the stateless per-request
   server means `notifications/cancelled` has nowhere to land. Bounding the wait removes
   the damage (nothing is applied behind the caller's back), but a tool already inside
   `createTemplate` when the caller gives up still completes. Making cancellation
   observable would require session-scoped MCP server instances.
4. **Frontend affordance:** a resolve that 404s (expired form) should say "this review
   expired — ask the agent to re-draft" rather than leaving an Apply button that fails.
5. **The keepalive interval is tied to one measured number.** 30 s against a 300 s cap
   leaves wide margin, but the cap is Bun's, not a protocol guarantee: a future runtime
   could lower it. `scratchpad/idle-client.js` in this investigation re-measures it in one
   command (`BUN_BE_BUN=1 <opencode binary> idle-client.js`) if interactive tools ever
   start timing out again after an opencode upgrade.

See also `plans/investigations/cc-app-draft-live-request-not-found.md` for the related
"Live request not found" reports.
